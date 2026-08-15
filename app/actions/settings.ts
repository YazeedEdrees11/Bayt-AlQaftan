"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { SETTING_KEYS, type SettingKey } from "@/types/settings";
import type { ActionResult } from "./auth";

/**
 * Settings writes.
 *
 * Every one of these is a thin wrapper around a SECURITY DEFINER function that
 * re-checks the permission and validates the value. The action's own guard is
 * there so an unauthorized caller gets a clean redirect instead of a database
 * error, not because it is the thing keeping settings safe (§80).
 */

const GENERIC = "تعذر حفظ الإعدادات.";

/** Turns a Postgres error into something a shopkeeper can act on. */
function explain(message: string): string {
  if (message.includes("unknown_setting")) return "إعداد غير معروف.";
  if (message.includes("invalid_setting_value")) return "القيمة غير صالحة لهذا الإعداد.";
  if (message.includes("setting_below_minimum")) return "القيمة أقل من الحد الأدنى المسموح.";
  if (message.includes("setting_above_maximum")) return "القيمة أكبر من الحد الأقصى المسموح.";
  if (message.includes("duplicate_prefix")) return "هذه البادئة مستخدمة في نوع مستندات آخر.";
  if (message.includes("invalid_prefix")) {
    return "البادئة يجب أن تكون حروفاً لاتينية أو أرقاماً، بحد أقصى ٨ خانات.";
  }
  if (message.includes("setting_too_long")) return "النص أطول من المسموح.";
  if (message.includes("admin_permissions_are_fixed")) {
    return "صلاحيات المسؤول ثابتة ولا يمكن تعديلها.";
  }
  if (message.includes("currency_change_not_confirmed")) {
    return "تغيير العملة يحتاج تأكيداً صريحاً.";
  }
  if (message.includes("forbidden")) return "ليس لديك صلاحية لهذا الإجراء.";
  return GENERIC;
}

/**
 * Saves a batch of settings.
 *
 * The screens save a whole category at once, but each value goes through
 * `update_setting` on its own so that one bad field cannot silently drop the
 * rest — and so the audit trail records a row per key, which is what §54 asks
 * for. Failures are collected and reported per key rather than as one shrug.
 */
export async function updateSettingsAction(
  values: Record<string, unknown>,
): Promise<ActionResult<{ saved: string[] }>> {
  await requirePermission("MANAGE_SETTINGS");
  const supabase = await createClient();

  const entries = Object.entries(values).filter(([key]) =>
    (SETTING_KEYS as readonly string[]).includes(key),
  );
  if (entries.length === 0) return { ok: true, data: { saved: [] } };

  const saved: string[] = [];
  const fieldErrors: Record<string, string> = {};

  for (const [key, value] of entries) {
    const { error } = await supabase.rpc("update_setting", {
      p_key: key,
      p_value: value as never,
    });
    if (error) {
      console.error(`[settings] update ${key}:`, error.message);
      fieldErrors[key] = explain(error.message);
    } else {
      saved.push(key);
    }
  }

  revalidatePath("/settings", "layout");
  revalidatePath("/dashboard");

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      error: saved.length > 0 ? "حُفظت بعض الإعدادات ولم تُحفظ أخرى." : GENERIC,
      fieldErrors,
    };
  }
  return { ok: true, data: { saved } };
}

/** A single setting, for the toggles that save on the spot. */
export async function updateSettingAction(
  key: SettingKey,
  value: unknown,
): Promise<ActionResult> {
  return updateSettingsAction({ [key]: value }) as Promise<ActionResult>;
}

/* -------------------------------------------------------------------------- */
/*                                Store profile                               */
/* -------------------------------------------------------------------------- */

export async function updateStoreSettingsAction(
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  await requirePermission("MANAGE_SETTINGS");
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_store_settings", {
    p_payload: payload as never,
  });

  if (error) {
    console.error("[settings] updateStoreSettings:", error.message);
    return { ok: false, error: explain(error.message) };
  }

  revalidatePath("/settings", "layout");
  revalidatePath("/", "layout");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*                              Role permissions                              */
