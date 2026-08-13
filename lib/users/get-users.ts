import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { UserProfile } from "@/types/auth";

/**
 * Lists every profile, newest first.
 *
 * Deliberately uses the *user-scoped* client rather than the service-role one:
 * RLS decides what comes back, so a non-admin would receive only their own row
 * even if the page guard were ever bypassed.
 */
export async function listUsers(): Promise<UserProfile[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[users] list failed:", error.message);
    throw new Error("تعذر تحميل المستخدمين");
  }

  return (data ?? []) as UserProfile[];
}
