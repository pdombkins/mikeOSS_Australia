/**
 * P1 — Agent runtime shared types (C013/C030).
 */

export type AgentRole =
    | "intake"
    | "research"
    | "drafting"
    | "review"
    | "verify";

export type AgentRunKind =
    | "assistant"
    | "workflow"
    | "draft_from_precedent"
    | "playbook_builder"
    | "verify"
    | "regulatory_scan";

export type AgentRunStatus =
    | "planning"
    | "awaiting_approval"
    | "running"
    | "paused"
    | "completed"
    | "failed"
    | "cancelled";

export type PlanStep = {
    position: number;
    depends_on: number[];
    role: AgentRole;
    instruction: string;
    tool_allowlist: string[];
};

export type AgentPlan = {
    title: string;
    steps: PlanStep[];
};

/** Tools each specialist role may use (C013 guardrails / tool routing).
 *  Write-capable tools are confined to drafting; research is read-only. */
export const ROLE_TOOLSETS: Record<AgentRole, string[]> = {
    // C076 — list tools: intake & drafting may create/update matter list
    // items (write); research/review/verify read the list only.
    intake: [
        "list_documents",
        "read_document",
        "find_in_document",
        "list_list_items",
        "add_list_item",
        "update_list_item_status",
    ],
    research: [
        "list_documents",
        "fetch_documents",
        "read_document",
        "find_in_document",
        "search_knowledge",
        "search_clauses",
        "list_playbooks",
        "jade_search_cases",
        "jade_search_legislation",
        "jade_validate_citation",
        "jade_fetch_document",
        "jade_format_citation",
        "tabular_ask",
        "list_list_items",
    ],
    drafting: [
        "list_documents",
        "fetch_documents",
        "read_document",
        "find_in_document",
        "search_knowledge",
        "search_clauses",
        "list_playbooks",
        "generate_docx",
        "generate_excel",
        "generate_ppt",
        "edit_document",
        "replicate_document",
        "jade_format_citation",
        "list_list_items",
        "add_list_item",
        "update_list_item_status",
    ],
    review: [
        "list_documents",
        "fetch_documents",
        "read_document",
        "find_in_document",
        "list_playbooks",
        "review_against_playbook",
        "search_knowledge",
        "search_clauses",
        "jade_validate_citation",
        "jade_format_citation",
        "list_list_items",
    ],
    verify: [
        "read_document",
        "find_in_document",
        "jade_validate_citation",
        "jade_fetch_document",
        "jade_format_citation",
        "verify_assertions",
        "list_list_items",
    ],
};

/** Tools that mutate state — any plan containing them requires approval (C030). */
export const WRITE_TOOLS = new Set([
    "generate_docx",
    "generate_excel",
    "generate_ppt",
    "edit_document",
    "replicate_document",
    "create_playbook",
    "upsert_playbook_rule",
    "delete_playbook_rule",
    "save_clause",
    // C076 — list mutations gate plans behind approval too.
    "add_list_item",
    "update_list_item_status",
]);

export function planNeedsApproval(plan: AgentPlan): boolean {
    if (plan.steps.length > 1) return true;
    return plan.steps.some((s) =>
        s.tool_allowlist.some((t) => WRITE_TOOLS.has(t)),
    );
}
