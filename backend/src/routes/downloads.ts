import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { buildContentDisposition, downloadFile } from "../lib/storage";
import { verifyDownload } from "../lib/downloadTokens";
import { ensureDocAccess } from "../lib/access";
import { contentTypeForDocumentType } from "../lib/documentTypes";

export const downloadsRouter = Router();

function contentTypeFor(filename: string): string {
    const suffix = filename.includes(".")
        ? filename.split(".").pop()?.toLowerCase()
        : "";
    return contentTypeForDocumentType(suffix);
}

// GET /download/:token
downloadsRouter.get("/:token", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const info = verifyDownload(req.params.token);
    if (!info)
        return void res.status(404).json({ detail: "Invalid link" });

    const db = createServerSupabase();
    let version:
        | {
              id: string;
              document_id: string;
          }
        | null = null;

    const { data: byStoragePath } = await db
        .from("document_versions")
        .select("id, document_id")
        .eq("storage_path", info.path)
        .is("deleted_at", null)
        .maybeSingle();
    if (byStoragePath) {
        version = byStoragePath as { id: string; document_id: string };
    }

    if (!version)
        return void res.status(404).json({ detail: "File not found" });

    const { data: doc } = await db
        .from("documents")
        .select("id, user_id, project_id")
        .eq("id", version.document_id)
        .single();
    if (!doc)
        return void res.status(404).json({ detail: "File not found" });

    const access = await ensureDocAccess(doc, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "File not found" });

    const raw = await downloadFile(info.path);
    if (!raw)
        return void res.status(404).json({ detail: "File not found" });

    res.setHeader("Content-Type", contentTypeFor(info.filename));
    res.setHeader(
        "Content-Disposition",
        buildContentDisposition("attachment", info.filename),
    );
    res.send(Buffer.from(raw));
});

// ---------------------------------------------------------------------------
// C040 — flexible output export: any text output → DOCX | PDF | Markdown
// with optional AGLC4 citation restyling.
// POST /download/export { title?, content, format, citation_style? }
// ---------------------------------------------------------------------------
import { requireAuth as requireAuthExport } from "../middleware/auth";
import { createServerSupabase as createDbExport } from "../lib/supabase";
import { applyCitationStyle, buildExport } from "../lib/exports";
import { recordAudit as recordAuditExport } from "../lib/audit";

downloadsRouter.post("/export", requireAuthExport, async (req, res) => {
  const userId = res.locals.userId as string;
  const content =
    typeof req.body?.content === "string" ? req.body.content : "";
  if (!content.trim())
    return void res.status(400).json({ detail: "content is required" });
  const format =
    req.body?.format === "pdf" || req.body?.format === "md"
      ? req.body.format
      : "docx";
  const style =
    req.body?.citation_style === "aglc4" ? "aglc4" : "as_written";
  const title =
    typeof req.body?.title === "string" ? req.body.title.slice(0, 200) : "";

  try {
    const db = createDbExport();
    const styled = await applyCitationStyle(db, userId, content, style);
    const out = await buildExport({ title, content: styled, format });
    const safeName =
      (title || "mike-export")
        .replace(/[^a-zA-Z0-9 _-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 60) || "mike-export";
    recordAuditExport({
      actorId: userId,
      eventType: "export",
      detail: { format, style, bytes: out.buffer.length },
    });
    res.setHeader("Content-Type", out.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName}.${out.extension}"`,
    );
    res.send(out.buffer);
  } catch (err) {
    res.status(500).json({
      detail: err instanceof Error ? err.message : "Export failed",
    });
  }
});
