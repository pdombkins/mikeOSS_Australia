/**
 * C025 — Tabular Analysis as an agent/chat tool (`tabular_ask`).
 * Creates a persisted single-column Tabular Review, answers the question for
 * each document synchronously, stores the cells, and returns compact results
 * the model can reason over.
 */

import { createServerSupabase } from "./supabase";
import { downloadFile } from "./storage";
import { attachActiveVersionPaths } from "./documentVersions";
import { extractDocumentMarkdown } from "./extractText";
import { filterAccessibleDocumentIds } from "./access";
import { completeText, type UserApiKeys } from "./llm";
import { getUserModelSettings } from "./userSettings";

type Db = ReturnType<typeof createServerSupabase>;

const MAX_DOCS = 20;

export async function runTabularAsk(args: {
  db: Db;
  userId: string;
  userEmail?: string | null;
  question: string;
  documentIds: string[];
  title?: string | null;
  apiKeys?: UserApiKeys;
}): Promise<{
  review_id: string | null;
  results: { document_id: string; filename: string; answer: string }[];
  note?: string;
}> {
  const { db, userId } = args;
  const question = args.question.trim();
  const allowed = await filterAccessibleDocumentIds(
    args.documentIds.slice(0, MAX_DOCS),
    userId,
    args.userEmail,
    db,
  );
  if (!question || allowed.length === 0) {
    return {
      review_id: null,
      results: [],
      note: "No accessible documents (or empty question).",
    };
  }

  const { tabular_model, api_keys } = await getUserModelSettings(userId, db);
  const apiKeys = args.apiKeys ?? api_keys;

  const columnsConfig = [
    { index: 0, name: "Answer", prompt: question, type: "text" },
  ];
  const { data: review } = await db
    .from("tabular_reviews")
    .insert({
      user_id: userId,
      title: (args.title ?? question).slice(0, 120),
      columns_config: columnsConfig,
      document_ids: allowed,
      project_id: null,
    })
    .select("id")
    .single();
  const reviewId = (review as { id?: string } | null)?.id ?? null;

  const { data: docs } = await db
    .from("documents")
    .select("id, current_version_id")
    .in("id", allowed);
  const rows = (docs ?? []) as {
    id: string;
    current_version_id?: string | null;
    filename?: string;
    storage_path?: string;
    file_type?: string;
  }[];
  await attachActiveVersionPaths(db, rows);

  const results: { document_id: string; filename: string; answer: string }[] =
    [];
  for (const doc of rows) {
    const filename =
      typeof doc.filename === "string" && doc.filename
        ? doc.filename
        : "Untitled document";
    let answer = "Not extracted (document unreadable).";
    try {
      const path =
        typeof doc.storage_path === "string" ? doc.storage_path : "";
      const buf = path ? await downloadFile(path) : null;
      if (buf) {
        const text = await extractDocumentMarkdown(
          buf,
          typeof doc.file_type === "string" ? doc.file_type : "",
        );
        answer = (
          await completeText({
            model: tabular_model,
            systemPrompt:
              "You are a legal document analyst. Answer the question for THIS document only, concisely (≤120 words). Quote key language verbatim where useful. If the document does not address it, reply 'Not addressed'.",
            user: `Document: ${filename}\n\n${text.slice(0, 100_000)}\n\n---\nQuestion: ${question}`,
            maxTokens: 500,
            apiKeys,
          })
        ).trim();
      }
    } catch (err) {
      answer = `Extraction failed: ${err instanceof Error ? err.message : "unknown error"}`;
    }
    results.push({ document_id: doc.id, filename, answer });
    if (reviewId) {
      await db.from("tabular_cells").insert({
        review_id: reviewId,
        document_id: doc.id,
        column_index: 0,
        content: JSON.stringify({
          summary: answer,
          flag: "grey",
          reasoning: "tabular_ask",
        }),
        status: "done",
      });
    }
  }

  return {
    review_id: reviewId,
    results,
    note: reviewId
      ? `Saved as Tabular Review ${reviewId} — the user can open it at /tabular-reviews/${reviewId}.`
      : undefined,
  };
}
