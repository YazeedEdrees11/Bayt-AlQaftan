import "server-only";

import { createClient } from "@/lib/supabase/server";
import { DISPLAY_TIMEZONE } from "@/lib/utils/format";
import { getStoreSettings } from "./queries";
import type { HealthCheck, SystemHealth } from "@/types/settings";

/**
 * System health (§67, §96).
 *
 * Each check does the smallest real thing that proves the service answers — a
 * one-row read, a session lookup, a bucket listing — rather than reporting a
 * configured URL back as if it were a status.
 *
 * Nothing here returns a key, a connection string or a host. A health screen
 * that leaks where the database lives is worse than no health screen.
 */
export async function checkSystemHealth(): Promise<SystemHealth> {
  const supabase = await createClient();

  const [database, auth, storage] = await Promise.all([
    check("database", "قاعدة البيانات", async () => {
      const { error } = await supabase.from("store_settings").select("id").limit(1);
      if (error) throw new Error(error.message);
      return "تستجيب للاستعلامات";
    }),
    check("auth", "المصادقة", async () => {
      const { error } = await supabase.auth.getUser();
      if (error) throw new Error(error.message);
      return "الجلسة سارية";
    }),
    check("storage", "التخزين", async () => {
      const { error } = await supabase.storage.from("store-assets").list("", { limit: 1 });
      if (error) throw new Error(error.message);
      return "الحاويات متاحة";
    }),
  ]);

  // Dates render in a zone fixed at build time, so the server and the browser
  // cannot disagree. If the shop has since recorded a different one, that is
  // worth saying out loud rather than letting the setting quietly not apply.
  const store = await getStoreSettings();
  const timezone: HealthCheck =
    !store || store.timezone === DISPLAY_TIMEZONE
      ? {
          key: "timezone",
          label: "المنطقة الزمنية",
          state: "healthy",
          detail: `التواريخ تُعرض بتوقيت ${DISPLAY_TIMEZONE}`,
        }
      : {
          key: "timezone",
          label: "المنطقة الزمنية",
          state: "degraded",
          detail:
            `الإعدادات تقول ${store.timezone} والعرض بتوقيت ${DISPLAY_TIMEZONE}` +
            " — يتطلب تحديث NEXT_PUBLIC_STORE_TIMEZONE وإعادة النشر",
        };

  return {
    checks: [database, auth, storage, timezone],
    checkedAt: new Date().toISOString(),
  };
}

async function check(
  key: string,
  label: string,
  probe: () => Promise<string>,
): Promise<HealthCheck> {
  try {
    const detail = await probe();
    return { key, label, state: "healthy", detail };
  } catch (error) {
    // The reason is logged for whoever maintains the system; the screen says
    // only that the check failed, because the message can carry internals.
    console.error(`[health] ${key}:`, error);
    return { key, label, state: "down", detail: "لم تستجب الخدمة" };
  }
}
