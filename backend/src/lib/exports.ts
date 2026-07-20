/**
 * C040 — Flexible output downloads: any text/markdown output → DOCX, PDF or
 * Markdown, with optional AGLC4 citation formatting (LLM pass).
 */

import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { docxToPdf } from "./convert";
import { completeText, type UserApiKeys } from "./llm";
import { getUserModelSettings } from "./userSettings";
import type { createServerSupabase } from "./supabase";

type Db = ReturnType<typeof createServerSupabase>;

export type ExportFormat = "docx" | "pdf" | "md";
export type CitationStyle = "as_written" | "aglc4";

/** Reformat citations to AGLC4 via a low-tier LLM pass (content otherwise untouched). */
export async function applyCitationStyle(
  db: Db,
  userId: string,
  content: string,
  style: CitationStyle,
  apiKeys?: UserApiKeys,
): Promise<string> {
  if (style !== "aglc4") return content;
  try {
    const { title_model, api_keys } = await getUserModelSettings(userId, db);
    const out = await completeText({
      model: title_model,
      systemPrompt:
        "Reformat every legal citation in the text to comply with the Australian Guide to Legal Citation (4th ed). Change ONLY citation formatting — do not alter any other wording, structure or markdown. Return the full text.",
      user: content.slice(0, 100_000),
      maxTokens: 16_000,
      apiKeys: apiKeys ?? api_keys,
    });
    return out.trim() || content;
  } catch {
    return content; // style pass is best-effort
  }
}

/** Very small markdown → docx conversion (headings, bullets, bold stripped to text). */
function markdownToDocx(title: string, markdown: string): Document {
  const paragraphs: Paragraph[] = [];
  if (title) {
    paragraphs.push(
      new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
    );
  }
  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.replace(/\*\*([^*]+)\*\*/g, "$1").trimEnd();
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const levels = [
        HeadingLevel.HEADING_1,
        HeadingLevel.HEADING_2,
        HeadingLevel.HEADING_3,
        HeadingLevel.HEADING_4,
        HeadingLevel.HEADING_5,
        HeadingLevel.HEADING_6,
      ];
      paragraphs.push(
        new Paragraph({
          text: h[2],
          heading: levels[Math.min(h[1].length, 6) - 1],
        }),
      );
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      paragraphs.push(
        new Paragraph({ text: bullet[1], bullet: { level: 0 } }),
      );
      continue;
    }
    paragraphs.push(
      new Paragraph({ children: [new TextRun(line)] }),
    );
  }
  return new Document({ sections: [{ children: paragraphs }] });
}

export async function buildExport(args: {
  title: string;
  content: string;
  format: ExportFormat;
}): Promise<{ buffer: Buffer; contentType: string; extension: string }> {
  if (args.format === "md") {
    return {
      buffer: Buffer.from(
        args.title ? `# ${args.title}\n\n${args.content}` : args.content,
        "utf8",
      ),
      contentType: "text/markdown; charset=utf-8",
      extension: "md",
    };
  }
  const doc = markdownToDocx(args.title, args.content);
  const docxBuffer = await Packer.toBuffer(doc);
  if (args.format === "docx") {
    return {
      buffer: Buffer.from(docxBuffer),
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      extension: "docx",
    };
  }
  const pdfBuffer = await docxToPdf(Buffer.from(docxBuffer));
  return {
    buffer: pdfBuffer,
    contentType: "application/pdf",
    extension: "pdf",
  };
}
