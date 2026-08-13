"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, USER_ROLES } from "@/lib/permissions/roles";
import type { UserRole } from "@/types/auth";

/** Role picker shared by the create and edit dialogs. */
export function RoleSelectField({
  value,
  onChange,
  disabled,
  error,
  /** Roles the current user is not allowed to assign. */
  disabledRoles = [],
}: {
  value: UserRole;
  onChange: (role: UserRole) => void;
  disabled?: boolean;
  error?: string;
  disabledRoles?: UserRole[];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="role">الدور</Label>
      <Select
        value={value}
        onValueChange={(next) => onChange(next as UserRole)}
        disabled={disabled}
      >
        <SelectTrigger id="role" className="h-11 w-full" aria-invalid={!!error}>
          <SelectValue placeholder="اختر الدور" />
        </SelectTrigger>
        <SelectContent>
          {USER_ROLES.map((role) => (
            <SelectItem
              key={role}
              value={role}
              disabled={disabledRoles.includes(role)}
            >
              <div className="flex flex-col items-start gap-0.5 py-0.5">
                <span className="font-medium">{ROLE_LABELS[role]}</span>
                <span className="text-muted-foreground text-xs">
                  {ROLE_DESCRIPTIONS[role]}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
