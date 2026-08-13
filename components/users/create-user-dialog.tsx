"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LoaderCircle, Plus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RoleSelectField } from "./user-form-fields";
import { createUserAction } from "@/app/actions/users";
import { createUserSchema, type CreateUserInput } from "@/lib/validation/auth";
import { cn } from "@/lib/utils/cn";

export function CreateUserDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { full_name: "", email: "", password: "", role: "STAFF" },
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      reset();
      setFormError(null);
      setShowPassword(false);
    }
  }

  const onSubmit = handleSubmit((values) => {
    setFormError(null);

    startTransition(async () => {
      const result = await createUserAction(values);

      if (!result.ok) {
        setFormError(result.error);
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            setError(field as keyof CreateUserInput, { message });
          }
        }
        return;
      }

      toast.success("تم إنشاء المستخدم بنجاح");
      handleOpenChange(false);
      router.refresh();
    });
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          إضافة مستخدم
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>إضافة مستخدم جديد</DialogTitle>
          <DialogDescription>
            سيتم إنشاء الحساب مباشرة، ويمكن للموظف تسجيل الدخول بكلمة المرور
            المؤقتة.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
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
            <Label htmlFor="full_name">الاسم الكامل</Label>
            <Input
              id="full_name"
              className="h-11"
              autoComplete="off"
              placeholder="مثال: محمد العتيبي"
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
            <Label htmlFor="new-email">البريد الإلكتروني</Label>
            <Input
              id="new-email"
              type="email"
              dir="ltr"
              className="h-11 text-start"
              autoComplete="off"
              placeholder="name@example.com"
              aria-invalid={!!errors.email}
              disabled={isPending}
              {...register("email")}
            />
            {errors.email ? (
              <p className="text-destructive text-xs">{errors.email.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">كلمة المرور المؤقتة</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showPassword ? "text" : "password"}
                dir="ltr"
                className={cn("h-11 pr-10 text-left")}
                autoComplete="new-password"
                placeholder="8 أحرف على الأقل"
                aria-invalid={!!errors.password}
                disabled={isPending}
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                disabled={isPending}
                aria-label={
                  showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"
                }
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
            {errors.password ? (
              <p className="text-destructive text-xs">
                {errors.password.message}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                يُنصح بتغييرها بعد أول تسجيل دخول.
              </p>
            )}
          </div>

          <Controller
            control={control}
            name="role"
            render={({ field }) => (
              <RoleSelectField
                value={field.value}
                onChange={field.onChange}
                disabled={isPending}
                error={errors.role?.message}
              />
            )}
          />

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
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
                "إنشاء المستخدم"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
