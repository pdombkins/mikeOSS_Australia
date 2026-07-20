/**
 * Generic OpenAI-compatible *chat-completions* streaming client.
 *
 * Used for the Moonshot/Kimi provider (and any future self-hosted
 * OpenAI-compatible endpoint, e.g. vLLM/SGLang serving open weights).
 * Self-host preferred: if KIMI_BASE_URL is set it wins over the hosted
 * Moonshot API (https://api.moonshot.ai/v1). `openai.ts` (Responses API)
 * is deliberately untouched.
 */

import type {
  LlmMessage,
  NormalizedToolCall,
  StreamChatParams,
  StreamChatResult,
} from "./types";
import { kimiBaseUrl, kimiSelfHosted } from "./models";
import { createRawLlmStreamRecorder, logRawLlmStream } from "./rawStreamLog";

// ---------------------------------------------------------------------------
// Wire types (OpenAI chat-completions subset)
// ---------------------------------------------------------------------------

type ChatToolCall = {
  index?: number;
  id?: string;
  type?: "function";
  function?: { name?: string; arguments?: string };
};

type ChatMessageParam =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

type StreamChunk = {
  choices?: {
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: ChatToolCall[];
    };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  error?: { message?: string; code?: string | number } | null;
};

function moonshotApiKey(override?: string | null): string {
  const key =
    override?.trim() || process.env.MOONSHOT_API_KEY?.trim() || "";
  if (!key && !kimiSelfHosted()) {
    throw new Error(
      "Moonshot API key is not configured. Set MOONSHOT_API_KEY, add a user Moonshot key, or set KIMI_BASE_URL for a self-hosted endpoint.",
    );
  }
  // Self-hosted endpoints (vLLM etc.) usually accept any bearer token.
  return key || "self-hosted";
}

/** Model id sent over the wire (self-hosted deployments may serve a
 *  different name, e.g. a local path — override via KIMI_MODEL). */
function wireModel(model: string): string {
  return process.env.KIMI_MODEL?.trim() || model;
}

function toWireMessages(
  systemPrompt: string,
  messages: LlmMessage[],
): ChatMessageParam[] {
  const wire: ChatMessageParam[] = [];
  if (systemPrompt) wire.push({ role: "system", content: systemPrompt });
  for (const m of messages) {
    wire.push({ role: m.role, content: m.content });
  }
  return wire;
}

