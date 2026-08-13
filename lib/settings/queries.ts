import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type {
  AppConfig,
  AppNotification,
  AuditLogRow,
  DataStatistics,
  SettingCategory,
  SettingKey,
  StoreSettings,
  SystemSetting,
} from "@/types/settings";

const FAILED = "تعذر قراءة الإعدادات.";

/**
 * The store profile.
 *
 * Readable by every signed-in user because the header, the receipts and the
 * printed reports all need the shop's name and logo. Memoized per request, so
 * a page that prints a receipt does not fetch it twice.
 */
export const getStoreSettings = cache(async (): Promise<StoreSettings | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("store_settings")
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[settings] getStoreSettings:", error.message);
    return null;
  }
  return (data as StoreSettings) ?? null;
});

/** Every setting in a category, with the metadata its control is built from. */
export async function getSettingsByCategory(
  category: SettingCategory,
): Promise<SystemSetting[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_settings_by_category", {
    p_category: category,
  });

  if (error) {
    console.error("[settings] getSettingsByCategory:", error.message);
    throw new Error(FAILED);
  }
  return (data ?? []) as SystemSetting[];
}

/** Category settings as a plain key → value map, for reading a rule. */
export async function getSettingsMap(
  category: SettingCategory,
): Promise<Record<string, unknown>> {
  const rows = await getSettingsByCategory(category);
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

/**
 * A single public setting, for the screens that need to obey one without
 * loading a whole category — the sale form asking what the discount ceiling is,
 * for example. The value is advisory here: the server enforces it again.
 */
export const getSetting = cache(async (key: SettingKey): Promise<unknown> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_setting", { p_key: key });
  if (error) {
    console.error("[settings] getSetting:", error.message);
    return null;
  }
  return data;
});

export async function getSettingBool(key: SettingKey, fallback: boolean) {
  const value = await getSetting(key);
  return typeof value === "boolean" ? value : fallback;
}

export async function getSettingNumber(key: SettingKey, fallback: number) {
  const value = await getSetting(key);
  return typeof value === "number" ? value : fallback;
}

/* -------------------------------------------------------------------------- */
/*                                Notifications                               */
/* -------------------------------------------------------------------------- */

export async function listNotifications({
  unreadOnly = false,
  type,
  limit = 100,
}: { unreadOnly?: boolean; type?: string; limit?: number } = {}): Promise<
  AppNotification[]
> {
  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) query = query.eq("is_read", false);
  if (type) query = query.eq("type", type as AppNotification["type"]);

  const { data, error } = await query;
  if (error) {
    console.error("[settings] listNotifications:", error.message);
    return [];
  }
  return (data ?? []) as AppNotification[];
}

export const getUnreadNotificationCount = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unread_notification_count");
  if (error) {
    console.error("[settings] unread count:", error.message);
    return 0;
  }
  return Number(data ?? 0);
});

/* -------------------------------------------------------------------------- */
/*                                 Audit log                                  */
/* -------------------------------------------------------------------------- */

export type AuditQuery = {
  search?: string;
  action?: string;
  entity?: string;
  user?: string;
  from?: string;
  to?: string;
  page?: number;
  perPage?: number;
};

export async function searchAuditLogs({
  search,
  action,
  entity,
  user,
  from,
  to,
  page = 1,
  perPage = 50,
}: AuditQuery = {}): Promise<{ rows: AuditLogRow[]; total: number; totalPages: number; page: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_audit_logs", {
    p_search: search ?? null,
    p_action: action ?? null,
    p_entity: entity ?? null,
    p_user: user ?? null,
    p_date_from: from ?? null,
    p_date_to: to ?? null,
    p_limit: perPage,
    p_offset: (Math.max(page, 1) - 1) * perPage,
  });

  if (error) {
    console.error("[settings] searchAuditLogs:", error.message);
    throw new Error("تعذر قراءة سجل النشاط.");
  }

  const rows = (data ?? []) as (AuditLogRow & { total_count: number })[];
  const total = Number(rows[0]?.total_count ?? 0);
  return {
    rows,
    total,
    page: Math.max(page, 1),
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/**
 * When each user last did something the trail recorded (§11).
 *
 * Read from `audit_logs` rather than stamped on the profile: activity is
 * whatever the system already witnessed, and a column the browser could touch
 * would be a column the browser could lie about.
 */
export async function getLastActivityByUser(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("user_id, created_at")
    .order("created_at", { ascending: false })
    .limit(4000);

  if (error) {
    console.error("[settings] getLastActivityByUser:", error.message);
    return new Map();
  }

  // Rows arrive newest first, so the first sighting of a user is their latest.
  const latest = new Map<string, string>();
  for (const row of (data ?? []) as { user_id: string | null; created_at: string }[]) {
    if (row.user_id && !latest.has(row.user_id)) latest.set(row.user_id, row.created_at);
  }
  return latest;
}

/** The distinct actions present in the trail, for the filter (§48). */
export async function listAuditActions(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("action")
    .limit(1000);
  if (error) return [];
  return [...new Set((data ?? []).map((row) => (row as { action: string }).action))].sort();
}

/* -------------------------------------------------------------------------- */
/*                              System and data                               */
/* -------------------------------------------------------------------------- */

export const getAppConfig = cache(async (): Promise<AppConfig | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("app_config").select("*").maybeSingle();
  if (error) {
    console.error("[settings] getAppConfig:", error.message);
    return null;
  }
  return (data as AppConfig) ?? null;
});

/** Recent operational events, grouped, for the system screen (§97). */
export async function getSystemEvents(hours = 24): Promise<
  { severity: string; category: string; event_count: number; latest_at: string }[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("system_event_summary", { p_hours: hours });
  if (error) {
    console.error("[settings] getSystemEvents:", error.message);
    return [];
  }
  return (data ?? []) as {
    severity: string; category: string; event_count: number; latest_at: string;
  }[];
}

export async function getDataStatistics(): Promise<DataStatistics | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_data_statistics");
  if (error) {
    console.error("[settings] getDataStatistics:", error.message);
    return null;
  }
  return ((data ?? [])[0] as DataStatistics) ?? null;
}
