"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  LoaderCircle,
  MoreHorizontal,
  KeyRound,
  Pencil,
  Search,
  ShieldCheck,
  ShieldOff,
  Users as UsersIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { RoleBadge, StatusBadge } from "@/components/shared/role-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { EditUserDialog } from "./edit-user-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { setUserActiveAction } from "@/app/actions/users";
import type { UserProfile } from "@/types/auth";

export interface UserRow extends UserProfile {
  /** Pre-formatted on the server so SSR and hydration always agree. */
  createdAtLabel: string;
  /**
   * When the user last did something the audit trail recorded (§11). Optional
   * because it costs a second query and only the settings screen shows it.
   */
  lastActivityLabel?: string | null;
}

export function UsersTable({
  users,
  currentUserId,
  showActivity = false,
}: {
  users: UserRow[];
  currentUserId: string;
  /** Shows the "last activity" column, read from the audit trail (§11). */
  showActivity?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [resetting, setResetting] = useState<UserProfile | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [toggling, setToggling] = useState<UserRow | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter(
      (user) =>
        user.full_name.toLowerCase().includes(needle) ||
        user.email.toLowerCase().includes(needle),
    );
  }, [users, query]);

  async function handleToggleActive(user: UserRow) {
    setPendingId(user.id);

    startTransition(async () => {
      const result = await setUserActiveAction({
        id: user.id,
        is_active: !user.is_active,
      });

      setPendingId(null);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(user.is_active ? "تم تعطيل المستخدم" : "تم تفعيل المستخدم");
      router.refresh();
    });
  }

  function handleEdit(user: UserRow) {
    setEditing(user);
    setEditOpen(true);
  }

  function handleResetPassword(user: UserRow) {
    setResetting(user);
    setResetOpen(true);
  }

  return (
    <>
      <Card>
        <CardContent className="space-y-4 p-0 sm:p-0">
          <div className="border-border/70 flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search
                aria-hidden
                className="text-muted-foreground pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="بحث بالاسم أو البريد الإلكتروني"
                className="h-10 pe-9"
                aria-label="بحث في المستخدمين"
              />
            </div>
            <p className="text-muted-foreground text-sm">
              {filtered.length} من {users.length} مستخدم
            </p>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={UsersIcon}
              title={query ? "لا توجد نتائج" : "لا توجد بيانات"}
              description={
                query
                  ? "جرّب البحث باسم أو بريد إلكتروني آخر."
                  : "لم تتم إضافة أي مستخدمين حتى الآن."
              }
            />
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-start">الاسم</TableHead>
                    <TableHead className="text-start">
                      البريد الإلكتروني
                    </TableHead>
                    <TableHead className="text-start">الدور</TableHead>
                    <TableHead className="text-start">الحالة</TableHead>
                    {showActivity ? (
                      <TableHead className="text-start">آخر نشاط</TableHead>
                    ) : null}
                    <TableHead className="text-start">تاريخ الإنشاء</TableHead>
                    <TableHead className="w-16 text-start">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filtered.map((user) => {
                    const isSelf = user.id === currentUserId;
                    const isRowPending = isPending && pendingId === user.id;

                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <UserAvatar
                              fullName={user.full_name}
                              avatarUrl={user.avatar_url}
                              className="size-9"
                            />
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {user.full_name}
                              </p>
                              {isSelf ? (
                                <p className="text-muted-foreground text-xs">
                                  حسابك
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          {/* <bdi> isolates the address so it always reads
                              left-to-right. Its implicit dir="auto" resolves to
                              LTR, which would turn `text-align: start` into
                              *left*, so the RTL column alignment is set
                              explicitly. */}
                          <bdi className="text-muted-foreground block text-right text-sm">
                            {user.email}
                          </bdi>
                        </TableCell>

                        <TableCell>
                          <RoleBadge role={user.role} />
                        </TableCell>

                        <TableCell>
                          <StatusBadge isActive={user.is_active} />
                        </TableCell>

                        {showActivity ? (
                          <TableCell className="text-muted-foreground text-sm">
                            {user.lastActivityLabel ?? "لا نشاط مسجّل"}
                          </TableCell>
                        ) : null}

                        <TableCell className="text-muted-foreground text-sm">
                          {user.createdAtLabel}
                        </TableCell>

                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`إجراءات ${user.full_name}`}
                                disabled={isRowPending}
                              >
                                {isRowPending ? (
                                  <LoaderCircle className="size-4 animate-spin" />
                                ) : (
                                  <MoreHorizontal className="size-4" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent align="start" className="w-44">
                              <DropdownMenuItem
                                onSelect={() => handleEdit(user)}
                                className="cursor-pointer"
                              >
                                <Pencil className="size-4" />
                                تعديل
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                onSelect={() => handleResetPassword(user)}
                                className="cursor-pointer"
                              >
                                <KeyRound className="size-4" />
                                كلمة مرور جديدة
                              </DropdownMenuItem>

                              <DropdownMenuSeparator />

                              <DropdownMenuItem
                                disabled={isSelf}
                                variant={user.is_active ? "destructive" : "default"}
                                onSelect={() => {
                                  // Deactivating is the one action here that
                                  // fired straight from the menu. A misread row
                                  // used to lock a colleague out mid-shift with
                                  // no way to notice before it happened.
                                  if (user.is_active) setToggling(user);
                                  else void handleToggleActive(user);
                                }}
                                className="cursor-pointer"
                              >
                                {user.is_active ? (
                                  <>
                                    <ShieldOff className="size-4" />
                                    تعطيل
                                  </>
                                ) : (
                                  <>
                                    <ShieldCheck className="size-4" />
                                    تفعيل
                                  </>
                                )}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {editing ? (
        <EditUserDialog
          key={editing.id}
          user={editing}
          currentUserId={currentUserId}
          open={editOpen}
          onOpenChange={(next) => {
            setEditOpen(next);
            if (!next) setEditing(null);
          }}
        />
      ) : null}

      {toggling ? (
        <ConfirmDialog
          open={Boolean(toggling)}
          onOpenChange={(next) => {
            if (!next) setToggling(null);
          }}
          title="تعطيل المستخدم"
          description={`سيفقد ${toggling.full_name} إمكانية الدخول فوراً. تبقى كل عملياته السابقة كما هي، ويمكن تفعيل الحساب لاحقاً.`}
          confirmLabel="تعطيل"
          destructive
          onConfirm={async () => {
            const user = toggling;
            setToggling(null);
            await handleToggleActive(user);
          }}
        />
      ) : null}

      {resetting ? (
        <ResetPasswordDialog
          key={resetting.id}
          user={resetting}
          open={resetOpen}
          onOpenChange={(next) => {
            setResetOpen(next);
            if (!next) setResetting(null);
          }}
        />
      ) : null}
    </>
  );
}