function abortError(): Error {
  const err = new Error("Request aborted");
  err.name = "AbortError";
  return err;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

// ---------------------------------------------------------------------------
// Streaming loop
// ---------------------------------------------------------------------------

export async function streamOpenAICompat(
  params: StreamChatParams,
): Promise<StreamChatResult> {
  const {
    model,
    systemPrompt,
    tools = [],
    callbacks = {},
    runTools,
  } = params;
  const maxIter = params.maxIterations ?? 10;
  const baseUrl = kimiBaseUrl().replace(/\/+$/, "");
  const key = moonshotApiKey(params.apiKeys?.moonshot);
  const rawStreamRecorder = createRawLlmStreamRecorder({
    provider: "moonshot",
    model,
  });

  const wireMessages = toWireMessages(systemPrompt, params.messages);
  const wireTools = tools.length
    ? tools.map((t) => ({
        type: "function" as const,
        function: t.function,
      }))
    : undefined;

  let fullText = "";
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    throwIfAborted(params.abortSignal);

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      signal: params.abortSignal,
      body: JSON.stringify({
        model: wireModel(model),
        messages: wireMessages,
        tools: wireTools,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });

    if (!res.ok || !res.body) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as {
          error?: { message?: string };
        };
        if (body?.error?.message) detail = body.error.message;
      } catch {
        /* keep HTTP status */
      }
      throw new Error(`Kimi/Moonshot error: ${detail}`);
    }

    // Per-iteration accumulators.
    const textParts: string[] = [];
    let sawReasoning = false;
    const callAccum = new Map<
      number,
      { id: string; name: string; args: string }
    >();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        throwIfAborted(params.abortSignal);
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          let chunk: StreamChunk;
          try {
            chunk = JSON.parse(payload) as StreamChunk;
          } catch {
            continue;
          }
          logRawLlmStream({
            provider: "moonshot",
            model,
            iteration: iter,
            label: "chunk",
            payload: chunk,
          });
          rawStreamRecorder?.record({
            iteration: iter,
            label: "chunk",
            payload: chunk,
          });
          if (chunk.error?.message) {
            throw new Error(`Kimi/Moonshot error: ${chunk.error.message}`);
          }
          if (chunk.usage) {
            if (typeof chunk.usage.prompt_tokens === "number") {
              totalInputTokens += chunk.usage.prompt_tokens;
            }
            if (typeof chunk.usage.completion_tokens === "number") {
              totalOutputTokens += chunk.usage.completion_tokens;
            }
          }
          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;
          if (delta.reasoning_content) {
            sawReasoning = true;
            callbacks.onReasoningDelta?.(delta.reasoning_content);
          }
          if (delta.content) {
            if (sawReasoning) {
              callbacks.onReasoningBlockEnd?.();
              sawReasoning = false;
            }
            textParts.push(delta.content);
            callbacks.onContentDelta?.(delta.content);
          }
          for (const tc of delta.tool_calls ?? []) {
            const idx = tc.index ?? 0;
            const entry = callAccum.get(idx) ?? {
              id: "",
              name: "",
              args: "",
            };
            if (tc.id) entry.id = tc.id;
            if (tc.function?.name) entry.name += tc.function.name;
            if (tc.function?.arguments) entry.args += tc.function.arguments;
            callAccum.set(idx, entry);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    if (sawReasoning) callbacks.onReasoningBlockEnd?.();

    const iterText = textParts.join("");
    const toolCalls: NormalizedToolCall[] = [...callAccum.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([idx, c]) => {
        let input: Record<string, unknown> = {};
        try {
          input = c.args ? (JSON.parse(c.args) as Record<string, unknown>) : {};
        } catch {
          input = {};
        }
        return {
          id: c.id || `call-${iter}-${idx}`,
          name: c.name,
          input,
        };
      })
      .filter((c) => c.name);

    if (toolCalls.length === 0 || !runTools) {
      fullText += iterText;
      break;
    }

    for (const call of toolCalls) callbacks.onToolCallStart?.(call);

    // Replay the assistant turn (content + tool calls), run tools, append
    // results, and iterate.
    wireMessages.push({
      role: "assistant",
      content: iterText || null,
      tool_calls: toolCalls.map((c) => ({
        id: c.id,
        type: "function" as const,
        function: { name: c.name, arguments: JSON.stringify(c.input) },
      })),
    });
    if (iterText) fullText += iterText;

    throwIfAborted(params.abortSignal);
    const results = await runTools(toolCalls);
    for (const call of toolCalls) {
      const result = results.find((r) => r.tool_use_id === call.id);
      wireMessages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result?.content ?? "",
      });
    }
  }

  await rawStreamRecorder?.flush("completed");
  return {
    fullText,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    model,
  };
}

// ---------------------------------------------------------------------------
// One-shot completion
// ---------------------------------------------------------------------------

export async function completeOpenAICompatText(params: {
  model: string;
  systemPrompt?: string;
  user: string;
  maxTokens?: number;
  apiKeys?: { moonshot?: string | null };
}): Promise<string> {
  const baseUrl = kimiBaseUrl().replace(/\/+$/, "");
  const key = moonshotApiKey(params.apiKeys?.moonshot);
  const messages: ChatMessageParam[] = [];
  if (params.systemPrompt) {
    messages.push({ role: "system", content: params.systemPrompt });
  }
  messages.push({ role: "user", content: params.user });

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: wireModel(params.model),
      messages,
      max_tokens: params.maxTokens ?? 2048,
    }),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) detail = body.error.message;
    } catch {
      /* keep HTTP status */
    }
    throw new Error(`Kimi/Moonshot error: ${detail}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
}
