"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, TriangleAlert } from "lucide-react";
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
import { RoleSelectField } from "./user-form-fields";
import { updateUserAction } from "@/app/actions/users";
import { updateUserSchema, type UpdateUserInput } from "@/lib/validation/auth";
import type { UserProfile } from "@/types/auth";

/**
 * Edit dialog for a single user.
 *
 * The parent mounts it with `key={user.id}`, so the form state is rebuilt from
 * `defaultValues` whenever a different user is opened — no reset effect and no
 * stale values between rows.
 */
export function EditUserDialog({
  user,
  currentUserId,
  open,
  onOpenChange,
}: {
  user: UserProfile;
  currentUserId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<UpdateUserInput>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      id: user.id,
      full_name: user.full_name,
      role: user.role,
    },
  });

  const isSelf = user.id === currentUserId;

  const onSubmit = handleSubmit((values) => {
    setFormError(null);

    startTransition(async () => {
      const result = await updateUserAction(values);

      if (!result.ok) {
        setFormError(result.error);
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            setError(field as keyof UpdateUserInput, { message });
          }
        }
        return;
      }

      toast.success("تم تحديث بيانات المستخدم");
      onOpenChange(false);
      router.refresh();
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>تعديل المستخدم</DialogTitle>
          <DialogDescription>
            يمكن تعديل الاسم والدور. البريد الإلكتروني ثابت ولا يمكن تغييره من
            هنا.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <input type="hidden" {...register("id")} />

          {formError ? (
            <div
              role="alert"
              className="border-destructive/25 bg-destructive/8 text-destructive flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span className="leading-relaxed">{formError}</span>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="edit_full_name">الاسم الكامل</Label>
            <Input
              id="edit_full_name"
              className="h-11"
              aria-invalid={!!errors.full_name}
              disabled={isPending}
              {...register("full_name")}
            />
            {errors.full_name ? (
              <p className="text-destructive text-xs">
                {errors.full_name.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit_email">البريد الإلكتروني</Label>
            <Input
              id="edit_email"
              dir="ltr"
              className="bg-muted h-11 text-start"
              value={user.email}
              readOnly
              disabled
            />
          </div>

          <Controller
            control={control}
            name="role"
            render={({ field }) => (
              <RoleSelectField
                value={field.value}
                onChange={field.onChange}
                disabled={isPending || isSelf}
                error={errors.role?.message}
              />
            )}
          />

          {isSelf ? (
            <p className="text-muted-foreground text-xs leading-relaxed">
              لا يمكنك تغيير دورك الخاص. يجب أن يقوم بذلك مدير نظام آخر.
            </p>
          ) : null}

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              إلغاء
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                "حفظ التعديلات"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
