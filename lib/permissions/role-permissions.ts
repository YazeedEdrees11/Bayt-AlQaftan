import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { ROLE_PERMISSIONS } from "./permissions";
import type { Permission, UserRole } from "@/types/auth";

export type RoleMatrix = Record<UserRole, readonly Permission[]>;

/**
 * The permissions the signed-in user actually holds (Phase 8).
 *
 * Until Phase 8 this mapping was a TypeScript constant, which meant it could
 * only ever be enforced in the application. It now lives in `role_permissions`,
 * and the SQL guards (`can_sell()` and its siblings) read the same table — so
 * the matrix screen changes what the database will actually allow, not merely
 * what the interface offers.
 *
 * `my_permissions()` returns the caller's own row set and nothing about anyone
 * else's role, so a salesperson can be told what they may do without being
 * shown the shape of the whole matrix. Memoized per request.
 *
 * On failure the compiled-in defaults for the role are used. That is
 * deliberate: the table was seeded from those very defaults, so falling back
 * reproduces the behaviour the shop had before the matrix existed rather than
 * locking everyone out of a working system because one query failed. Anything
 * an owner *added* is lost until the read succeeds — never granted by accident.
 */
export const getMyPermissions = cache(
  async (role: UserRole): Promise<readonly Permission[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("my_permissions");

      if (error || !Array.isArray(data) || data.length === 0) {
        if (error) console.error("[permissions] read failed:", error.message);
        return ROLE_PERMISSIONS[role] ?? [];
      }
      return data as Permission[];
    } catch (error) {
      console.error("[permissions] read threw:", error);
      return ROLE_PERMISSIONS[role] ?? [];
    }
  },
);

/**
 * The whole matrix, for the screen that edits it. Administrator-only by RLS —
 * a non-administrator gets nothing back rather than a partial picture.
 */
export const getRoleMatrix = cache(async (): Promise<RoleMatrix> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("role_permissions")
    .select("role, permission, allowed")
    .eq("allowed", true);

  if (error) {
    console.error("[permissions] matrix read failed:", error.message);
    throw new Error("تعذر قراءة مصفوفة الصلاحيات.");
  }

  const matrix: Record<UserRole, Permission[]> = { ADMIN: [], MANAGER: [], STAFF: [] };
  for (const row of (data ?? []) as { role: UserRole; permission: Permission }[]) {
    matrix[row.role]?.push(row.permission);
  }
  return matrix;
});
