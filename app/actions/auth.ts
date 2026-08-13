"use server";

import { redirect } from "next/navigation";

import { logAction } from "@/lib/audit/log-action";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { loginSchema } from "@/lib/validation/auth";
import { LOGIN_ROUTE } from "@/lib/routes";
import type { UserProfile } from "@/types/auth";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const INVALID_CREDENTIALS = "البريد الإلكتروني أو كلمة المرور غير صحيحة";
const GENERIC_ERROR = "حدث خطأ أثناء تسجيل الدخول، حاول مرة أخرى.";
const INACTIVE_ACCOUNT = "حسابك غير مفعل. يرجى التواصل مع مدير النظام.";

/**
 * Signs a user in.
 *
 * Runs on the server so the session cookies are written by Next itself, the
 * `is_active` check cannot be skipped by a tampered client, and the login is
 * recorded in the audit trail. Raw Supabase errors never reach the browser.
 */
export async function signInAction(input: {
  email: string;
  password: string;
}): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, error: INVALID_CREDENTIALS, fieldErrors };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    // Everything that is not a server fault reads as "wrong credentials", so
    // the form never reveals whether an address is registered.
    const isCredentialError =
      !error?.status || error.status === 400 || error.status === 401;
    return { ok: false, error: isCredentialError ? INVALID_CREDENTIALS : GENERIC_ERROR };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .maybeSingle<UserProfile>();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    return { ok: false, error: GENERIC_ERROR };
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    return { ok: false, error: INACTIVE_ACCOUNT };
  }

  await logAction({
    client: supabase,
    userId: data.user.id,
    action: "LOGIN",
    entityType: "auth",
    entityId: data.user.id,
    metadata: { email: profile.email, role: profile.role },
  });

  return { ok: true };
}

/**
 * Signs the current user out and returns to the login page.
 * Supabase revokes the refresh token, so the session is genuinely invalidated
 * rather than merely forgotten by the UI.
 */
export async function signOutAction(): Promise<never> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (user) {
    await logAction({
      client: supabase,
      userId: user.id,
      action: "LOGOUT",
      entityType: "auth",
      entityId: user.id,
    });
  }

  await supabase.auth.signOut();

  redirect(LOGIN_ROUTE);
}
