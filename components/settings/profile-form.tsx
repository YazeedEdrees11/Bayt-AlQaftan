"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { UserAvatar } from "@/components/shared/user-avatar";
import { updateProfileAction } from "@/app/actions/profile";
import {
  updateProfileSchema,
  type UpdateProfileInput,
} from "@/lib/validation/auth";
import type { UserProfile } from "@/types/auth";

export function ProfileForm({ profile }: { profile: UserProfile }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      full_name: profile.full_name,
      avatar_url: profile.avatar_url ?? "",
    },
  });

  // `useWatch` (rather than `watch`) keeps the live avatar preview reactive
  // without opting the component out of memoization.
  const watchedName = useWatch({ control, name: "full_name" });
  const watchedAvatar = useWatch({ control, name: "avatar_url" });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);

    startTransition(async () => {
      const result = await updateProfileAction(values);

      if (!result.ok) {
        setFormError(result.error);
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            setError(field as keyof UpdateProfileInput, { message });
          }
        }
        return;
      }

      toast.success("تم تحديث الملف الشخصي");
      reset(values);
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {formError ? (
        <div
          role="alert"
          className="border-destructive/25 bg-destructive/8 text-destructive flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span className="leading-relaxed">{formError}</span>
        </div>
      ) : null}

      <div className="flex items-center gap-4">
        <UserAvatar
          fullName={watchedName || profile.full_name}
          avatarUrl={watchedAvatar || null}
          className="size-16"
        />
        <div className="space-y-1">
          <p className="font-medium">الصورة الشخصية</p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            أضف رابط صورة، أو اتركه فارغاً لعرض الأحرف الأولى من اسمك.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="avatar_url">رابط الصورة الشخصية</Label>
        <Input
          id="avatar_url"
          dir="ltr"
          className="h-11 text-start"
          placeholder="https://..."
          aria-invalid={!!errors.avatar_url}
          disabled={isPending}
          {...register("avatar_url")}
        />
        {errors.avatar_url ? (
          <p className="text-destructive text-xs">
            {errors.avatar_url.message}
          </p>
        ) : null}
      </div>

      <Separator />

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="profile_full_name">الاسم الكامل</Label>
          <Input
            id="profile_full_name"
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
      </div>

      <div className="flex justify-start">
        <Button type="submit" disabled={isPending || !isDirty}>
          {isPending ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              جاري الحفظ...
            </>
          ) : (
            "حفظ التغييرات"
          )}
        </Button>
      </div>
    </form>
  );
}
