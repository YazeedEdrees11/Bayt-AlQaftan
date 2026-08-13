"use client";

import { useOptimistic, useState, useTransition } from "react";
import { LoaderCircle, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { setRolePermissionAction } from "@/app/actions/settings";
import { PERMISSION_GROUPS } from "@/lib/permissions/permission-groups";
import { PERMISSION_LABELS } from "@/lib/permissions/permissions";
import { ROLE_LABELS } from "@/lib/permissions/roles";
import { cn } from "@/lib/utils/cn";
import type { Permission, UserRole } from "@/types/auth";

type Matrix = Record<UserRole, readonly Permission[]>;

const EDITABLE_ROLES: UserRole[] = ["MANAGER", "STAFF"];

/**
 * The permission matrix (§14, §15).
 *
 * Each switch writes straight through to `role_permissions`, which is the table
 * the database's own guards read — so turning off «إنشاء بيع» for a salesperson
 * does not merely hide a button, it makes `create_sale` refuse them.
 *
 * ADMIN is shown but locked. §16 requires that an administrator always exists
 * and cannot be locked out, and the database refuses the write regardless; a
 * disabled switch is the honest way to say so.
 */
export function PermissionMatrix({ matrix }: { matrix: Matrix }) {
  const [role, setRole] = useState<UserRole>("MANAGER");

  return (
    <Tabs value={role} onValueChange={(value) => setRole(value as UserRole)}>
      <TabsList className="mb-4">
        {(["ADMIN", "MANAGER", "STAFF"] as UserRole[]).map((value) => (
          <TabsTrigger key={value} value={value}>
            {ROLE_LABELS[value]}
          </TabsTrigger>
        ))}
      </TabsList>

      {(["ADMIN", "MANAGER", "STAFF"] as UserRole[]).map((value) => (
        <TabsContent key={value} value={value} className="space-y-4">
          {value === "ADMIN" ? (
            <div className="border-border/70 bg-muted/40 flex items-start gap-3 rounded-xl border p-4">
              <Lock aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              <p className="text-muted-foreground text-sm leading-relaxed">
                المسؤول يملك كل الصلاحيات، وهذه ليست قابلة للتعديل. النظام يجب
                أن يبقى فيه مسؤول قادر على إدارته — لذلك تُرفض هذه التغييرات في
                قاعدة البيانات نفسها، لا في الواجهة فقط.
              </p>
            </div>
          ) : null}

          <RolePermissions
            role={value}
            held={new Set(matrix[value] ?? [])}
            editable={EDITABLE_ROLES.includes(value)}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function RolePermissions({
  role,
  held,
  editable,
}: {
  role: UserRole;
  held: Set<Permission>;
  editable: boolean;
}) {
  const [granted, setGranted] = useOptimistic(
    held,
    (current: Set<Permission>, change: { permission: Permission; allowed: boolean }) => {
      const next = new Set(current);
      if (change.allowed) next.add(change.permission);
      else next.delete(change.permission);
      return next;
    },
  );
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<Permission | null>(null);

  function toggle(permission: Permission, allowed: boolean) {
    setBusy(permission);
    startTransition(async () => {
      setGranted({ permission, allowed });
      const result = await setRolePermissionAction(role, permission, allowed);
      setBusy(null);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(
          allowed
            ? `مُنحت صلاحية «${PERMISSION_LABELS[permission]}»`
            : `سُحبت صلاحية «${PERMISSION_LABELS[permission]}»`,
        );
      }
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {PERMISSION_GROUPS.map((group) => {
        const count = group.permissions.filter((p) => granted.has(p)).length;
        return (
          <Card key={group.key}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="text-muted-foreground size-4" strokeWidth={1.8} />
                  {group.title}
                </span>
                <Badge variant="outline" className="tabular-nums">
                  {count} / {group.permissions.length}
                </Badge>
              </CardTitle>
              <CardDescription>{group.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-0.5">
              {group.permissions.map((permission) => {
                const on = granted.has(permission);
                return (
                  <label
                    key={permission}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm transition-colors",
                      editable && "hover:bg-accent/50 cursor-pointer",
                    )}
                  >
                    <span className={cn("min-w-0", !on && "text-muted-foreground")}>
                      {PERMISSION_LABELS[permission] ?? permission}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {busy === permission && pending ? (
                        <LoaderCircle className="text-muted-foreground size-3.5 animate-spin" />
                      ) : null}
                      <Switch
                        checked={on}
                        disabled={!editable || pending}
                        onCheckedChange={(checked) => toggle(permission, checked)}
                        aria-label={PERMISSION_LABELS[permission] ?? permission}
                      />
                    </span>
                  </label>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
