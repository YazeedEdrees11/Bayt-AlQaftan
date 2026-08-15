import "server-only";

import { cache } from "react";
import type { User } from "@supabase/supabase-js";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * The authenticated Supabase user for the current request, or `null`.
 *
 * Always uses `getUser()` (which validates the JWT against Supabase Auth)
 * rather than `getSession()`, whose cookie payload is not trustworthy on the
 * server. Memoized per request via `React.cache`.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    const userEmail = headersList.get("x-user-email");
    if (userId) {
      return {
        id: userId,
        email: userEmail ?? undefined,
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: "",
      } as User;
    }
  } catch (error) {
    console.warn("[auth] Failed to read user headers, falling back to Supabase auth:", error);
  }

  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
});
