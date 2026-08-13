import "server-only";

import { cache } from "react";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * The authenticated Supabase user for the current request, or `null`.
 *
 * Always uses `getUser()` (which validates the JWT against Supabase Auth)
 * rather than `getSession()`, whose cookie payload is not trustworthy on the
 * server. Memoized per request via `React.cache`.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
});
