/**
 * App-wide settings (shared instance config), stored in the `app_settings`
 * key/value table and managed by admins. Read/written via the service role,
 * so these bypass RLS.
 */

import { createServerSupabase } from "./supabase";

type Db = ReturnType<typeof createServerSupabase>;

export const APP_SETTING_KEYS = {
  /** Has the operator obtained Jade.io's written permission to access it via this tool? */
  jadeAccessApproved: "jade_access_approved",
} as const;

export async function getAppSetting<T>(key: string, fallback: T, db?: Db): Promise<T> {
  const client = db ?? createServerSupabase();
  const { data, error } = await client
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return fallback;
  const value = (data as { value: T }).value;
  return value === null || value === undefined ? fallback : value;
}

export async function setAppSetting(
  key: string,
  value: unknown,
  updatedBy?: string,
  db?: Db,
): Promise<void> {
  const client = db ?? createServerSupabase();
  await client.from("app_settings").upsert(
    {
      key,
      value,
      updated_by: updatedBy ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
}

/** Defaults to false — no Jade.io approval unless an admin has turned it on. */
export async function getJadeAccessApproved(db?: Db): Promise<boolean> {
  return getAppSetting<boolean>(APP_SETTING_KEYS.jadeAccessApproved, false, db);
}
