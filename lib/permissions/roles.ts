import type { UserRole } from "@/types/auth";

/** All roles, ordered from most to least privileged. */
export const USER_ROLES: readonly UserRole[] = [
  "ADMIN",
  "MANAGER",
  "STAFF",
] as const;

/** Arabic display names shown in the UI. */
export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "مدير النظام",
  MANAGER: "مدير",
  STAFF: "موظف",
};

/** Short Arabic descriptions used in the user-creation form. */
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  ADMIN: "صلاحية كاملة على النظام وإدارة المستخدمين",
  MANAGER: "إدارة المنتجات والمخزون والمشتريات والمبيعات والتقارير",
  STAFF: "تسجيل المبيعات والاطلاع على المنتجات والمخزون والعملاء",
};

/**
 * Rank used for hierarchy checks — a user may never act on a role that is
 * ranked at or above their own (e.g. a MANAGER cannot touch an ADMIN).
 */
const ROLE_RANK: Record<UserRole, number> = {
  ADMIN: 3,
  MANAGER: 2,
  STAFF: 1,
};

export function getRoleLabel(role: UserRole | string | null | undefined) {
  if (!role) return ROLE_LABELS.STAFF;
  return ROLE_LABELS[role as UserRole] ?? String(role);
}

export function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" && USER_ROLES.includes(value as UserRole)
  );
}

export function getRoleRank(role: UserRole): number {
  return ROLE_RANK[role];
}

/**
 * Whether `actor` is allowed to assign / modify `target` role.
 * Only an ADMIN outranks every role; nobody may grant a role above their own.
 */
export function canManageRole(actor: UserRole, target: UserRole): boolean {
  if (actor === "ADMIN") return true;
  return getRoleRank(actor) > getRoleRank(target);
}
