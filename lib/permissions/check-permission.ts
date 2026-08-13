import type { Permission, UserProfile, UserRole } from "@/types/auth";
import { ROLE_PERMISSIONS } from "./permissions";

/**
 * Pure permission helpers. Safe to import from both server and client code.
 *
 * These are for *rendering* decisions. Real authorization is always enforced
 * again server-side (server actions / route guards) and by Postgres RLS.
 */

/** Resolve the permission set of a role. */
export function getPermissionsForRole(role: UserRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Does the role hold this permission? */
export function roleHasPermission(
  role: UserRole,
  permission: Permission,
): boolean {
  return getPermissionsForRole(role).includes(permission);
}

/**
 * Does the profile hold this permission?
 * Deactivated accounts hold no permissions at all.
 *
 * A profile loaded through `getCurrentProfile` carries the permissions its role
 * holds according to the database matrix (Phase 8), and those win. Profiles
 * built elsewhere — a client component handed only a role, a test fixture —
 * fall back to the compiled-in defaults the matrix was seeded from.
 */
export function hasPermission(
  profile:
    | (Pick<UserProfile, "role" | "is_active"> & Pick<Partial<UserProfile>, "permissions">)
    | null
    | undefined,
  permission: Permission,
): boolean {
  if (!profile || !profile.is_active) return false;
  if (profile.permissions) return profile.permissions.includes(permission);
  return roleHasPermission(profile.role, permission);
}

/** True when the profile holds at least one of the permissions. */
export function hasAnyPermission(
  profile: Pick<UserProfile, "role" | "is_active"> | null | undefined,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((permission) => hasPermission(profile, permission));
}

/** True when the profile holds every one of the permissions. */
export function hasAllPermissions(
  profile: Pick<UserProfile, "role" | "is_active"> | null | undefined,
  permissions: readonly Permission[],
): boolean {
  return permissions.every((permission) => hasPermission(profile, permission));
}

/** Convenience check used by user-management screens and actions. */
export function isAdmin(
  profile: Pick<UserProfile, "role" | "is_active"> | null | undefined,
): boolean {
  return !!profile && profile.is_active && profile.role === "ADMIN";
}
