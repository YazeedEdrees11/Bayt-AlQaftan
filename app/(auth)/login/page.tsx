import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { Logo } from "@/components/brand/logo";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { DEFAULT_ROUTE } from "@/lib/routes";
import {
  APP_NAME,
  LOGIN_DESCRIPTION,
  LOGIN_HEADING,
  LOGIN_SUBHEADING,
} from "@/lib/constants";

export const metadata: Metadata = {
  title: "تسجيل الدخول",
};

/** Reads the session cookie to bounce users who are already signed in. */
export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  inactive: "حسابك غير مفعل. يرجى التواصل مع مدير النظام.",
  session: "انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>;
}) {
  // The middleware already keeps signed-in users away from this page; this is
  // the second, server-side line of defence.
  const user = await getCurrentUser();
  if (user) redirect(DEFAULT_ROUTE);

  const params = await searchParams;
  const initialError = params.error ? ERROR_MESSAGES[params.error] : undefined;

  // Only accept in-app destinations, never an absolute URL from the query.
  const redirectTo =
    params.redirectTo && /^\/(?!\/)/.test(params.redirectTo)
      ? params.redirectTo
      : undefined;

  return (
    <main className="w-full max-w-md">
      <div className="mb-8 flex flex-col items-center gap-4 text-center">
        <Logo size="lg" showSubtitle />
        <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
          {LOGIN_DESCRIPTION}
        </p>
      </div>

      <Card className="surface border-border/70 shadow-[0_2px_4px_-2px_oklch(0_0_0/0.06),0_24px_48px_-24px_oklch(0_0_0/0.16)]">
        <CardContent className="p-7 sm:p-8">
          <div className="mb-6 space-y-1.5 text-center">
            <h1 className="text-xl font-semibold tracking-tight">
              {LOGIN_HEADING}
            </h1>
            <p className="text-muted-foreground text-sm">{LOGIN_SUBHEADING}</p>
          </div>

          <LoginForm redirectTo={redirectTo} initialError={initialError} />
        </CardContent>
      </Card>

      <p className="text-muted-foreground/80 mt-6 text-center text-xs leading-relaxed">
        نظام داخلي خاص بموظفي {APP_NAME}. الحسابات تُنشأ من قِبل مدير النظام
        فقط.
      </p>
    </main>
  );
}
