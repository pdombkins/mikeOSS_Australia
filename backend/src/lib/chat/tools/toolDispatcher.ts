import {
  getCourtlistenerCases,
  searchCourtlistenerCaseLaw,
  verifyCourtlistenerCitations,
} from "../../courtlistener";
import {
  COURTLISTENER_TOOL_NAMES,
  type CaseCitationEvent,
  type CourtlistenerToolEvent,
} from "./courtlistenerTools";
import {
  JADE_TOOL_NAMES,
  type JadeToolEvent,
  type JadeCaseCitationEvent,
} from "./jadeTools";
import {
  VERIFICATION_TOOL_NAME,
  type CitationVerificationEvent,
} from "./verificationTools";
import {
  searchJadeCases,
  searchJadeLegislation,
  fetchJadeDocument,
  formatAGLC4Citation,
} from "../../jade";
import { verifyCitation } from "../../verification";
import { recordAudit, argsDigest } from "../../audit";
import { saveClause, searchClauses, formatClausesForModel } from "../../clauses";
import {
  LIST_ITEM_KINDS,
  LIST_ITEM_STATUSES,
  LIST_ITEM_COLUMNS,
  createListItem,
  listItemsForProject,
  type ListItemKind,
  type ListItemStatus,
} from "../../lists";
import { runTabularAsk } from "../../tabularAsk";
import { runAssertionVerification } from "../../verification/assertionCheck";
import {
  searchKnowledge,
  formatKnowledgeForModel,
} from "../../knowledgeBase";
import {
  listPlaybooks,
  getPlaybook,
  formatPlaybookForModel,
} from "../../playbooks";
import { getJadeAccessApproved } from "../../appSettings";
import {
  executeMcpToolCall,
  type McpToolEvent,
} from "../../mcpConnectors";
import { createServerSupabase } from "../../supabase";
import {
  type DocStore,
  type DocIndex,
  type TabularCellStore,
  type WorkflowStore,
  type ToolCall,
  type AskInputItem,
  type AskInputOption,
  type AskInputsEvent,
  devLog,
  resolveDocLabel,
} from "../types";
import {
  downloadFile,
  storageKey,
  uploadFile,
} from "../../storage";

/** Which knowledge sources (playbooks + KB) a turn/step actually consulted. */
export type KnowledgeSourceEvent =
  | { type: "playbook_listed"; names: string[] }
  | { type: "playbook_reviewed"; name: string; filename?: string | null }
  | { type: "knowledge_search"; query: string; hits: number };
import { convertedPdfKey } from "../../convert";
import { contentTypeForDocumentType } from "../../documentTypes";
import { buildDownloadUrl } from "../../downloadTokens";
import { loadActiveVersion } from "../../documentVersions";
import { type EditInput } from "../../docxTrackedChanges";
import {
  citationReminder,
  generateDocx,
  generateExcel,
  generatePpt,
  getTurnReadIdentity,
  duplicateReadDocumentResult,
  clearTurnReadsForDocument,
  readDocumentContent,
  findInDocumentContent,
  findTextMatches,
  runEditDocument,
  safeGeneratedFilename,
  type DocEditedResult,
  type TurnEditState,
  type TurnReadState,
  type DocCreatedResult,
  type DocReplicatedResult,
  type TextMatch,
} from "./documentOps";


type CourtlistenerCaseRecord = {
  clusterId: number;
  caseName: string | null;
  citations: string[];
  url: string | null;
  pdfUrl: string | null;
  dateFiled: string | null;
  opinions?: unknown[];
};

type CourtlistenerCaseInput = {
  clusterId?: number | null;
  caseName?: string | null;
  citation?: string | null;
  citations?: string[];
  url?: string | null;
  pdfUrl?: string | null;
  dateFiled?: string | null;
  opinions?: unknown[];
};

export type CourtlistenerTurnState = {
  casesByClusterId: Map<number, CourtlistenerCaseRecord>;
};

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanAskInputString(value: unknown, fallback = ""): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function normalizeAskInputsEvent(args: Record<string, unknown>): AskInputsEvent {
  const rawItems = Array.isArray(args.items) ? args.items : [];
  const items = rawItems
    .map((item, index): AskInputItem | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      const id =
        cleanAskInputString(row.id) ||
        `${row.kind === "documents" ? "documents" : "choice"}-${index + 1}`;
      const responsePrefix = cleanAskInputString(row.response_prefix);

      if (row.kind === "documents") {
        const rawDocumentTypes = Array.isArray(row.document_types)
          ? row.document_types
          : [];
        const documentTypes = rawDocumentTypes
          .filter((type): type is string => typeof type === "string")
          .map((type) => type.trim())
          .filter(Boolean)
          .map((type) => type.slice(0, 300))
          .slice(0, 8);
        return {
          id: id.slice(0, 80),
          kind: "documents",
          document_types: documentTypes,
          ...(responsePrefix
            ? { response_prefix: responsePrefix.slice(0, 200) }
            : {}),
        };
      }

      const question = cleanAskInputString(
        row.question,
        "Please choose an option.",
      );
      const rawOptions = Array.isArray(row.options) ? row.options : [];
      const options = rawOptions
        .map((option): AskInputOption | null => {
          if (!option || typeof option !== "object") return null;
          const optionRow = option as Record<string, unknown>;
          const value =
            cleanAskInputString(optionRow.value) ||
            cleanAskInputString(optionRow.label);
          if (!value) return null;
          return {
            value: value.slice(0, 500),
          };
        })
        .filter((option): option is AskInputOption => !!option)
        .slice(0, 8);
      const normalizedOptions =
        options.length > 0 ? options : [{ value: "Continue" }];
      const otherLabel = cleanAskInputString(row.other_label, "Other");
      return {
        id: id.slice(0, 80),
        kind: "choice",
        question: question.slice(0, 500),
        options: normalizedOptions,
        allow_other: row.allow_other !== false,
        other_label: otherLabel.slice(0, 80),
        ...(responsePrefix
          ? { response_prefix: responsePrefix.slice(0, 200) }
          : {}),
      };
    })
    .filter((item): item is AskInputItem => !!item)
    .slice(0, 12);

  return { type: "ask_inputs", items };
}

function upsertCourtlistenerCases(
  state: CourtlistenerTurnState,
  inputs: CourtlistenerCaseInput[],
): CourtlistenerCaseRecord[] {
  const records: CourtlistenerCaseRecord[] = [];
  for (const input of inputs) {
    if (typeof input.clusterId !== "number" || !Number.isFinite(input.clusterId)) {
      continue;
    }
    const clusterId = Math.floor(input.clusterId);
    const current =
      state.casesByClusterId.get(clusterId) ??
      {
        clusterId,
        caseName: null,
        citations: [],
        url: null,
        pdfUrl: null,
        dateFiled: null,
      };
    const nextCitations = [
      ...current.citations,
      ...(input.citation ? [input.citation] : []),
      ...(input.citations ?? []),
    ]
      .map(nonEmpty)
      .filter((value): value is string => !!value);
    const record: CourtlistenerCaseRecord = {
      ...current,
      caseName: current.caseName ?? nonEmpty(input.caseName),
      citations: Array.from(new Set(nextCitations)),
      url: current.url ?? nonEmpty(input.url),
      pdfUrl: current.pdfUrl ?? nonEmpty(input.pdfUrl),
      dateFiled: current.dateFiled ?? nonEmpty(input.dateFiled),
      opinions: current.opinions ?? input.opinions,
    };
    state.casesByClusterId.set(clusterId, record);
    records.push(record);
  }
  return records;
}

function caseCitationEventFromRecord(
  record: CourtlistenerCaseRecord,
): CaseCitationEvent | null {
  if (!record.url) return null;
  return {
    type: "case_citation",
    cluster_id: record.clusterId,
    case_name: record.caseName,
    citation: record.citations[0] ?? null,
    url: record.url,
    pdfUrl: record.pdfUrl,
    dateFiled: record.dateFiled,
  };
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(
  record: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

function numberField(
  record: Record<string, unknown> | null,
  key: string,
): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value)
    ? Math.floor(value)
    : null;
}