/* -------------------------------------------------------------------------- */

export async function setRolePermissionAction(
  role: string,
  permission: string,
  allowed: boolean,
): Promise<ActionResult> {
  await requirePermission("MANAGE_SETTINGS");
  const supabase = await createClient();

  const { error } = await supabase.rpc("set_role_permission", {
    p_role: role,
    p_permission: permission,
    p_allowed: allowed,
  });

  if (error) {
    console.error("[settings] setRolePermission:", error.message);
    return { ok: false, error: explain(error.message) };
  }

  // The matrix decides what every screen renders and what the database allows,
  // so the whole application is stale after this.
  revalidatePath("/", "layout");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*                            Alert thresholds (§43)                          */
/* -------------------------------------------------------------------------- */

/**
 * The five alert thresholds live in `report_settings`, where Phase 7 put them
 * and where `get_management_alerts` still reads them. Storing them a second
 * time in `system_settings` would give the same number two homes, so the
 * notifications screen writes to their owner instead.
 */
export async function updateAlertThresholdsAction(
  payload: Record<string, number>,
): Promise<ActionResult> {
  await requirePermission("MANAGE_SETTINGS");
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_report_settings", {
    p_payload: payload as never,
  });

  if (error) {
    console.error("[settings] updateAlertThresholds:", error.message);
    return { ok: false, error: explain(error.message) };
  }

  revalidatePath("/settings/notifications");
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*                          Backup verification (§67)                         */
/* -------------------------------------------------------------------------- */

/**
 * Records that an administrator checked a backup.
 *
 * Not a backup, and not proof of one — the note is what carries the meaning,
 * which is why the database refuses an empty one.
 */
export async function recordBackupVerifiedAction(payload: {
  note: string;
  restore_tested: boolean;
}): Promise<ActionResult> {
  await requirePermission("MANAGE_SETTINGS");
  const supabase = await createClient();

  const { error } = await supabase.rpc("record_backup_verified", {
    p_payload: payload as never,
  });

  if (error) {
    console.error("[settings] recordBackupVerified:", error.message);
    if (error.message.includes("backup_note_required")) {
      return { ok: false, error: "اكتب ما الذي تحققت منه." };
    }
    return { ok: false, error: explain(error.message) };
  }

  revalidatePath("/settings/system");
  revalidatePath("/settings/system/readiness");
  revalidatePath("/notifications");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*                                Notifications                               */
/* -------------------------------------------------------------------------- */

export async function generateNotificationsAction(): Promise<ActionResult<{ created: number }>> {
  await requirePermission("VIEW_NOTIFICATIONS");
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("generate_notifications");
  if (error) {
    console.error("[settings] generateNotifications:", error.message);
    return { ok: false, error: "تعذر تحديث التنبيهات." };
  }

  revalidatePath("/notifications");
  return { ok: true, data: { created: Number(data ?? 0) } };
}

export async function markNotificationReadAction(id: string): Promise<ActionResult> {
  await requirePermission("VIEW_NOTIFICATIONS");
  const supabase = await createClient();

  const { error } = await supabase.rpc("mark_notification_read", { p_id: id });
  if (error) {
    console.error("[settings] markNotificationRead:", error.message);
    return { ok: false, error: "تعذر تحديث التنبيه." };
  }

  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function markAllNotificationsReadAction(): Promise<ActionResult<{ count: number }>> {
  await requirePermission("VIEW_NOTIFICATIONS");
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("mark_all_notifications_read");
  if (error) {
    console.error("[settings] markAllNotificationsRead:", error.message);
    return { ok: false, error: "تعذر تحديث التنبيهات." };
  }

  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return { ok: true, data: { count: Number(data ?? 0) } };
}

export async function getUnreadNotificationCountAction(): Promise<number> {
  await requirePermission("VIEW_NOTIFICATIONS");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unread_notification_count");
  if (error) {
    console.error("[settings] getUnreadNotificationCountAction:", error.message);
    return 0;
  }
  return Number(data ?? 0);
}

