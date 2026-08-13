"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LoaderCircle, Lock, Mail, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction } from "@/app/actions/auth";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { DEFAULT_ROUTE } from "@/lib/routes";
import { cn } from "@/lib/utils/cn";

export function LoginForm({
  redirectTo,
  initialError,
}: {
  redirectTo?: string;
  initialError?: string;
}) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(
    initialError ?? null,
  );
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);

    startTransition(async () => {
      const result = await signInAction(values);

      if (!result.ok) {
        setFormError(result.error);
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            setError(field as keyof LoginInput, { message });
          }
        }
        return;
      }

      toast.success("تم تسجيل الدخول بنجاح");
      router.replace(redirectTo || DEFAULT_ROUTE);
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
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
        <Label htmlFor="email">البريد الإلكتروني</Label>
        <div className="relative">
          {/* Physical positions on purpose: the field itself is LTR while the
              page is RTL, so logical `start`/`end` would point opposite ways. */}
          <Mail
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2"
          />
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            dir="ltr"
            placeholder="name@example.com"
            className={cn(
              "h-11 pl-10 text-left",
              errors.email && "border-destructive focus-visible:ring-destructive/30",
            )}
            aria-invalid={!!errors.email}
            disabled={isPending}
            {...register("email")}
          />
        </div>
        {errors.email ? (
          <p className="text-destructive text-xs">{errors.email.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">كلمة المرور</Label>
        <div className="relative">
          <Lock
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2"
          />
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            dir="ltr"
            placeholder="••••••••"
            className={cn(
              "h-11 pr-10 pl-10 text-left",
              errors.password &&
                "border-destructive focus-visible:ring-destructive/30",
            )}
            aria-invalid={!!errors.password}
            disabled={isPending}
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            disabled={isPending}
            aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
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
          <p className="text-destructive text-xs">{errors.password.message}</p>
        ) : null}
      </div>

      <Button type="submit" size="lg" className="h-11 w-full" disabled={isPending}>
        {isPending ? (
          <>
            <LoaderCircle className="size-4 animate-spin" />
            جاري تسجيل الدخول...
          </>
        ) : (
          "تسجيل الدخول"
        )}
      </Button>
    </form>
  );
}
