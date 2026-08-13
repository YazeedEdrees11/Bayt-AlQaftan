import "server-only";

import { redirect } from "next/navigation";

import { getCurrentAuthUser } from "./get-current-profile";
import { hasAnyPermission, hasPermission } from "@/lib/permissions/check-permission";
import { LOGIN_ROUTE } from "@/lib/routes";
import type { AuthUser, Permission } from "@/types/auth";

export const ACCESS_DENIED_ROUTE = "/access-denied";
/** Signs the session out server-side, then lands on /login?error=inactive. */
export const INACTIVE_SIGNOUT_ROUTE = "/auth/signout?reason=inactive";

/**
 * Server-side guards for protected pages and server actions.
 *
 * The middleware already blocks anonymous traffic; these guards add the checks
 * it deliberately skips (profile existence, `is_active`, permissions) and are
 * the authorization layer the UI must never be trusted to replace.
 */

/**
 * Requires a signed-in, active user with a profile.
 * Redirects to /login (no session) or signs the user out (deactivated).
 */
export async function requireAuth(): Promise<AuthUser> {
  const authUser = await getCurrentAuthUser();

  if (!authUser) redirect(LOGIN_ROUTE);
  if (!authUser.profile.is_active) redirect(INACTIVE_SIGNOUT_ROUTE);

  return authUser;
}

/** Requires an active session holding `permission`. */
export async function requirePermission(
  permission: Permission,
): Promise<AuthUser> {
  const authUser = await requireAuth();

  if (!hasPermission(authUser.profile, permission)) {
    redirect(ACCESS_DENIED_ROUTE);
  }

  return authUser;
}

/** Requires an active session holding at least one of `permissions`. */
export async function requireAnyPermission(
  permissions: readonly Permission[],
): Promise<AuthUser> {
  const authUser = await requireAuth();

  if (!hasAnyPermission(authUser.profile, permissions)) {
    redirect(ACCESS_DENIED_ROUTE);
  }

  return authUser;
}

/** Requires the ADMIN role. */
export async function requireAdmin(): Promise<AuthUser> {
  const authUser = await requireAuth();

  if (authUser.profile.role !== "ADMIN") {
    redirect(ACCESS_DENIED_ROUTE);
  }

  return authUser;
}

/**
 * Guard for Server Actions: returns the user or an error instead of
 * redirecting, so the action can answer with a friendly Arabic message.
 */
export type AuthorizationResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string };

export async function authorizeAction(
  permission?: Permission,
): Promise<AuthorizationResult> {
  const authUser = await getCurrentAuthUser();

  if (!authUser) {
    return { ok: false, error: "انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى." };
  }

  if (!authUser.profile.is_active) {
    return { ok: false, error: "حسابك غير مفعل. يرجى التواصل مع مدير النظام." };
  }

  if (permission && !hasPermission(authUser.profile, permission)) {
    return { ok: false, error: "ليس لديك صلاحية لتنفيذ هذه العملية." };
  }

  return { ok: true, user: authUser };
}
