/**
 * C007 — Mike as an MCP server (adapted from Harvey's M365 Copilot/Cowork
 * integration). External agent hosts (Claude, Cowork, Copilot Studio) call
 * Mike's legal tools over Streamable-HTTP MCP (JSON-RPC 2.0), authenticated
 * with a per-user personal access token (user_pats, sha256-hashed).
 * Read-mostly allowlist; every call is audit-logged and cost-tracked.
 */
import crypto from "crypto";
import { Router } from "express";
import { createServerSupabase } from "../lib/supabase";
import { searchKnowledge, formatKnowledgeForModel } from "../lib/knowledgeBase";
import { listPlaybooks, getPlaybook, formatPlaybookForModel } from "../lib/playbooks";
import { searchClauses, formatClausesForModel } from "../lib/clauses";
import { validateJadeCitation, formatAGLC4Citation } from "../lib/jade";
import { runAssertionVerification } from "../lib/verification/assertionCheck";
import { getUserApiKeys } from "../lib/userApiKeys";
import { recordAudit } from "../lib/audit";

export const mcpServerRouter = Router();

type Db = ReturnType<typeof createServerSupabase>;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function userFromPat(req: { headers: Record<string, unknown> }, db: Db) {
  const auth = String(req.headers["authorization"] ?? "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  const { data } = await db
    .from("user_pats")
    .select("id, user_id, revoked_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  void db
    .from("user_pats")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});
  return data.user_id as string;
}

const MCP_TOOLS = [
  {
    name: "search_knowledge",
    description:
      "Search the user's private Mike knowledge base (Library documents) for relevant passages.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        k: { type: "integer" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_playbooks",
    description: "List the user's negotiation playbooks.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "review_against_playbook",
    description:
      "Fetch a named playbook's positions (for reviewing a contract against them).",
    inputSchema: {
      type: "object",
      properties: { playbook_name: { type: "string" } },
      required: ["playbook_name"],
    },
  },
  {
    name: "search_clauses",
    description: "Search the user's preferred-clause library (My Clauses).",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, k: { type: "integer" } },
      required: ["query"],
    },
  },
  {
    name: "jade_validate_citation",
    description:
      "Validate an Australian Medium Neutral Citation (e.g. [2024] HCA 5) against Jade.io.",
    inputSchema: {
      type: "object",
      properties: { citation: { type: "string" } },
      required: ["citation"],
    },
  },
  {
    name: "jade_format_citation",
    description: "Format Australian case details as an AGLC4 citation.",
    inputSchema: {
      type: "object",
      properties: {
        case_name: { type: "string" },
        neutral_citation: { type: "string", description: "e.g. [2024] HCA 5" },
        reported_citation: { type: "string" },
        pinpoint: { type: "string" },
      },
      required: ["case_name"],
    },
  },
  {
    name: "verify_assertions",
    description:
      "Deep-verify a passage: extract assertion+citation pairs and check them (Jade existence; content-check when enabled).",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
  },
];

async function callTool(
  db: Db,
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const apiKeys = await getUserApiKeys(userId, db);
  switch (name) {
    case "search_knowledge": {
      const hits = await searchKnowledge({
        db,
        ownerId: userId,
        query: String(args.query ?? ""),
        k: typeof args.k === "number" ? args.k : undefined,
        docType: null,
        apiKeys,
      });
      return formatKnowledgeForModel(String(args.query ?? ""), hits);
    }
    case "list_playbooks": {
      const pbs = await listPlaybooks(db, userId);
      return pbs.length
        ? pbs
            .map(
              (p) =>
                `- ${p.name}${p.agreement_type ? ` (${p.agreement_type})` : ""}`,
            )
            .join("\n")
        : "No playbooks defined.";
    }
    case "review_against_playbook": {
      const pb = await getPlaybook(db, userId, String(args.playbook_name ?? ""));
      return pb ? formatPlaybookForModel(pb) : "Playbook not found.";
    }
    case "search_clauses": {
      const clauses = await searchClauses(db, userId, String(args.query ?? ""), {
        k: typeof args.k === "number" ? args.k : undefined,
        apiKeys,
      });
      return formatClausesForModel(String(args.query ?? ""), clauses);
    }
    case "jade_validate_citation": {
      const result = await validateJadeCitation(String(args.citation ?? ""));
      return JSON.stringify(result);
    }
    case "jade_format_citation": {
      return formatAGLC4Citation({
        caseName: String(args.case_name ?? ""),
        neutralCitation: args.neutral_citation
          ? String(args.neutral_citation)
          : undefined,
        reportedCitation: args.reported_citation
          ? String(args.reported_citation)
          : undefined,
        pinpoint: args.pinpoint ? String(args.pinpoint) : undefined,
      });
    }
    case "verify_assertions": {
      const outcome = await runAssertionVerification({
        db,
        userId,
        text: String(args.text ?? ""),
        sourceKind: "text",
        apiKeys,
      });
      return JSON.stringify(outcome);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Streamable-HTTP MCP endpoint (JSON-RPC 2.0 over POST).
mcpServerRouter.post("/", async (req, res) => {
  const db = createServerSupabase();
  const userId = await userFromPat(
    req as unknown as { headers: Record<string, unknown> },
    db,
  );
  if (!userId)
    return void res.status(401).json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32001, message: "Invalid or missing personal access token" },
    });

  const body = req.body as {
    jsonrpc?: string;
    id?: number | string | null;
    method?: string;
    params?: Record<string, unknown>;
  };
  const id = body.id ?? null;
  const reply = (result: unknown) =>
    res.json({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string) =>
    res.json({ jsonrpc: "2.0", id, error: { code, message } });

  try {
    switch (body.method) {
      case "initialize":
        return void reply({
          protocolVersion: "2025-03-26",
          serverInfo: { name: "mike-australia", version: "1.0.0" },
          capabilities: { tools: {} },
        });
      case "notifications/initialized":
        return void res.status(202).end();
      case "ping":
        return void reply({});
      case "tools/list":
        return void reply({ tools: MCP_TOOLS });
      case "tools/call": {
        const params = body.params ?? {};
        const name = String(params.name ?? "");
        const args =
          params.arguments && typeof params.arguments === "object"
            ? (params.arguments as Record<string, unknown>)
            : {};
        recordAudit({
          actorId: userId,
          eventType: "tool_call",
          toolName: `mcp_server:${name}`,
          detail: { via: "mcp-server" },
        });
        const text = await callTool(db, userId, name, args);
        return void reply({ content: [{ type: "text", text }] });
      }
      default:
        return void fail(-32601, `Method not found: ${body.method}`);
    }
  } catch (err) {
    return void fail(
      -32000,
      err instanceof Error ? err.message : "Internal error",
    );
  }
});