function stringArrayField(
  record: Record<string, unknown> | null,
  key: string,
): string[] {
  const value = record?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function courtlistenerCaseInputFromFetchedCase(
  fallbackClusterId: number,
  fetchedCase: unknown,
): CourtlistenerCaseInput {
  const record = recordFromUnknown(fetchedCase);
  const clusterId =
    numberField(record, "clusterId") ?? numberField(record, "id") ?? fallbackClusterId;
  return {
    clusterId,
    caseName: stringField(record, "caseName"),
    citations: stringArrayField(record, "citations"),
    url: stringField(record, "url"),
    pdfUrl: stringField(record, "pdfUrl"),
    dateFiled: stringField(record, "dateFiled"),
    opinions: Array.isArray(record?.opinions) ? record.opinions : undefined,
  };
}

function courtlistenerOpinionCount(fetchedCase: unknown): number {
  const record = recordFromUnknown(fetchedCase);
  return Array.isArray(record?.opinions) ? record.opinions.length : 0;
}

function courtlistenerOpinionMetadata(raw: unknown) {
  const opinion = recordFromUnknown(raw);
  if (!opinion) return null;
  const text =
    stringField(opinion, "text") ??
    (stringField(opinion, "html")
      ? stripCaseOpinionHtml(stringField(opinion, "html")!)
      : null);
  return {
    opinion_id:
      numberField(opinion, "opinionId") ?? numberField(opinion, "id"),
    type: stringField(opinion, "type"),
    author: stringField(opinion, "author"),
    per_curiam: stringField(opinion, "per_curiam"),
    joined_by_str: stringField(opinion, "joined_by_str"),
    url: stringField(opinion, "url"),
    char_count: text?.length ?? 0,
  };
}

function courtlistenerFetchedCaseMetadata(
  record: CourtlistenerCaseRecord,
  opinionCount: number,
) {
  return {
    cluster_id: record.clusterId,
    case_name: record.caseName,
    citation: record.citations[0] ?? null,
    citations: record.citations,
    dateFiled: record.dateFiled,
    url: record.url,
    pdfUrl: record.pdfUrl,
    opinion_count: opinionCount,
    opinions: (record.opinions ?? [])
      .map(courtlistenerOpinionMetadata)
      .filter((opinion): opinion is NonNullable<typeof opinion> => !!opinion),
  };
}

function stripCaseOpinionHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

type CachedCaseOpinionText = {
  opinion_id: number | null;
  type: string | null;
  author: string | null;
  url: string | null;
  text: string;
};

function cachedCaseOpinionTexts(
  record: CourtlistenerCaseRecord,
): CachedCaseOpinionText[] {
  return (record.opinions ?? [])
    .map((raw) => {
      const opinion = recordFromUnknown(raw);
      if (!opinion) return null;
      const text =
        stringField(opinion, "text") ??
        (stringField(opinion, "html")
          ? stripCaseOpinionHtml(stringField(opinion, "html")!)
          : null);
      if (!text) return null;
      return {
        opinion_id:
          numberField(opinion, "opinionId") ?? numberField(opinion, "id"),
        type: stringField(opinion, "type"),
        author: stringField(opinion, "author"),
        url: stringField(opinion, "url"),
        text,
      };
    })
    .filter((opinion): opinion is CachedCaseOpinionText => !!opinion);
}

function requestedCourtlistenerOpinionIds(args: Record<string, unknown>) {
  const rawIds = Array.isArray(args.opinionIds)
    ? args.opinionIds
    : Array.isArray(args.opinion_ids)
      ? args.opinion_ids
      : typeof args.opinionId === "number"
        ? [args.opinionId]
        : typeof args.opinion_id === "number"
          ? [args.opinion_id]
          : [];
  return Array.from(
    new Set(
      rawIds
        .filter((value): value is number => typeof value === "number")
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Math.floor(value)),
    ),
  );
}

type FindInCaseArgs = {
  clusterId: number | null;
  query: string;
  maxResults: number;
  contextChars: number;
};

function parseFindInCaseArgs(args: Record<string, unknown>): FindInCaseArgs {
  return {
    clusterId:
      typeof args.clusterId === "number" && Number.isFinite(args.clusterId)
        ? Math.floor(args.clusterId)
        : typeof args.cluster_id === "number" && Number.isFinite(args.cluster_id)
          ? Math.floor(args.cluster_id)
          : null,
    query: typeof args.query === "string" ? args.query : "",
    maxResults:
      typeof args.max_results === "number"
        ? Math.max(0, Math.floor(args.max_results))
        : 20,
    contextChars:
      typeof args.context_chars === "number"
        ? Math.max(0, Math.floor(args.context_chars))
        : 160,
  };
}

function findInCaseSearchSummary(
  event: Extract<CourtlistenerToolEvent, { type: "courtlistener_find_in_case" }>,
) {
  return {
    cluster_id: event.cluster_id,
    query: event.query,
    total_matches: event.total_matches,
    case_name: event.case_name,
    citation: event.citation,
    error: event.error,
  };
}

function cachedCaseNotFetchedResult(clusterId: number | null) {
  return {
    ok: false,
    cluster_id: clusterId,
    error:
      "Case has not been fetched in this turn. Call courtlistener_get_cases first.",
  };
}

