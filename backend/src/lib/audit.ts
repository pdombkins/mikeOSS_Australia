/**
 * P3 — Audit trail (C019). Append-only record of every consequential action.
 * Fire-and-forget: audit failures never break the user-facing operation,
 * but are logged for the operator.
 */

import { createServerSupabase } from "./supabase";
import { devLog } from "./chat/types";

export type AuditEventType =
    | "tool_call"
    | "doc_read"
    | "doc_download"
    | "doc_edit"
    | "agent_step"
    | "share"
    | "export"
    | "member_change";

export type AuditArgs = {
    actorId: string;
    eventType: AuditEventType;
    projectId?: string | null;
    resourceType?:
        | "document"
        | "chat"
        | "agent_run"
        | "tabular_review"
        | "playbook"
        | "kb"
        | "clause"
        | "workflow"
        | "project"
        | "list_item"
        | "group"
        | null;
    resourceId?: string | null;
    toolName?: string | null;
    /** Keep small — a digest, never full tool arguments or document bodies. */
    detail?: Record<string, unknown> | null;
};

export function recordAudit(args: AuditArgs): void {
    const db = createServerSupabase();
    void db
        .from("audit_events")
        .insert({
            actor_id: args.actorId,
            project_id: args.projectId ?? null,
            event_type: args.eventType,
            resource_type: args.resourceType ?? null,
            resource_id: args.resourceId ?? null,
            tool_name: args.toolName ?? null,
            detail: args.detail ?? null,
        })
        .then(({ error }) => {
            if (error) devLog("[audit] insert failed:", error.message);
        });
}

/** Truncated digest of tool arguments — safe for the audit log. */
export function argsDigest(input: unknown, max = 300): string {
    try {
        const s = JSON.stringify(input);
        return s.length > max ? `${s.slice(0, max)}…(${s.length}b)` : s;
    } catch {
        return "[unserializable]";
    }
}
