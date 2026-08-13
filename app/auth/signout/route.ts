import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { logAction } from "@/lib/audit/log-action";
import { LOGIN_ROUTE } from "@/lib/routes";

/**
 * Server-side sign-out endpoint.
 *
 * Used when a guard has to end the session *before* redirecting — a
 * deactivated account, for instance. Doing it here (rather than redirecting
 * straight to /login) avoids bouncing off the middleware rule that keeps
 * signed-in users away from the login page.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const reason = request.nextUrl.searchParams.get("reason");
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (user) {
    await logAction({
      client: supabase,
      userId: user.id,
      action: "LOGOUT",
      entityType: "auth",
      entityId: user.id,
      metadata: reason ? { reason } : null,
    });
  }

  await supabase.auth.signOut();

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = LOGIN_ROUTE;
  redirectUrl.search = "";
  if (reason === "inactive") {
    redirectUrl.searchParams.set("error", "inactive");
  }

  return NextResponse.redirect(redirectUrl);
}
