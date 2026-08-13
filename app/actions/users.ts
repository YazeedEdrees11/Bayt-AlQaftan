"use server";

import { revalidatePath } from "next/cache";

import { authorizeAction } from "@/lib/auth/require-auth";
import { logAction } from "@/lib/audit/log-action";
import { createAdminClient } from "@/lib/supabase/server";
import { canManageRole } from "@/lib/permissions/roles";
import {
  createUserSchema,
  setUserActiveSchema,
  resetUserPasswordSchema,
  updateUserSchema,
} from "@/lib/validation/auth";
import type { ActionResult } from "./auth";
import type { UserProfile } from "@/types/auth";

const GENERIC_ERROR = "حدث خطأ أثناء تنفيذ العملية";

function collectFieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

/** Reads a single profile with the privileged client (used for audit context). */
async function getProfileById(id: string): Promise<UserProfile | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle<UserProfile>();
  return data ?? null;
}

/**
 * Creates a user.
 *
 * Runs entirely on the server with the service-role key, which never leaves
 * this process. Supabase Auth owns the password — it is hashed by Supabase and
 * never stored or handled by this application.
 */
export async function createUserAction(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction("MANAGE_USERS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "يرجى التحقق من البيانات المدخلة",
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const { full_name, email, password, role } = parsed.data;

  // Nobody may create an account that outranks them.
  if (!canManageRole(auth.user.profile.role, role)) {
    return { ok: false, error: "ليس لديك صلاحية لإنشاء مستخدم بهذا الدور." };
  }

  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role },
  });

  if (error || !data.user) {
    const message = error?.message?.toLowerCase() ?? "";
    if (message.includes("already") || error?.status === 422) {
      return {
        ok: false,
        error: "هذا البريد الإلكتروني مسجل مسبقاً",
        fieldErrors: { email: "هذا البريد الإلكتروني مسجل مسبقاً" },
      };
    }
    console.error("[users] createUser failed:", error?.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  // The auth trigger already created the profile; this makes the row match the
  // submitted values exactly even if the trigger fell back to defaults.
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: data.user.id,
      full_name,
      email,
      role,
      avatar_url: null,
      is_active: true,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    console.error("[users] profile upsert failed:", profileError.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  await logAction({
    userId: auth.user.id,
    action: "CREATE_USER",
    entityType: "user",
    entityId: data.user.id,
    metadata: { email, role, full_name },
  });

  revalidatePath("/users");
  return { ok: true };
}

/** Updates a user's display name and role. */
export async function updateUserAction(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction("MANAGE_USERS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "يرجى التحقق من البيانات المدخلة",
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const { id, full_name, role } = parsed.data;
  const target = await getProfileById(id);

  if (!target) return { ok: false, error: "المستخدم غير موجود" };

  const roleChanged = target.role !== role;

  // Self-protection: an administrator cannot demote themselves and lock the
  // system out. Another administrator has to do it.
  if (roleChanged && id === auth.user.id) {
    return { ok: false, error: "لا يمكنك تغيير دورك الخاص." };
  }

  if (
    !canManageRole(auth.user.profile.role, role) ||
    !canManageRole(auth.user.profile.role, target.role)
  ) {
    return { ok: false, error: "ليس لديك صلاحية لتعديل هذا المستخدم." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ full_name, role })
    .eq("id", id);

  if (error) {
    console.error("[users] update failed:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  // Keep the auth metadata aligned with the profile.
  await admin.auth.admin.updateUserById(id, {
    user_metadata: { full_name, role },
  });

  await logAction({
    userId: auth.user.id,
    action: "UPDATE_USER",
    entityType: "user",
    entityId: id,
    metadata: { full_name, role },
  });

  if (roleChanged) {
    await logAction({
      userId: auth.user.id,
      action: "CHANGE_ROLE",
      entityType: "user",
      entityId: id,
      metadata: { from: target.role, to: role },
    });
  }

  revalidatePath("/users");
  return { ok: true };
}

/**
 * Sets a new password for another user.
 *
 * Until this existed there was no way back into a locked-out account: the login
 * screen has no recovery link, and nothing in the users screen touched
 * credentials. On a shop floor that is not a theoretical problem — someone
 * forgets a password in the first week, and without this the only remedy is the
 * Supabase dashboard.
 *
 * It goes through the same admin API that created the account. The application
 * still hashes nothing, stores nothing, and never sees the password again: it
 * is handed to Supabase Auth and dropped. The audit entry records *that* the
 * password was changed and by whom, and deliberately not what it was set to.
 */
export async function resetUserPasswordAction(
  input: unknown,
): Promise<ActionResult> {
  const auth = await authorizeAction("MANAGE_USERS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = resetUserPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "يرجى التحقق من البيانات المدخلة",
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const { id, password } = parsed.data;
  const target = await getProfileById(id);
  if (!target) return { ok: false, error: "المستخدم غير موجود" };

  // The same hierarchy that governs editing: nobody resets the password of an
  // account they could not otherwise manage. Without this a manager with
  // MANAGE_USERS could take over an administrator's account by resetting it.
  if (!canManageRole(auth.user.profile.role, target.role)) {
    return { ok: false, error: "ليس لديك صلاحية لتعديل هذا المستخدم." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password });

  if (error) {
    console.error("[users] password reset failed:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  await logAction({
    userId: auth.user.id,
    action: "RESET_USER_PASSWORD",
    entityType: "user",
    entityId: id,
    metadata: { email: target.email, role: target.role },
  });

  revalidatePath("/users");
  return { ok: true };
}

/**
 * Activates or deactivates a user.
 * Accounts are never deleted to disable them — deactivation preserves the
 * history that future sales and purchase records will point at.
 */
export async function setUserActiveAction(
  input: unknown,
): Promise<ActionResult> {
  const auth = await authorizeAction("MANAGE_USERS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = setUserActiveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "يرجى التحقق من البيانات المدخلة" };
  }

  const { id, is_active } = parsed.data;

  if (id === auth.user.id) {
    return { ok: false, error: "لا يمكنك تغيير حالة حسابك الخاص." };
  }

  const target = await getProfileById(id);
  if (!target) return { ok: false, error: "المستخدم غير موجود" };

  if (!canManageRole(auth.user.profile.role, target.role)) {
    return { ok: false, error: "ليس لديك صلاحية لتعديل هذا المستخدم." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ is_active })
    .eq("id", id);

  if (error) {
    console.error("[users] activation change failed:", error.message);
    return { ok: false, error: GENERIC_ERROR };
  }

  await logAction({
    userId: auth.user.id,
    action: is_active ? "ACTIVATE_USER" : "DEACTIVATE_USER",
    entityType: "user",
    entityId: id,
    metadata: { email: target.email },
  });

  revalidatePath("/users");
  return { ok: true };
}
