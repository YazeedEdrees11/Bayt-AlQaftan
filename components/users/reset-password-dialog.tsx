"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LoaderCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetUserPasswordAction } from "@/app/actions/users";
import {
  resetUserPasswordSchema,
  type ResetUserPasswordInput,
} from "@/lib/validation/auth";
import type { UserProfile } from "@/types/auth";

/**
 * Sets a new password for another user.
 *
 * The administrator types the password and reads it out to the person; there is
 * no email round trip, because a shop assistant standing at the counter has no
 * work inbox to check. The password is sent once and never shown again — the
 * dialog holds it only while it is open.
 */
export function ResetPasswordDialog({
  user,
  open,
  onOpenChange,
}: {
  user: UserProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ResetUserPasswordInput>({
    resolver: zodResolver(resetUserPasswordSchema),
    defaultValues: { id: user.id, password: "" },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);

    startTransition(async () => {
      const result = await resetUserPasswordAction(values);

      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            setError(field as keyof ResetUserPasswordInput, { message });
          }
        }
        setFormError(result.fieldErrors ? null : result.error);
        return;
      }

      toast.success("تم تعيين كلمة مرور جديدة");
      onOpenChange(false);
      router.refresh();
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>تعيين كلمة مرور جديدة</DialogTitle>
          <DialogDescription>
            لحساب {user.full_name} ({user.email}). سلّم كلمة المرور للموظف
            مباشرة — لن تظهر مرة أخرى بعد الحفظ.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <input type="hidden" {...register("id")} />

          <div className="space-y-2">
            <Label htmlFor="new_password">كلمة المرور الجديدة</Label>
            <div className="relative">
              {/* The field is dir="ltr" because a password is typed in Latin
                  characters, which makes physical right/left correct inside it
                  and logical start/end wrong — the same reasoning, and the same
                  markup, as the login and create-user password fields. */}
              <Input
                id="new_password"
                type={visible ? "text" : "password"}
                dir="ltr"
                className="h-11 pr-10 text-left"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.password)}
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setVisible((shown) => !shown)}
                disabled={isPending}
                aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
              >
                {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {errors.password ? (
              <p className="text-destructive text-sm">{errors.password.message}</p>
            ) : (
              <p className="text-muted-foreground text-xs">
                ٨ أحرف على الأقل.
              </p>
            )}
          </div>

          {formError ? (
            <p className="text-destructive flex items-center gap-2 text-sm">
              <TriangleAlert className="size-4 shrink-0" />
              {formError}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              إلغاء
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <LoaderCircle className="size-4 animate-spin" /> : null}
              حفظ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
