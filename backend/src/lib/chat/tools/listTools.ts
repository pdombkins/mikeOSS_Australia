/**
 * C076 — Lists tool schemas (tasks, facts & deadlines on matters).
 * Available in project-scoped chats and agent runs; the dispatcher rejects
 * calls when no project is in context. Write tools are audit-logged and
 * confined to intake/drafting roles in agent runs (ROLE_TOOLSETS).
 */

export const LIST_TOOLS = [
    {
        type: "function",
        function: {
            name: "list_list_items",
            description:
                "List this matter's work items — tasks, key facts, and deadlines — with status, due dates and assignees. Use this to understand outstanding work on the matter, before adding items (to avoid duplicates), or when the user asks what is due or outstanding.",
            parameters: {
                type: "object",
                properties: {
                    kind: {
                        type: "string",
                        description:
                            "Optional filter: task | fact | deadline. Omit for all items.",
                    },
                },
            },
        },
    },
    {
        type: "function",
        function: {
            name: "add_list_item",
            description:
                "Add a work item to this matter's list. kind 'task' for actionable work, 'fact' for a key fact worth pinning (optionally with a citation — an MNC like [2024] HCA 5 or an AGLC4 reference; never invent one), 'deadline' for date-bound obligations (set due_at). Use when the user asks you to track something, or when drafting/review surfaces a follow-up the user confirms should be tracked.",
            parameters: {
                type: "object",
                properties: {
                    kind: {
                        type: "string",
                        description: "task | fact | deadline",
                    },
                    title: {
                        type: "string",
                        description: "Short imperative title (≤500 chars).",
                    },
                    detail: {
                        type: "string",
                        description: "Optional longer description or context.",
                    },
                    due_at: {
                        type: "string",
                        description:
                            "Optional ISO 8601 due date/time — required in practice for kind 'deadline'.",
                    },
                    citation: {
                        type: "string",
                        description:
                            "Optional authority reference for facts (MNC or AGLC4 text). Only cite authorities that appear in the conversation or verified sources.",
                    },
                },
                required: ["kind", "title"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "update_list_item_status",
            description:
                "Update the status of one of this matter's list items (open | in_progress | done | dismissed). Use when the user says something is finished or no longer needed. Do not mark agent-executed tasks done on your own initiative — the human confirms completion.",
            parameters: {
                type: "object",
                properties: {
                    item_id: {
                        type: "string",
                        description: "The list item id (from list_list_items).",
                    },
                    status: {
                        type: "string",
                        description: "open | in_progress | done | dismissed",
                    },
                },
                required: ["item_id", "status"],
            },
        },
    },
];
