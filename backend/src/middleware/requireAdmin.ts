/**
 * Admin gate (is_admin = true in user_profiles). Mirrors the inline check in
 * routes/admin.ts; extracted so other admin-only routers (groups) can share
 * it. Must run after requireAuth.
 */

import type { Request, Response, NextFunction } from "express";
import { createServerSupabase } from "../lib/supabase";

export async function requireAdmin(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = res.locals.userId as string;
  const db = createServerSupabase();
  const { data, error } = await db
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data?.is_admin) {
    res.status(403).json({ detail: "Admin access required" });
    return;
  }
  next();
}