export async function runToolCalls(
  toolCalls: ToolCall[],
  docStore: DocStore,
  userId: string,
  db: ReturnType<typeof createServerSupabase>,
  write: (s: string) => void,
  workflowStore?: WorkflowStore,
  tabularStore?: TabularCellStore,
  docIndex?: DocIndex,
  turnEditState?: TurnEditState,
  turnReadState?: TurnReadState,
  projectId?: string | null,
  courtlistenerState?: CourtlistenerTurnState,
  apiKeys?: import("../../llm").UserApiKeys,
): Promise<{
  toolResults: unknown[];
  docsRead: { filename: string; document_id?: string }[];
  docsFound: { filename: string; query: string; total_matches: number }[];
  docsCreated: DocCreatedResult[];
  docsReplicated: DocReplicatedResult[];
  workflowsApplied: { workflow_id: string; title: string }[];
  docsEdited: DocEditedResult[];
  askInputsEvents: AskInputsEvent[];
  courtlistenerEvents: CourtlistenerToolEvent[];
  caseCitationEvents: CaseCitationEvent[];
  mcpEvents: McpToolEvent[];
  knowledgeEvents: KnowledgeSourceEvent[];
}> {
  const toolResults: unknown[] = [];
  // Knowledge-source transparency (playbooks + KB) surfaced per turn/step.
  const knowledgeEvents: KnowledgeSourceEvent[] = [];
  const docsRead: { filename: string; document_id?: string }[] = [];
  const docsFound: {
    filename: string;
    query: string;
    total_matches: number;
  }[] = [];
  const docsCreated: DocCreatedResult[] = [];
  const docsReplicated: DocReplicatedResult[] = [];
  const workflowsApplied: { workflow_id: string; title: string }[] = [];
  const docsEdited: DocEditedResult[] = [];
  const askInputsEvents: AskInputsEvent[] = [];
  const courtlistenerEvents: CourtlistenerToolEvent[] = [];
  const caseCitationEvents: CaseCitationEvent[] = [];
  const mcpEvents: McpToolEvent[] = [];
  const courtState: CourtlistenerTurnState =
    courtlistenerState ??
    {
      casesByClusterId: new Map(),
    };
  const groupedFindInCaseSearches = toolCalls
    .filter((tc) => tc.function.name === COURTLISTENER_TOOL_NAMES.findInCase)
    .map((tc) => {
      let rawArgs: Record<string, unknown> = {};
      try {
        rawArgs = JSON.parse(tc.function.arguments || "{}");
      } catch {
        /* ignore */
      }
      const parsed = parseFindInCaseArgs(rawArgs);
      return {
        cluster_id: parsed.clusterId,
        query: parsed.query,
        total_matches: 0,
      };
    });
  const shouldGroupFindInCase = groupedFindInCaseSearches.length > 1;
  let groupedFindInCaseStarted = false;
  const groupedFindInCaseEvents: Extract<
    CourtlistenerToolEvent,
    { type: "courtlistener_find_in_case" }
  >[] = [];

  const registerGeneratedDocument = (
    tc: ToolCall,
    result: Record<string, unknown>,
    previewFilename: string,
    fileType: string,
  ) => {
    let newDocLabel: string | null = null;
    if ("filename" in result && "download_url" in result) {
      const dlFilename = result.filename as string;
      const dlUrl = result.download_url as string;
      const documentId = (result as { document_id?: string }).document_id;
      const versionId = (result as { version_id?: string }).version_id;
      const versionNumber =
        (result as { version_number?: number }).version_number ?? null;
      const storagePath = (result as { storage_path?: string }).storage_path;

      if (documentId && storagePath && docIndex) {
        const existingLabels = new Set(Object.keys(docIndex));
        let i = 0;
        while (existingLabels.has(`doc-${i}`)) i++;
        newDocLabel = `doc-${i}`;
        docIndex[newDocLabel] = {
          document_id: documentId,
          filename: dlFilename,
        };
        docStore.set(newDocLabel, {
          storage_path: storagePath,
          file_type: fileType,
          filename: dlFilename,
        });
      }

      write(
        `data: ${JSON.stringify({
          type: "doc_created",
          filename: dlFilename,
          download_url: dlUrl,
          document_id: documentId,
          version_id: versionId,
          version_number: versionNumber,
        })}\n\n`,
      );
      docsCreated.push({
        filename: dlFilename,
        download_url: dlUrl,
        document_id: documentId,
        version_id: versionId,
        version_number: versionNumber,
      });
    } else {
      write(
        `data: ${JSON.stringify({ type: "doc_created", filename: previewFilename, download_url: "" })}\n\n`,
      );
    }

    const { download_url, storage_path, ...safeToolResult } = result;
    const toolResultPayload = newDocLabel
      ? {
          ...safeToolResult,
          doc_id: newDocLabel,
          next_required_action: [
            `Before writing your final response, call read_document with doc_id "${newDocLabel}".`,
            `Base your description on the generated document's actual returned text, not on memory of what you intended to generate.`,
            `Do not include download links, URLs, or markdown links to the document in your prose response; the document card is shown automatically by the UI.`,
            `Give a concise description of the generated document and, if you make factual claims about its contents, cite it with [N] markers and a final <CITATIONS> block using doc_id "${newDocLabel}", not any source/template document.`,
          ].join(" "),
        }
      : safeToolResult;
    toolResults.push({
      role: "tool",
      tool_call_id: tc.id,
      content: JSON.stringify(toolResultPayload),
    });
  };

  for (const tc of toolCalls) {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.function.arguments || "{}");
    } catch {
      /* ignore */
    }

    // P3 audit trail (C019): every tool call, args digested not dumped.
    recordAudit({
      actorId: userId,
      eventType: "tool_call",
      projectId: projectId ?? null,
      toolName: tc.function.name,
      detail: { args: argsDigest(args) },
    });

    if (tc.function.name.startsWith("mcp_")) {
      write(
        `data: ${JSON.stringify({
          type: "mcp_tool_start",
          name: tc.function.name,
        })}\n\n`,
      );
      const { content, event } = await executeMcpToolCall(
        userId,
        tc.function.name,
        args,
        db,
      );
      toolResults.push({
        role: "tool",
        tool_call_id: tc.id,
        content,
      });
      mcpEvents.push(event);
      write(
        `data: ${JSON.stringify({
          type: "mcp_tool_result",
          name: tc.function.name,
          connector_name: event.connector_name,
          tool_name: event.tool_name,
          status: event.status,
          error: event.error,
        })}\n\n`,
      );
      continue;
    }

    if (tc.function.name === "ask_inputs") {
      const event = normalizeAskInputsEvent(args);
      if (event.items.length > 0) askInputsEvents.push(event);
      continue;
    }

    if (tc.function.name === "search_knowledge") {
      const kbQuery = typeof args.query === "string" ? args.query : "";
      const docType = typeof args.doc_type === "string" ? args.doc_type : null;
      const k = typeof args.k === "number" ? args.k : undefined;
      let content: string;
      try {
        const hits = await searchKnowledge({
          db,
          ownerId: userId,
          query: kbQuery,
          k,
          docType,
          apiKeys,
        });
        content = formatKnowledgeForModel(kbQuery, hits);
        knowledgeEvents.push({
          type: "knowledge_search",
          query: kbQuery,
          hits: Array.isArray(hits) ? hits.length : 0,
        });
      } catch (err) {
        content = `KNOWLEDGE BASE: search failed \u2014 ${(err as Error).message}`;
      }
      toolResults.push({ role: "tool", tool_call_id: tc.id, content });
      continue;
    }

    if (tc.function.name === "list_playbooks") {
      let content: string;
      try {
        const pbs = await listPlaybooks(db, userId);
        content = pbs.length
          ? "Available playbooks:\n" +
            pbs
              .map(
                (p) =>
                  `- ${p.name}${p.agreement_type ? ` (${p.agreement_type})` : ""}${p.description ? ` \u2014 ${p.description}` : ""}`,
              )
              .join("\n")
          : "No playbooks have been defined yet.";
        knowledgeEvents.push({
          type: "playbook_listed",
          names: pbs.map((p) => p.name),
        });
      } catch (err) {
        content = `Could not list playbooks \u2014 ${(err as Error).message}`;
      }
      toolResults.push({ role: "tool", tool_call_id: tc.id, content });
      continue;
    }

    if (tc.function.name === "review_against_playbook") {
      const pbName =
        typeof args.playbook_name === "string" ? args.playbook_name : "";
      let content: string;
      try {
        const pb = await getPlaybook(db, userId, pbName);
        if (!pb) {
          content = `No playbook named "${pbName}" was found. Use list_playbooks to see available playbooks.`;
        } else {
          content = formatPlaybookForModel(pb);
          const rawDocId = typeof args.doc_id === "string" ? args.doc_id : "";
          if (rawDocId) {
            const docId =
              resolveDocLabel(rawDocId, docStore, docIndex) ?? rawDocId;
            const docText = await readDocumentContent(
              docId,
              docStore,
              write,
              docIndex,
              db,
            );
            const reviewedFilename =
              docStore.get(docId)?.filename ?? rawDocId;
            content += `\n\n== DOCUMENT UNDER REVIEW (${reviewedFilename}) ==\n${docText}`;
            knowledgeEvents.push({
              type: "playbook_reviewed",
              name: pb.name,
              filename: reviewedFilename,
            });
          } else {
            knowledgeEvents.push({
              type: "playbook_reviewed",
              name: pb.name,
              filename: null,
            });
            content +=
              "\n\nReview the document already provided in this conversation against the positions above. For each relevant clause state: the playbook topic, what the document says, whether it MEETS / is a FALLBACK / is a DEALBREAKER deviation, the severity, and a suggested redline.";
          }
        }
      } catch (err) {
        content = `Playbook review failed \u2014 ${(err as Error).message}`;
      }
      toolResults.push({ role: "tool", tool_call_id: tc.id, content });
      continue;
    }

    // C026 — My Clauses tools.
    if (tc.function.name === "search_clauses") {
      const query = typeof args.query === "string" ? args.query : "";
      let content: string;
      try {
        const clauses = await searchClauses(db, userId, query, {
          k: typeof args.k === "number" ? args.k : undefined,
          agreementType:
            typeof args.agreement_type === "string"
              ? args.agreement_type
              : null,
          apiKeys,
        });
        content = formatClausesForModel(query, clauses);
      } catch (err) {
        content = `MY CLAUSES: search failed — ${(err as Error).message}`;
      }
      toolResults.push({ role: "tool", tool_call_id: tc.id, content });
      continue;
    }

    if (tc.function.name === "save_clause") {
      let content: string;
      try {
        const clause = await saveClause(
          db,
          userId,
          {
            title: typeof args.title === "string" ? args.title : "Clause",
            body: typeof args.body === "string" ? args.body : "",
            agreement_type:
              typeof args.agreement_type === "string"
                ? args.agreement_type
                : null,
            guidance:
              typeof args.guidance === "string" ? args.guidance : null,
            tags: Array.isArray(args.tags)
              ? (args.tags as unknown[]).filter(
                  (t): t is string => typeof t === "string",
                )
              : [],
          },
          apiKeys,
        );
        content = `Saved to My Clauses: "${clause.title}" (id ${clause.id}).`;
      } catch (err) {
        content = `Could not save clause — ${(err as Error).message}`;
      }
      toolResults.push({ role: "tool", tool_call_id: tc.id, content });
      continue;
    }

    // C076 — Lists tools (tasks, facts & deadlines). Project-scoped: the
    // dispatcher only receives these calls from project chats / agent runs,
    // where access was already authorised upstream; we still refuse without
    // a project in context.
    if (
      tc.function.name === "list_list_items" ||
      tc.function.name === "add_list_item" ||
      tc.function.name === "update_list_item_status"
    ) {
      let content: string;
      if (!projectId) {
        content =
          "LISTS: no matter (project) is in context — list items live on a project. Ask the user to open the matter, or skip this step.";
      } else if (tc.function.name === "list_list_items") {
        try {
          const kindFilter =
            typeof args.kind === "string" &&
            LIST_ITEM_KINDS.has(args.kind as ListItemKind)
              ? (args.kind as ListItemKind)
              : null;
          const items = (await listItemsForProject(db, projectId)).filter(
            (i) => !kindFilter || i.kind === kindFilter,
          );
          content =
            items.length === 0
              ? "No list items on this matter yet."
              : items
                  .map(
                    (i) =>
                      `- [${i.kind}] (${i.status}) ${i.title}${i.due_at ? ` — due ${i.due_at.slice(0, 10)}` : ""}${i.citation ? ` — ${i.citation}` : ""} (id ${i.id})`,
                  )
                  .join("\n");
        } catch (err) {
          content = `LISTS: failed — ${(err as Error).message}`;
        }
      } else if (tc.function.name === "add_list_item") {
        try {
          const kind = args.kind as ListItemKind;
          const title =
            typeof args.title === "string" ? args.title.trim() : "";
          if (!LIST_ITEM_KINDS.has(kind) || !title)
            throw new Error("kind (task|fact|deadline) and title are required");
          let dueAt: string | null = null;
          if (typeof args.due_at === "string" && args.due_at) {
            const d = new Date(args.due_at);
            if (Number.isNaN(d.getTime()))
              throw new Error("due_at is not a valid ISO date");
            dueAt = d.toISOString();
          }
          const item = await createListItem(db, {
            projectId,
            createdBy: userId,
            kind,
            title,
            detail: typeof args.detail === "string" ? args.detail : null,
            dueAt,
            citation:
              typeof args.citation === "string" ? args.citation : null,
          });
          content = `Added ${kind} "${item.title}" to the matter list (id ${item.id}${dueAt ? `, due ${dueAt.slice(0, 10)}` : ""}).`;
        } catch (err) {
          content = `LISTS: could not add item — ${(err as Error).message}`;
        }
      } else {
        try {
          const itemId =
            typeof args.item_id === "string" ? args.item_id : "";
          const status = args.status as ListItemStatus;
          if (!itemId || !LIST_ITEM_STATUSES.has(status))
            throw new Error(
              "item_id and status (open|in_progress|done|dismissed) are required",
            );
          const { data: updated, error } = await db
            .from("list_items")
            .update({ status, updated_at: new Date().toISOString() })
            .eq("id", itemId)
            .eq("project_id", projectId)
            .select(LIST_ITEM_COLUMNS)
            .maybeSingle();
          if (error) throw new Error(error.message);
          if (!updated) throw new Error("item not found on this matter");
          content = `Marked "${(updated as { title: string }).title}" as ${status}.`;
        } catch (err) {
          content = `LISTS: could not update — ${(err as Error).message}`;
        }
      }
      toolResults.push({ role: "tool", tool_call_id: tc.id, content });
      continue;
    }

    // C002 — conversational playbook builder (write ops, audit-logged above).
    if (tc.function.name === "create_playbook") {
      let content: string;
      try {
        const name = typeof args.name === "string" ? args.name.trim() : "";
        if (!name) throw new Error("name is required");
        const { error } = await db.from("playbooks").insert({
          owner_id: userId,
          name,
          agreement_type:
            typeof args.agreement_type === "string"
              ? args.agreement_type
              : null,
          description:
            typeof args.description === "string" ? args.description : null,
        });
        if (error) throw new Error(error.message);
        content = `Created playbook "${name}". Add rules with upsert_playbook_rule.`;
      } catch (err) {
        content = `Could not create playbook — ${(err as Error).message}`;
      }
      toolResults.push({ role: "tool", tool_call_id: tc.id, content });
      continue;
    }

    if (tc.function.name === "upsert_playbook_rule") {
      let content: string;
      try {
        const pbName =
          typeof args.playbook_name === "string" ? args.playbook_name : "";
        const topic = typeof args.topic === "string" ? args.topic.trim() : "";
        if (!pbName || !topic)
          throw new Error("playbook_name and topic are required");
        const { data: pb } = await db
          .from("playbooks")
          .select("id")
          .eq("owner_id", userId)
          .eq("name", pbName)
          .maybeSingle();
        if (!pb) throw new Error(`No playbook named "${pbName}"`);
        const severity =
          args.severity === "low" ||
          args.severity === "medium" ||
          args.severity === "high"
            ? args.severity
            : "medium";
        const fields = {
          preferred:
            typeof args.preferred === "string" ? args.preferred : null,
          acceptable_fallback:
            typeof args.acceptable_fallback === "string"
              ? args.acceptable_fallback
              : null,
          dealbreaker:
            typeof args.dealbreaker === "string" ? args.dealbreaker : null,
          severity,
          notes: typeof args.notes === "string" ? args.notes : null,
        };
        const { data: existing } = await db
          .from("playbook_rules")
          .select("id")
          .eq("playbook_id", pb.id)
          .ilike("topic", topic)
          .maybeSingle();
        if (existing) {
          const { error } = await db
            .from("playbook_rules")
            .update(fields)
            .eq("id", existing.id);
          if (error) throw new Error(error.message);
          content = `Updated rule "${topic}" in "${pbName}".`;
        } else {
          const { error } = await db
            .from("playbook_rules")
            .insert({ playbook_id: pb.id, topic, ...fields });
          if (error) throw new Error(error.message);
          content = `Added rule "${topic}" to "${pbName}".`;
        }
        await db
          .from("playbooks")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", pb.id);
      } catch (err) {
        content = `Could not save rule — ${(err as Error).message}`;
      }
      toolResults.push({ role: "tool", tool_call_id: tc.id, content });
      continue;
    }

    if (tc.function.name === "delete_playbook_rule") {
      let content: string;
      try {
        const pbName =
          typeof args.playbook_name === "string" ? args.playbook_name : "";
        const topic = typeof args.topic === "string" ? args.topic.trim() : "";
        const { data: pb } = await db
          .from("playbooks")
          .select("id")
          .eq("owner_id", userId)
          .eq("name", pbName)
          .maybeSingle();
        if (!pb) throw new Error(`No playbook named "${pbName}"`);
        const { error } = await db
          .from("playbook_rules")
          .delete()
          .eq("playbook_id", pb.id)
          .ilike("topic", topic);
        if (error) throw new Error(error.message);
        content = `Deleted rule "${topic}" from "${pbName}" (if it existed).`;
      } catch (err) {
        content = `Could not delete rule — ${(err as Error).message}`;
      }
      toolResults.push({ role: "tool", tool_call_id: tc.id, content });
      continue;
    }

    // C025 — one question across many documents.
    if (tc.function.name === "tabular_ask") {
      let content: string;
      try {
        const question =
          typeof args.question === "string" ? args.question : "";
        const documentIds = Array.isArray(args.document_ids)
          ? (args.document_ids as unknown[]).filter(
              (v): v is string => typeof v === "string",
            )
          : [];
        const outcome = await runTabularAsk({
          db,
          userId,
          question,
          documentIds,
          title: typeof args.title === "string" ? args.title : null,
          apiKeys,
        });
        content = JSON.stringify(outcome);
      } catch (err) {
        content = `Tabular analysis failed — ${(err as Error).message}`;
      }
      toolResults.push({ role: "tool", tool_call_id: tc.id, content });
      continue;
    }

    // C024 — assertion-level verification.
    if (tc.function.name === "verify_assertions") {
      let content: string;
      try {
        const text = typeof args.text === "string" ? args.text : "";
        const outcome = await runAssertionVerification({
          db,
          userId,
          text,
          sourceKind: "chat_message",
          projectId: projectId ?? null,
          apiKeys,
        });
        const pending = outcome.assertions.filter((a) => !a.verdict).length;
        content = JSON.stringify({
          report_id: outcome.report_id,
          jade_content_checking: outcome.jade_content_checking,
          assertions: outcome.assertions.map((a) => ({
            position: a.position,
            assertion: a.assertion,
            citation: a.citation,
            citation_valid: a.citation_valid,
            verdict: a.verdict ?? "pending_human_validation",
            verifier: a.verifier,
            supporting_passage: a.supporting_passage,
          })),
          note:
            pending > 0
              ? `${pending} assertion(s) need the user's own validation — tell the user to open the report at /verify?report=${outcome.report_id}, use the Jade/AustLII search links there, and record verdicts themselves.`
              : `All assertions machine-checked. Full report at /verify?report=${outcome.report_id}.`,
        });
      } catch (err) {
        content = `Verification failed — ${(err as Error).message}`;
      }
      toolResults.push({ role: "tool", tool_call_id: tc.id, content });
      continue;
    }

    if (tc.function.name === "read_document") {
      const rawDocId = args.doc_id as string;
      const docId = resolveDocLabel(rawDocId, docStore, docIndex) ?? rawDocId;
      const readIdentity = await getTurnReadIdentity({
        docLabel: docId,
        docStore,
        docIndex,
        db,
      });
      if (readIdentity && turnReadState?.has(readIdentity.key)) {
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: duplicateReadDocumentResult(readIdentity),
        });
        continue;
      }
      const content = await readDocumentContent(
        docId,
        docStore,
        write,
        docIndex,
        db,
      );
      const filename = docStore.get(docId)?.filename;
      const documentId = docIndex?.[docId]?.document_id;
      if (readIdentity && turnReadState) {
        turnReadState.set(readIdentity.key, readIdentity);
      }
      if (filename) docsRead.push({ filename, document_id: documentId });
      toolResults.push({
        role: "tool",
        tool_call_id: tc.id,
        content: filename
          ? `${citationReminder(docId, filename)}\n\n${content}`
          : content,
      });
    } else if (tc.function.name === "find_in_document") {
      const rawDocId = args.doc_id as string;
      const docId = resolveDocLabel(rawDocId, docStore, docIndex) ?? rawDocId;
      const query = (args.query as string) ?? "";
      const maxResults =
        typeof args.max_results === "number" ? args.max_results : undefined;
      const contextChars =
        typeof args.context_chars === "number" ? args.context_chars : undefined;
      const content = await findInDocumentContent({
        docLabel: docId,
        query,
        maxResults,
        contextChars,
        docStore,
        write,
        docIndex,
        db,
      });
      const filename = docStore.get(docId)?.filename;
      if (filename) {
        let totalMatches = 0;
        try {
          const parsed = JSON.parse(content) as {
            total_matches?: number;
          };
          totalMatches = parsed.total_matches ?? 0;
        } catch {
          /* ignore — still record the find attempt */
        }
        docsFound.push({
          filename,
          query,
          total_matches: totalMatches,
        });
      }
      toolResults.push({ role: "tool", tool_call_id: tc.id, content });
    } else if (tc.function.name === "list_documents") {
      const list = Array.from(docStore.entries()).map(([doc_id, info]) => ({
        doc_id,
        filename: info.filename,
        file_type: info.file_type,
      }));
      toolResults.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(list),
      });
    } else if (tc.function.name === "fetch_documents") {
      const rawDocIds = (args.doc_ids as string[]) ?? [];
      const docIds = rawDocIds.map(
        (id) => resolveDocLabel(id, docStore, docIndex) ?? id,
      );
      const parts: string[] = [];
      for (const docId of docIds) {
        const readIdentity = await getTurnReadIdentity({
          docLabel: docId,
          docStore,
          docIndex,
          db,
        });
        if (readIdentity && turnReadState?.has(readIdentity.key)) {
          const filename = docStore.get(docId)?.filename ?? docId;
          parts.push(
            `--- ${filename} (${docId}) ---\n${duplicateReadDocumentResult(
              readIdentity,
            )}`,
          );
          continue;
        }
        const content = await readDocumentContent(
          docId,
          docStore,
          write,
          docIndex,
          db,
        );
        const filename = docStore.get(docId)?.filename ?? docId;
        if (readIdentity && turnReadState) {
          turnReadState.set(readIdentity.key, readIdentity);
        }
        parts.push(
          `--- ${filename} (${docId}) ---\n${citationReminder(docId, filename)}\n\n${content}`,
        );
        if (docStore.get(docId)) {
          const documentId = docIndex?.[docId]?.document_id;
          docsRead.push({ filename, document_id: documentId });
        }
      }
      toolResults.push({
        role: "tool",
        tool_call_id: tc.id,
        content: parts.join("\n\n"),
      });
    } else if (tc.function.name === "list_workflows") {
      const list = workflowStore
        ? Array.from(workflowStore.entries()).map(([id, w]) => ({
            id,
            title: w.title,
          }))
        : [];
      toolResults.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(list),
      });
    } else if (tc.function.name === "read_workflow") {
      const wfId = args.workflow_id as string;
      const wf = workflowStore?.get(wfId);
      if (wf) {
        write(
          `data: ${JSON.stringify({ type: "workflow_applied", workflow_id: wfId, title: wf.title })}\n\n`,
        );
        workflowsApplied.push({ workflow_id: wfId, title: wf.title });
      }
      toolResults.push({
        role: "tool",
        tool_call_id: tc.id,
        content: wf ? wf.skill_md : `Workflow '${wfId}' not found.`,
      });
    } else if (tc.function.name === "read_table_cells" && tabularStore) {
      const colIndices = args.col_indices as number[] | undefined;
      const rowIndices = args.row_indices as number[] | undefined;

      const filteredCols = colIndices?.length
        ? tabularStore.columns.filter((_, i) => colIndices.includes(i))
        : tabularStore.columns;
      const filteredDocs = rowIndices?.length
        ? tabularStore.documents.filter((_, i) => rowIndices.includes(i))
        : tabularStore.documents;

      const label = `${filteredCols.length} ${filteredCols.length === 1 ? "column" : "columns"} × ${filteredDocs.length} ${filteredDocs.length === 1 ? "row" : "rows"}`;
      write(
        `data: ${JSON.stringify({ type: "doc_read_start", filename: label })}\n\n`,
      );

      const lines: string[] = [];
      for (const col of filteredCols) {
        const colPos = tabularStore.columns.findIndex(
          (c) => c.index === col.index,
        );
        for (const doc of filteredDocs) {
          const rowPos = tabularStore.documents.findIndex(
            (d) => d.id === doc.id,
          );
          const cell = tabularStore.cells.get(`${col.index}:${doc.id}`);
          lines.push(
            `[COL:${colPos} "${col.name}" | ROW:${rowPos} "${doc.filename}"]`,
          );
          if (cell?.summary) {
            lines.push(`Summary: ${cell.summary}`);
            if (cell.flag) lines.push(`Flag: ${cell.flag}`);
            if (cell.reasoning) lines.push(`Reasoning: ${cell.reasoning}`);
          } else {
            lines.push(`(not yet generated)`);
          }
          lines.push("");
        }
      }

      write(
        `data: ${JSON.stringify({ type: "doc_read", filename: label })}\n\n`,
      );
      docsRead.push({ filename: label });
      toolResults.push({
        role: "tool",
        tool_call_id: tc.id,
        content: lines.join("\n") || "No cells found.",
      });
    } else if (tc.function.name === COURTLISTENER_TOOL_NAMES.searchCaseLaw) {
      const query = typeof args.query === "string" ? args.query : "";
      write(
        `data: ${JSON.stringify({ type: "courtlistener_search_case_law_start", query })}\n\n`,
      );
      try {
        const result = await searchCourtlistenerCaseLaw({
          query: query || undefined,
          court: typeof args.court === "string" ? args.court : undefined,
          filedAfter:
            typeof args.filedAfter === "string" ? args.filedAfter : undefined,
          filedBefore:
            typeof args.filedBefore === "string" ? args.filedBefore : undefined,
          limit: typeof args.limit === "number" ? args.limit : undefined,
          apiToken: apiKeys?.courtlistener,
        });
        const resultCount =
          result &&
          typeof result === "object" &&
          Array.isArray((result as { results?: unknown }).results)
            ? (result as { results: unknown[] }).results.length
            : 0;
        const error =
          result &&
          typeof result === "object" &&
          typeof (result as { error?: unknown }).error === "string"
            ? (result as { error: string }).error
            : undefined;
        const event: CourtlistenerToolEvent = {
          type: "courtlistener_search_case_law",
          query,
          result_count: resultCount,
          ...(error ? { error } : {}),
        };
        write(`data: ${JSON.stringify(event)}\n\n`);
        courtlistenerEvents.push(event);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        const event: CourtlistenerToolEvent = {
          type: "courtlistener_search_case_law",
          query,
          result_count: 0,
          error:
            err instanceof Error ? err.message : "CourtListener search failed.",
        };
        write(`data: ${JSON.stringify(event)}\n\n`);
        courtlistenerEvents.push(event);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({
            error:
              err instanceof Error
                ? err.message
                : "CourtListener search failed.",
          }),
        });
      }
    } else if (tc.function.name === COURTLISTENER_TOOL_NAMES.getCases) {
      const rawClusterIds = Array.isArray(args.clusterIds)
        ? args.clusterIds
        : Array.isArray(args.cluster_ids)
          ? args.cluster_ids
          : typeof args.clusterId === "number"
            ? [args.clusterId]
            : [];
      const clusterIds = Array.from(
        new Set(
          rawClusterIds
            .filter((value): value is number => typeof value === "number")
            .filter((value) => Number.isFinite(value) && value > 0)
            .map((value) => Math.floor(value)),
        ),
      );
      write(
        `data: ${JSON.stringify({ type: "courtlistener_get_cases_start", cluster_ids: clusterIds })}\n\n`,
      );
      try {
        const result = await getCourtlistenerCases({
          clusterIds,
          db,
          apiToken: apiKeys?.courtlistener,
        });
        const fetchedCases =
          result &&
          typeof result === "object" &&
          Array.isArray((result as { cases?: unknown }).cases)
            ? (result as { cases: unknown[] }).cases
            : [];
        fetchedCases.forEach((fetchedCase, index) => {
          const clusterId =
            courtlistenerCaseInputFromFetchedCase(
              clusterIds[index] ?? 0,
              fetchedCase,
            ).clusterId ?? 0;
          if (clusterId) {
            write(
              `data: ${JSON.stringify({ type: "case_opinions", cluster_id: clusterId, case: fetchedCase })}\n\n`,
            );
          }
        });
        const caseRecords = upsertCourtlistenerCases(
          courtState,
          fetchedCases.map((fetchedCase, index) =>
            courtlistenerCaseInputFromFetchedCase(
              clusterIds[index] ?? 0,
              fetchedCase,
            ),
          ),
        );
        const opinionCount = fetchedCases.reduce<number>(
          (sum, fetchedCase) => sum + courtlistenerOpinionCount(fetchedCase),
          0,
        );
        const caseOpinionCountByClusterId = new Map<number, number>();
        fetchedCases.forEach((fetchedCase, index) => {
          const clusterId =
            courtlistenerCaseInputFromFetchedCase(
              clusterIds[index] ?? 0,
              fetchedCase,
            ).clusterId ?? 0;
          if (clusterId) {
            caseOpinionCountByClusterId.set(
              clusterId,
              courtlistenerOpinionCount(fetchedCase),
            );
          }
        });
        const errors = fetchedCases
          .map((fetchedCase) =>
            stringField(recordFromUnknown(fetchedCase), "error"),
          )
          .filter((error): error is string => !!error);
        const resultError =
          result &&
          typeof result === "object" &&
          typeof (result as { error?: unknown }).error === "string"
            ? (result as { error: string }).error
            : undefined;
        const hasMultipleOpinionCase = caseRecords.some(
          (record) =>
            (caseOpinionCountByClusterId.get(record.clusterId) ?? 0) > 1,
        );
        const event: CourtlistenerToolEvent = {
          type: "courtlistener_get_cases",
          cluster_ids: clusterIds,
          case_count: fetchedCases.length,
          opinion_count: opinionCount,
          cases: caseRecords.map((record) => ({
            cluster_id: record.clusterId,
            case_name: record.caseName,
            citation: record.citations[0] ?? null,
            dateFiled: record.dateFiled,
            url: record.url,
          })),
          ...(resultError || errors.length
            ? { error: resultError ?? errors.join("; ") }
            : {}),
        };
        write(`data: ${JSON.stringify(event)}\n\n`);
        courtlistenerEvents.push(event);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({
            ok: !resultError && errors.length === 0,
            cluster_ids: clusterIds,
            case_count: fetchedCases.length,
            opinion_count: opinionCount,
            cases: caseRecords.map((record) =>
              courtlistenerFetchedCaseMetadata(
                record,
                caseOpinionCountByClusterId.get(record.clusterId) ?? 0,
              ),
            ),
            ...(resultError || errors.length
              ? { error: resultError ?? errors.join("; ") }
              : {}),
            next_required_action: hasMultipleOpinionCase
              ? "Opinion text is cached server-side only. Use courtlistener_find_in_case with short 1-3 word keyword probes for relevant passages. At least one fetched case has multiple opinions; if snippets are insufficient, choose the needed opinion_id(s) from the text-free opinion metadata and call courtlistener_read_case with only those IDs. Do not read all opinions unless the question requires it."
              : "Opinion text is cached server-side only. Use courtlistener_find_in_case with short 1-3 word keyword probes for relevant passages, or courtlistener_read_case if snippets are insufficient.",
          }),
        });
      } catch (err) {
        const event: CourtlistenerToolEvent = {
          type: "courtlistener_get_cases",
          cluster_ids: clusterIds,
          case_count: 0,
          opinion_count: 0,
          error:
            err instanceof Error
              ? err.message
              : "CourtListener case fetch failed.",
        };
        write(`data: ${JSON.stringify(event)}\n\n`);
        courtlistenerEvents.push(event);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({
            error:
              err instanceof Error
                ? err.message
                : "CourtListener case fetch failed.",
          }),
        });
      }
    } else if (tc.function.name === COURTLISTENER_TOOL_NAMES.findInCase) {
      const { clusterId, query, maxResults, contextChars } =
        parseFindInCaseArgs(args);
      if (shouldGroupFindInCase) {
        if (!groupedFindInCaseStarted) {
          write(
            `data: ${JSON.stringify({
              type: "courtlistener_find_in_case_start",
              cluster_id: null,
              query: "",
              searches: groupedFindInCaseSearches,
            })}\n\n`,
          );
          groupedFindInCaseStarted = true;
        }
      } else {
        write(
          `data: ${JSON.stringify({ type: "courtlistener_find_in_case_start", cluster_id: clusterId, query })}\n\n`,
        );
      }

      const record =
        typeof clusterId === "number" ? courtState.casesByClusterId.get(clusterId) : undefined;
      if (!record) {
        const payload = cachedCaseNotFetchedResult(clusterId);
        const event: CourtlistenerToolEvent = {
          type: "courtlistener_find_in_case",
          cluster_id: clusterId,
          query,
          total_matches: 0,
          error: payload.error,
        };
        if (shouldGroupFindInCase) {
          groupedFindInCaseEvents.push(event);
        } else {
          write(`data: ${JSON.stringify(event)}\n\n`);
          courtlistenerEvents.push(event);
        }
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(payload),
        });
        continue;
      }

      const opinions = cachedCaseOpinionTexts(record);
      const hits: Array<
        TextMatch & {
          opinion_id: number | null;
          type: string | null;
          author: string | null;
          url: string | null;
        }
      > = [];
      let totalMatches = 0;
      for (const opinion of opinions) {
        const remaining = Math.max(0, maxResults - hits.length);
        const result = findTextMatches({
          text: opinion.text,
          query,
          maxResults: remaining,
          contextChars,
          startIndex: hits.length,
        });
        totalMatches += result.totalMatches;
        hits.push(
          ...result.hits.map((hit) => ({
            ...hit,
            opinion_id: opinion.opinion_id,
            type: opinion.type,
            author: opinion.author,
            url: opinion.url,
          })),
        );
      }

      const event: CourtlistenerToolEvent = {
        type: "courtlistener_find_in_case",
        cluster_id: record.clusterId,
        query,
        total_matches: totalMatches,
        case_name: record.caseName,
        citation: record.citations[0] ?? null,
      };
      if (shouldGroupFindInCase) {
        groupedFindInCaseEvents.push(event);
      } else {
        write(`data: ${JSON.stringify(event)}\n\n`);
        courtlistenerEvents.push(event);
      }
      toolResults.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify({
          ok: true,
          cluster_id: record.clusterId,
          case_name: record.caseName,
          citation: record.citations[0] ?? null,
          query,
          total_matches: totalMatches,
          returned: hits.length,
          truncated: totalMatches > hits.length,
          hits,
        }),
      });
    } else if (tc.function.name === COURTLISTENER_TOOL_NAMES.readCase) {
      const clusterId =
        typeof args.clusterId === "number" && Number.isFinite(args.clusterId)
          ? Math.floor(args.clusterId)
          : typeof args.cluster_id === "number" &&
              Number.isFinite(args.cluster_id)
            ? Math.floor(args.cluster_id)
            : null;
      write(
        `data: ${JSON.stringify({ type: "courtlistener_read_case_start", cluster_id: clusterId })}\n\n`,
      );

      const record =
        typeof clusterId === "number" ? courtState.casesByClusterId.get(clusterId) : undefined;
      if (!record) {
        const payload = cachedCaseNotFetchedResult(clusterId);
        const event: CourtlistenerToolEvent = {
          type: "courtlistener_read_case",
          cluster_id: clusterId,
          opinion_count: 0,
          error: payload.error,
        };
        write(`data: ${JSON.stringify(event)}\n\n`);
        courtlistenerEvents.push(event);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(payload),
        });
        continue;
      }

      const opinions = cachedCaseOpinionTexts(record);
      const requestedOpinionIds = requestedCourtlistenerOpinionIds(args);
      const selectedOpinions =
        requestedOpinionIds.length > 0
          ? opinions.filter(
              (opinion) =>
                typeof opinion.opinion_id === "number" &&
                requestedOpinionIds.includes(opinion.opinion_id),
            )
          : opinions.length === 1
            ? opinions
            : [];
      if (!selectedOpinions.length) {
        const multipleOpinions = opinions.length > 1;
        const payload = {
          ok: false,
          cluster_id: record.clusterId,
          case_name: record.caseName,
          citations: record.citations,
          url: record.url,
          dateFiled: record.dateFiled,
          opinion_count: opinions.length,
          opinions: (record.opinions ?? [])
            .map(courtlistenerOpinionMetadata)
            .filter(
              (opinion): opinion is NonNullable<typeof opinion> =>
                !!opinion,
            ),
          error: multipleOpinions
            ? "Multiple opinions are available. Call courtlistener_read_case again with the opinionId or opinionIds needed."
            : "No matching opinion_id was found for this fetched case.",
        };
        const event: CourtlistenerToolEvent = {
          type: "courtlistener_read_case",
          cluster_id: record.clusterId,
          case_name: record.caseName,
          citation: record.citations[0] ?? null,
          opinion_count: 0,
          error: payload.error,
        };
        write(`data: ${JSON.stringify(event)}\n\n`);
        courtlistenerEvents.push(event);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(payload),
        });
        continue;
      }

      const event: CourtlistenerToolEvent = {
        type: "courtlistener_read_case",
        cluster_id: record.clusterId,
        case_name: record.caseName,
        citation: record.citations[0] ?? null,
        opinion_count: selectedOpinions.length,
      };
      write(`data: ${JSON.stringify(event)}\n\n`);
      courtlistenerEvents.push(event);
      toolResults.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify({
          ok: true,
          cluster_id: record.clusterId,
          case_name: record.caseName,
          citations: record.citations,
          url: record.url,
          dateFiled: record.dateFiled,
          opinion_count: opinions.length,
          returned_opinion_count: selectedOpinions.length,
          opinions: selectedOpinions,
        }),
      });
    } else if (tc.function.name === COURTLISTENER_TOOL_NAMES.verifyCitations) {
      const citations = Array.isArray(args.citations)
        ? args.citations.filter(
            (value): value is string => typeof value === "string",
          )
        : [];
      const citationCount = citations.length;
      write(
        `data: ${JSON.stringify({ type: "courtlistener_verify_citations_start", citation_count: citationCount })}\n\n`,
      );
      try {
        const result = (await verifyCourtlistenerCitations({
          citations,
          db,
          apiToken: apiKeys?.courtlistener,
        })) as {
          citationLinks?: {
            clusterId?: number | null;
            citation?: string | null;
            caseName?: string | null;
            dateFiled?: string | null;
            pdfUrl?: string | null;
            url?: string | null;
            markdown?: string;
          }[];
          results?: unknown[];
          error?: string;
          source?: string;
          [key: string]: unknown;
        };
        if (Array.isArray(result.citationLinks)) {
          const caseRecords = upsertCourtlistenerCases(
            courtState,
            result.citationLinks.map((link) => ({
              clusterId: link.clusterId,
              caseName: link.caseName,
              citation: link.citation,
              url: link.url,
              pdfUrl: link.pdfUrl,
              dateFiled: link.dateFiled,
            })),
          );
          const recordsByClusterId = new Map(
            caseRecords.map((record) => [record.clusterId, record]),
          );
          result.citationLinks = result.citationLinks.map((link) => {
            if (!link.url) return link;
            const href =
              typeof link.clusterId === "number"
                ? `us-case-${link.clusterId}`
                : link.url;
            const label = [link.caseName, link.citation]
              .filter(Boolean)
              .join(", ");
            const record =
              typeof link.clusterId === "number"
                ? recordsByClusterId.get(link.clusterId)
                : undefined;
            if (record) {
              const event = caseCitationEventFromRecord(record);
              if (event) {
                caseCitationEvents.push(event);
                write(`data: ${JSON.stringify(event)}\n\n`);
              }
            }
            return {
              ...link,
              markdown: `[${label || link.url}](${href})`,
            };
          });
        }
        const rows =
          result &&
          typeof result === "object" &&
          Array.isArray((result as { results?: unknown }).results)
            ? (result as { results: unknown[] }).results
            : [];
        const matchCount = rows.reduce<number>((count, row) => {
          if (!row || typeof row !== "object") return count;
          const clusters = (row as { clusters?: unknown }).clusters;
          return count + (Array.isArray(clusters) ? clusters.length : 0);
        }, 0);
        const error =
          result &&
          typeof result === "object" &&
          typeof (result as { error?: unknown }).error === "string"
            ? (result as { error: string }).error
            : undefined;
        const event: CourtlistenerToolEvent = {
          type: "courtlistener_verify_citations",
          citation_count: citationCount,
          match_count: matchCount,
          ...(error ? { error } : {}),
        };
        write(`data: ${JSON.stringify(event)}\n\n`);
        courtlistenerEvents.push(event);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        const event: CourtlistenerToolEvent = {
          type: "courtlistener_verify_citations",
          citation_count: citationCount,
          match_count: 0,
          error:
            err instanceof Error
              ? err.message
              : "CourtListener citation lookup failed.",
        };
        write(`data: ${JSON.stringify(event)}\n\n`);
        courtlistenerEvents.push(event);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({
            error:
              err instanceof Error
                ? err.message
                : "CourtListener citation lookup failed.",
          }),
        });
      }
    // ── Jade.io (Australian law) tools ──────────────────────────────────────

    } else if (tc.function.name === JADE_TOOL_NAMES.searchCases) {
      const { query, jurisdiction, limit, sortBy } = args as {
        query?: string;
        jurisdiction?: string;
        limit?: number;
        sortBy?: "auto" | "relevance" | "date";
      };
      const event: JadeToolEvent = {
        type: "jade_search_cases",
        query: query ?? "",
        jurisdiction,
        result_count: 0,
      };
      write(`data: ${JSON.stringify({ type: "jade_search_cases_start", query })}\n\n`);
      try {
        const results = await searchJadeCases({
          query: query ?? "",
          jurisdiction: jurisdiction as import("../../jade").Jurisdiction | undefined,
          limit,
          sortBy,
        });
        event.result_count = results.length;
        write(`data: ${JSON.stringify({ type: "jade_search_cases_result", query, result_count: results.length })}\n\n`);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ query, result_count: results.length, results }),
        });
        for (const r of results) {
          if (r.neutralCitation && r.url) {
            const citEv: JadeCaseCitationEvent = {
              type: "au_case_citation",
              caseName: r.title,
              neutralCitation: r.neutralCitation,
              reportedCitation: r.reportedCitation,
              jadeUrl: r.jadeUrl ?? r.url,
            };
            write(`data: ${JSON.stringify(citEv)}\n\n`);
          }
        }
      } catch (err) {
        event.error = err instanceof Error ? err.message : "Jade.io search failed";
        write(`data: ${JSON.stringify({ type: "jade_search_cases_error", error: event.error })}\n\n`);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ error: event.error }),
        });
      }

    } else if (tc.function.name === JADE_TOOL_NAMES.searchLegislation) {
      const { query, jurisdiction, limit } = args as {
        query?: string;
        jurisdiction?: string;
        limit?: number;
      };
      write(`data: ${JSON.stringify({ type: "jade_search_legislation_start", query })}\n\n`);
      try {
        const results = await searchJadeLegislation({
          query: query ?? "",
          jurisdiction: jurisdiction as import("../../jade").Jurisdiction | undefined,
          limit,
        });
        write(`data: ${JSON.stringify({ type: "jade_search_legislation_result", query, result_count: results.length })}\n\n`);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ query, result_count: results.length, results }),
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : "Jade.io legislation search failed";
        write(`data: ${JSON.stringify({ type: "jade_search_legislation_error", error })}\n\n`);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ error }),
        });
      }

    } else if (tc.function.name === VERIFICATION_TOOL_NAME) {
      const { citation, caseName } = args as {
        citation?: string;
        caseName?: string;
      };
      write(`data: ${JSON.stringify({ type: "verify_citation_start", citation })}\n\n`);
      try {
        const jadeApproved = await getJadeAccessApproved();
        const result = await verifyCitation(
          { citation: citation ?? "", caseName },
          { jadeApproved },
        );
        if (result.status === "needs_human" && result.searchUrl) {
          // Hand the search off to the user's own browser via a verification
          // panel; the model must not finalise until the user responds.
          const ev: CitationVerificationEvent = {
            type: "citation_verification_required",
            citation: result.citation,
            caseName: caseName ?? null,
            sourceLabel: result.sourceLabel,
            searchUrl: result.searchUrl,
          };
          write(`data: ${JSON.stringify(ev)}\n\n`);
        } else {
          write(`data: ${JSON.stringify({ type: "verify_citation_result", citation, status: result.status })}\n\n`);
        }
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : "Citation verification failed";
        write(`data: ${JSON.stringify({ type: "verify_citation_error", citation, error })}\n\n`);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ status: "error", message: error }),
        });
      }

    } else if (tc.function.name === JADE_TOOL_NAMES.fetchDocument) {
      const { url } = args as { url?: string };
      write(`data: ${JSON.stringify({ type: "jade_fetch_document_start", url })}\n\n`);
      try {
        const result = await fetchJadeDocument(url ?? "");
        write(`data: ${JSON.stringify({ type: "jade_fetch_document_result", url, paragraph_count: result.paragraphs.length })}\n\n`);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({
            url: result.url,
            paragraph_count: result.paragraphs.length,
            text: result.text.slice(0, 30_000),
            paragraphs: result.paragraphs.slice(0, 200),
          }),
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : "Document fetch failed";
        write(`data: ${JSON.stringify({ type: "jade_fetch_document_error", url, error })}\n\n`);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ error }),
        });
      }

    } else if (tc.function.name === JADE_TOOL_NAMES.formatCitation) {
      const { caseName, neutralCitation, reportedCitation, pinpoint } = args as {
        caseName?: string;
        neutralCitation?: string;
        reportedCitation?: string;
        pinpoint?: string;
      };
      const citation = formatAGLC4Citation({
        caseName: caseName ?? "",
        neutralCitation,
        reportedCitation,
        pinpoint,
      });
      toolResults.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify({ citation }),
      });

    } else if (tc.function.name === "edit_document" && docIndex) {
      const rawDocId = args.doc_id as string;
      const editsRaw = args.edits as unknown[] | undefined;
      const docId = resolveDocLabel(rawDocId, docStore, docIndex) ?? rawDocId;
      const docInfo = docStore.get(docId);
      const indexed = docIndex?.[docId];

      const emitEditError = (
        filename: string,
        documentId: string,
        error: string,
      ) => {
        // Surface the failure as a failed "Edited" block in the UI
        // (start → done-with-error) so it matches the shape the
        // success/late-failure paths already use.
        write(
          `data: ${JSON.stringify({
            type: "doc_edited_start",
            filename,
          })}\n\n`,
        );
        write(
          `data: ${JSON.stringify({
            type: "doc_edited",
            filename,
            document_id: documentId,
            version_id: "",
            download_url: "",
            annotations: [],
            error,
          })}\n\n`,
        );
      };

      if (!docInfo || !indexed) {
        const err = `Document '${docId}' not found in this chat's attachments.`;
        emitEditError(docId, indexed?.document_id ?? "", err);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ error: err }),
        });
      } else if (!Array.isArray(editsRaw) || editsRaw.length === 0) {
        const err = "edits array is required and must not be empty.";
        emitEditError(docInfo.filename, indexed.document_id, err);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ error: err }),
        });
      } else if (docInfo.file_type !== "docx") {
        const err = "edit_document only supports .docx files.";
        emitEditError(docInfo.filename, indexed.document_id, err);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ error: err }),
        });
      } else {
        write(
          `data: ${JSON.stringify({
            type: "doc_edited_start",
            filename: docInfo.filename,
          })}\n\n`,
        );
        const edits: EditInput[] = (editsRaw as Record<string, unknown>[]).map(
          (e) => ({
            find: String(e.find ?? ""),
            replace: String(e.replace ?? ""),
            context_before: String(e.context_before ?? ""),
            context_after: String(e.context_after ?? ""),
            reason: e.reason ? String(e.reason) : undefined,
          }),
        );
        const reuseVersion = turnEditState?.get(indexed.document_id);
        const result = await runEditDocument({
          documentId: indexed.document_id,
          userId,
          edits,
          db,
          reuseVersion,
        });

        if (result.ok) {
          turnEditState?.set(indexed.document_id, {
            versionId: result.version_id,
            versionNumber: result.version_number,
            storagePath: result.storage_path,
          });
          clearTurnReadsForDocument(turnReadState, indexed.document_id);
          // Keep the chat-local doc label pointed at the latest
          // edited version so any follow-up read_document call in
          // the same assistant turn reads and cites the same bytes.
          if (docIndex[docId]) {
            docIndex[docId] = {
              ...docIndex[docId],
              version_id: result.version_id,
              version_number: result.version_number,
            };
          }
          const currentDocStore = docStore.get(docId);
          if (currentDocStore) {
            docStore.set(docId, {
              ...currentDocStore,
              storage_path: result.storage_path,
            });
          }
          const payload: DocEditedResult = {
            filename: docInfo.filename,
            document_id: indexed.document_id,
            version_id: result.version_id,
            version_number: result.version_number,
            download_url: result.download_url,
            annotations: result.annotations,
          };
          docsEdited.push(payload);
          write(
            `data: ${JSON.stringify({
              type: "doc_edited",
              ...payload,
            })}\n\n`,
          );
          toolResults.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({
              ok: true,
              doc_id: docId,
              document_id: indexed.document_id,
              version_id: result.version_id,
              version_number: result.version_number,
              applied: result.annotations.length,
              errors: result.errors,
              next_required_action: [
                `The edited document remains available as doc_id "${docId}".`,
                `Before making factual claims about the edited document's final contents, call read_document with doc_id "${docId}" and base the response on that returned text.`,
                `Do not include download links or URLs in your prose response; the edited document card is shown automatically by the UI.`,
                `If you describe specific content from the edited document, cite it with [N] markers and a final <CITATIONS> block using doc_id "${docId}".`,
              ].join(" "),
            }),
          });
        } else {
          write(
            `data: ${JSON.stringify({
              type: "doc_edited",
              filename: docInfo.filename,
              document_id: indexed.document_id,
              version_id: "",
              download_url: "",
              annotations: [],
              error: result.error,
            })}\n\n`,
          );
          toolResults.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({
              ok: false,
              error: result.error,
            }),
          });
        }
      }
    } else if (tc.function.name === "replicate_document" && docIndex) {
      const rawDocId = args.doc_id as string;
      const requestedFilename =
        typeof args.new_filename === "string" && args.new_filename.trim()
          ? args.new_filename.trim()
          : null;
      const requestedCount =
        typeof args.count === "number" && Number.isFinite(args.count)
          ? Math.max(1, Math.min(20, Math.floor(args.count)))
          : 1;
      const sourceLabel =
        resolveDocLabel(rawDocId, docStore, docIndex) ?? rawDocId;
      const sourceInfo = docStore.get(sourceLabel);
      const sourceIndexed = docIndex[sourceLabel];
      const sourceFilename = sourceInfo?.filename ?? rawDocId;

      write(
        `data: ${JSON.stringify({
          type: "doc_replicate_start",
          filename: sourceFilename,
          count: requestedCount,
        })}\n\n`,
      );

      const fail = (error: string) => {
        write(
          `data: ${JSON.stringify({
            type: "doc_replicated",
            filename: sourceFilename,
            count: requestedCount,
            copies: [],
            error,
          })}\n\n`,
        );
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ ok: false, error }),
        });
      };

      if (!sourceInfo || !sourceIndexed) {
        fail(`Document '${rawDocId}' not found in this project.`);
      } else if (!projectId) {
        fail("replicate_document is only available in project chats.");
      } else {
        try {
          // Pull the active version once — every copy gets the
          // same starting bytes (with any accepted tracked
          // changes rolled in), no point re-fetching per copy.
          const active = await loadActiveVersion(sourceIndexed.document_id, db);
          const sourcePath = active?.storage_path ?? sourceInfo.storage_path;
          const sourcePdfPath = active?.pdf_storage_path ?? null;
          const raw = await downloadFile(sourcePath);
          const pdfBytes = sourcePdfPath
            ? await downloadFile(sourcePdfPath)
            : null;
          if (!raw) {
            fail("Could not read the source document's bytes from storage.");
          } else {
            // Build N filenames. With count=1 keep the
            // pre-existing "(copy)" suffix; with count>1 use
            // numbered "(1)", "(2)" suffixes.
            const srcExt = sourceInfo.filename.match(/\.[^./\\]+$/)?.[0] ?? "";
            const baseStem = (() => {
              if (requestedFilename) {
                return requestedFilename.replace(/\.[^./\\]+$/, "");
              }
              return sourceInfo.filename.replace(/\.[^./\\]+$/, "");
            })();
            const filenames: string[] = [];
            for (let n = 1; n <= requestedCount; n++) {
              const suffix =
                requestedCount === 1
                  ? requestedFilename
                    ? ""
                    : " (copy)"
                  : ` (${n})`;
              filenames.push(`${baseStem}${suffix}${srcExt}`);
            }

            // Bulk insert N documents in one round-trip.
            const docRows = filenames.map((fn) => ({
              project_id: projectId,
              user_id: userId,
              status: "ready",
            }));
            const { data: insertedDocs, error: docErr } = await db
              .from("documents")
              .insert(docRows)
              .select("id");
            if (docErr || !insertedDocs || insertedDocs.length === 0) {
              fail(
                `Failed to record replicated documents: ${docErr?.message ?? "unknown"}`,
              );
            } else {
              // Preserve the request order so each row pairs
              // with the right filename. Supabase returns
              // inserted rows in the same order as the
              // payload.
              const newDocs = (insertedDocs as { id: string }[]).map(
                (doc, idx) => ({
                  ...doc,
                  filename: filenames[idx] ?? "Untitled document.docx",
                }),
              );
              const contentType = contentTypeForDocumentType(
                sourceInfo.file_type,
              );

              // Parallel uploads: the doc bytes (and PDF
              // rendition if any) for every new copy.
              const uploadJobs: Promise<unknown>[] = [];
              const newKeys: string[] = [];
              const newPdfKeys: (string | null)[] = [];
              for (const d of newDocs) {
                const key = storageKey(userId, d.id, d.filename);
                newKeys.push(key);
                uploadJobs.push(uploadFile(key, raw, contentType));
                if (pdfBytes) {
                  const pdfKey = convertedPdfKey(userId, d.id);
                  newPdfKeys.push(pdfKey);
                  uploadJobs.push(
                    uploadFile(pdfKey, pdfBytes, "application/pdf"),
                  );
                } else {
                  newPdfKeys.push(null);
                }
              }
              await Promise.all(uploadJobs);

              // Bulk insert N versions in one round-trip.
              const versionRows = newDocs.map((d, idx) => ({
                document_id: d.id,
                storage_path: newKeys[idx],
                pdf_storage_path: newPdfKeys[idx],
                source: "upload",
                version_number: 1,
                filename: d.filename,
                file_type: active?.file_type ?? sourceInfo.file_type,
                size_bytes: active?.size_bytes ?? raw.byteLength,
                page_count: active?.page_count ?? null,
              }));
              const { data: insertedVersions, error: verErr } = await db
                .from("document_versions")
                .insert(versionRows)
                .select("id, document_id");
              if (
                verErr ||
                !insertedVersions ||
                insertedVersions.length !== newDocs.length
              ) {
                fail(
                  `Failed to record replicated document versions: ${verErr?.message ?? "unknown"}`,
                );
              } else {
                const versionByDocId = new Map<string, string>();
                for (const v of insertedVersions as {
                  id: string;
                  document_id: string;
                }[]) {
                  versionByDocId.set(v.document_id, v.id);
                }

                // current_version_id has to be a per-row
                // value, so a single UPDATE statement
                // can't cover all N. Fan out in parallel
                // instead of sequential awaits.
                await Promise.all(
                  newDocs.map((d) =>
                    db
                      .from("documents")
                      .update({
                        current_version_id: versionByDocId.get(d.id),
                      })
                      .eq("id", d.id),
                  ),
                );

                // Register every copy under a fresh doc-N
                // slug so the model can edit/read any of
                // them in the same turn.
                const existingLabels = new Set(Object.keys(docIndex));
                let nextLabelIdx = 0;
                const copies: {
                  new_filename: string;
                  document_id: string;
                  version_id: string;
                }[] = [];
                const toolPayloadCopies: {
                  doc_id: string;
                  document_id: string;
                  version_id: string;
                  filename: string;
                  download_url: string;
                }[] = [];
                for (let idx = 0; idx < newDocs.length; idx++) {
                  const d = newDocs[idx];
                  const newKey = newKeys[idx];
                  const versionId = versionByDocId.get(d.id);
                  if (!versionId) continue;
                  while (existingLabels.has(`doc-${nextLabelIdx}`))
                    nextLabelIdx++;
                  const slug = `doc-${nextLabelIdx}`;
                  existingLabels.add(slug);
                  docIndex[slug] = {
                    document_id: d.id,
                    filename: d.filename,
                  };
                  docStore.set(slug, {
                    storage_path: newKey,
                    file_type: sourceInfo.file_type,
                    filename: d.filename,
                  });
                  copies.push({
                    new_filename: d.filename,
                    document_id: d.id,
                    version_id: versionId,
                  });
                  toolPayloadCopies.push({
                    doc_id: slug,
                    document_id: d.id,
                    version_id: versionId,
                    filename: d.filename,
                    download_url: buildDownloadUrl(newKey, d.filename),
                  });
                }

                write(
                  `data: ${JSON.stringify({
                    type: "doc_replicated",
                    filename: sourceFilename,
                    count: copies.length,
                    copies,
                  })}\n\n`,
                );
                docsReplicated.push({
                  filename: sourceFilename,
                  count: copies.length,
                  copies,
                });
                toolResults.push({
                  role: "tool",
                  tool_call_id: tc.id,
                  content: JSON.stringify({
                    ok: true,
                    count: copies.length,
                    copies: toolPayloadCopies,
                  }),
                });
              }
            }
          }
        } catch (e) {
          fail(`replicate_document failed: ${String(e)}`);
        }
      }
    } else if (tc.function.name === "generate_docx") {
      const title = args.title as string;
      const landscape = !!args.landscape;
      devLog(
        `[generate_docx] title="${title}" landscape=${landscape} args.landscape=${args.landscape}`,
      );
      const previewFilename = safeGeneratedFilename(title, "docx");
      write(
        `data: ${JSON.stringify({ type: "doc_created_start", filename: previewFilename })}\n\n`,
      );
      const result = await generateDocx(
        title,
        args.sections as unknown[],
        userId,
        db,
        { landscape, projectId: projectId ?? null },
      );
      registerGeneratedDocument(
        tc,
        result as Record<string, unknown>,
        previewFilename,
        "docx",
      );
    } else if (tc.function.name === "generate_excel") {
      const title = args.title as string;
      devLog(`[generate_excel] title="${title}"`);
      const previewFilename = safeGeneratedFilename(title, "xlsx");
      write(
        `data: ${JSON.stringify({ type: "doc_created_start", filename: previewFilename })}\n\n`,
      );
      const result = await generateExcel(
        title,
        args.sheets as unknown[],
        userId,
        db,
        { projectId: projectId ?? null },
      );
      registerGeneratedDocument(
        tc,
        result as Record<string, unknown>,
        previewFilename,
        "xlsx",
      );
    } else if (tc.function.name === "generate_ppt") {
      const title = args.title as string;
      devLog(`[generate_ppt] title="${title}"`);
      const previewFilename = safeGeneratedFilename(title, "pptx");
      write(
        `data: ${JSON.stringify({ type: "doc_created_start", filename: previewFilename })}\n\n`,
      );
      const result = await generatePpt(
        title,
        args.slides as unknown[],
        userId,
        db,
        { projectId: projectId ?? null },
      );
      registerGeneratedDocument(
        tc,
        result as Record<string, unknown>,
        previewFilename,
        "pptx",
      );
    }
  }

  if (shouldGroupFindInCase && groupedFindInCaseEvents.length > 0) {
    const errors = groupedFindInCaseEvents
      .map((event) => event.error)
      .filter((error): error is string => !!error);
    const groupEvent: CourtlistenerToolEvent = {
      type: "courtlistener_find_in_case",
      cluster_id: null,
      query: "",
      total_matches: groupedFindInCaseEvents.reduce(
        (sum, event) => sum + event.total_matches,
        0,
      ),
      searches: groupedFindInCaseEvents.map(findInCaseSearchSummary),
      ...(errors.length ? { error: errors.join("; ") } : {}),
    };
    write(`data: ${JSON.stringify(groupEvent)}\n\n`);
    courtlistenerEvents.push(groupEvent);
  }

  return {
    toolResults,
    docsRead,
    docsFound,
    docsCreated,
    docsReplicated,
    workflowsApplied,
    docsEdited,
    askInputsEvents,
    courtlistenerEvents,
    caseCitationEvents,
    mcpEvents,
    knowledgeEvents,
  };
}
