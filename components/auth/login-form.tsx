"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LoaderCircle, Lock, Mail, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction } from "@/app/actions/auth";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { DEFAULT_ROUTE } from "@/lib/routes";
import { cn } from "@/lib/utils/cn";

/**
 * Where the remembered address is kept — the **email only**.
 * Never the password, and never a token: the application
 * stores no credential of any kind, which is the claim SECURITY.md makes and
 * this file has to keep true. The browser's own password manager covers the
 * other half — the fields carry `autocomplete="username"` and
 * `"current-password"` precisely so it can offer to save and fill them, which
 * is both safer than anything this code could do and already trusted by the
 * person using it.
 *
 * Worth knowing on a shared counter terminal: a remembered address tells the
 * next person who used the till last. That is why it is off unless asked for,
 * and why unticking it erases what was kept rather than merely stopping future
 * writes.
 */
const REMEMBERED_EMAIL_KEY = "bayt-al-qaftan:remembered-email";

/*
 * Read through `useSyncExternalStore` rather than in an effect.
 *
 * `localStorage` is a browser store that does not exist on the server, and this
 * is exactly the case that hook is for: the server snapshot is `null`, so the
 * markup React renders on both sides matches, and the real value arrives on
 * hydration without a second render pass that trips the
 * `react-hooks/set-state-in-effect` rule.
 *
 * The storage subscription also means a second tab signing in as someone else
 * is reflected here rather than leaving a stale address on screen.
 */
function subscribeToStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readRememberedEmail() {
  return window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
}

function noRememberedEmailOnServer() {
  return null;
}

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

  const storedEmail = useSyncExternalStore(
    subscribeToStorage,
    readRememberedEmail,
    noRememberedEmailOnServer,
  );

  /*
   * `null` means "the box reflects whether an address is stored"; once the
   * person touches it, their choice for this visit wins. Deriving it rather
   * than mirroring it into state keeps the two from disagreeing.
   */
  const [choice, setChoice] = useState<boolean | null>(null);
  const remember = choice ?? storedEmail !== null;

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    setFocus,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  /*
   * Read after mount, not during render. `localStorage` does not exist on the
   * server, so seeding `defaultValues` from it would render one thing on the
   * server and another in the browser — a hydration mismatch, which is the same
   * class of bug that the date formatting hit in an earlier phase.
   */
  useEffect(() => {
    if (!storedEmail) return;
    setValue("email", storedEmail);
    // The address is filled, so the cursor belongs in the field that is not.
    setFocus("password");
  }, [storedEmail, setValue, setFocus]);

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

      // Only once the credentials are known good — remembering an address that
      // was mistyped would hand the same mistake back tomorrow.
      if (remember) {
        window.localStorage.setItem(REMEMBERED_EMAIL_KEY, values.email.trim());
      } else {
        window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
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

      <div className="flex items-center gap-2.5">
        <Checkbox
          id="remember"
          checked={remember}
          onCheckedChange={(value) => {
            const next = value === true;
            setChoice(next);
            // Untick and it is gone now, not at the next successful sign-in.
            if (!next) window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
          }}
          disabled={isPending}
        />
        <Label htmlFor="remember" className="cursor-pointer text-sm font-normal">
          تذكّر بريدي على هذا الجهاز
        </Label>
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
