"use server";

import { revalidatePath } from "next/cache";

import { authorizeAction } from "@/lib/auth/require-auth";
import { logAction } from "@/lib/audit/log-action";
import { createClient } from "@/lib/supabase/server";
import { updateProfileSchema } from "@/lib/validation/auth";
import { PROFILE_ROUTE } from "@/lib/routes";
import type { ActionResult } from "./auth";

/**
 * Updates the signed-in user's own profile.
 *
 * Only `full_name` and `avatar_url` are writable. The update runs through the
 * *user's* client, so RLS restricts it to their own row, and the database
 * trigger rejects any attempt to smuggle in a new role, activation state or
 * email — the client cannot escalate even if this action were called directly.
 */
export async function updateProfileAction(
  input: unknown,
): Promise<ActionResult> {
  const auth = await authorizeAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      ok: false,
      error: "يرجى التحقق من البيانات المدخلة",
      fieldErrors,
    };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.full_name,
      avatar_url: parsed.data.avatar_url,
    })
    .eq("id", auth.user.id);

  if (error) {
    console.error("[profile] update failed:", error.message);
    return { ok: false, error: "حدث خطأ أثناء تنفيذ العملية" };
  }

  await logAction({
    client: supabase,
    userId: auth.user.id,
    action: "UPDATE_PROFILE",
    entityType: "profile",
    entityId: auth.user.id,
    metadata: { full_name: parsed.data.full_name },
  });

  revalidatePath(PROFILE_ROUTE);
  revalidatePath("/", "layout");

  return { ok: true };
}
