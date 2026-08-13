import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { assertEnv } from "@/lib/env";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/** The typed client shape used throughout the server code. */
export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Server-side Supabase client bound to the request cookies.
 *
 * Use this in Server Components, Route Handlers and Server Actions. It runs
 * under the signed-in user, so every query is still subject to RLS.
 */
export async function createClient() {
  // §4: fail with the variable's name, not with «Invalid API key».
  assertEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // `setAll` was called from a Server Component. The session is
          // refreshed by the middleware, so this can be safely ignored.
        }
      },
    },
  });
}

/**
 * Privileged Supabase client backed by the service-role key.
 *
 * SERVER ONLY. It bypasses Row Level Security entirely, so it must never be
 * imported from a Client Component and every caller has to perform its own
 * authorization check first.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase admin environment variables. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
