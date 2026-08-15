import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/types/database";
import { LOGIN_ROUTE, PUBLIC_ROUTES, DEFAULT_ROUTE } from "@/lib/routes";

/**
 * Refreshes the Supabase session on every request and enforces the coarse
 * authentication boundary (signed-in vs. signed-out).
 *
 * Fine-grained authorization — roles, permissions, `is_active` — is handled by
 * the route guards in `lib/auth/require-auth.ts` and by RLS, because the
 * middleware deliberately avoids extra database round-trips.
 */
export async function updateSession(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-user-id");
  requestHeaders.delete("x-user-email");

  let supabaseResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without configuration there is nothing to protect yet; let the app render
  // its own "missing environment variables" error instead of looping.
  if (!url || !anonKey) return supabaseResponse;

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // IMPORTANT: `getUser()` must be called right after creating the client and
  // nothing may run between it and returning `supabaseResponse`, otherwise the
  // refreshed auth cookies are lost.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    requestHeaders.set("x-user-id", user.id);
    requestHeaders.set("x-user-email", user.email || "");
    
    // Propagate mutated requestHeaders to the response so Server Components see them
    const cookiesToPreserve = supabaseResponse.cookies.getAll();
    supabaseResponse = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    for (const cookie of cookiesToPreserve) {
      supabaseResponse.cookies.set(cookie.name, cookie.value, cookie);
    }
  }

  const pathname = request.nextUrl.pathname;
  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (!user && !isPublicRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = LOGIN_ROUTE;
    redirectUrl.search = "";
    if (pathname !== "/" && pathname !== LOGIN_ROUTE) {
      redirectUrl.searchParams.set("redirectTo", pathname);
    }
    return NextResponse.redirect(redirectUrl);
  }

  if (user && pathname === LOGIN_ROUTE) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = DEFAULT_ROUTE;
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
