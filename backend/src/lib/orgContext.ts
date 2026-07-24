/**
 * C033 — Organisation Context. Markdown records injected (bounded) into
 * drafting/review/agent prompts:
 *   * app-level: app_settings key 'org_context' (admin-edited)
 *   * per-project: projects.context (admin-edited; only when the chat/run is
 *     scoped to a project)
 *   * per-user: user_profiles.personal_context
 */

import { createServerSupabase } from "./supabase";
import { getAppSetting } from "./appSettings";

type Db = ReturnType<typeof createServerSupabase>;

export const ORG_CONTEXT_KEY = "org_context";
const MAX_CONTEXT_CHARS = 6000; // ~1.5k tokens

export async function getOrgContextForUser(
    userId: string,
    db?: Db,
    projectId?: string | null,
): Promise<string | null> {
    const client = db ?? createServerSupabase();
    const [orgContext, { data: profile }, projectContext] = await Promise.all([
        getAppSetting<string>(ORG_CONTEXT_KEY, "", client),
        client
            .from("user_profiles")
            .select("personal_context")
            .eq("user_id", userId)
            .maybeSingle(),
        projectId
            ? client
                  .from("projects")
                  .select("context")
                  .eq("id", projectId)
                  .maybeSingle()
                  .then(
                      ({ data }) =>
                          (data as { context?: string | null } | null)
                              ?.context ?? "",
                  )
            : Promise.resolve(""),
    ]);
    const personal =
        (profile as { personal_context?: string | null } | null)
            ?.personal_context ?? "";
    const parts: string[] = [];
    if (orgContext?.trim()) {
        parts.push(`Organisation context:\n${orgContext.trim()}`);
    }
    if (projectContext?.trim()) {
        parts.push(`Project context:\n${projectContext.trim()}`);
    }
    if (personal.trim()) {
        parts.push(`User context:\n${personal.trim()}`);
    }
    if (parts.length === 0) return null;
    return parts.join("\n\n").slice(0, MAX_CONTEXT_CHARS);
}
