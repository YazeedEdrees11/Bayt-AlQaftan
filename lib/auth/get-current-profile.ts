import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./get-current-user";
import { getMyPermissions } from "@/lib/permissions/role-permissions";
import type { AuthUser, UserProfile } from "@/types/auth";

/**
 * The `profiles` row of the signed-in user, or `null` when there is no
 * session (or the profile row is missing). Memoized per request.
 *
 * The permissions the role currently holds are resolved here and travel with
 * the profile, so every `hasPermission(profile, …)` call site — there are
 * dozens, across seven phases — reads the configured matrix without changing.
 */
export const getCurrentProfile = cache(async (): Promise<UserProfile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) return null;

  const profile = data as UserProfile;
  return { ...profile, permissions: await getMyPermissions(profile.role) };
});

/** The Supabase user and its profile together, or `null`. */
export const getCurrentAuthUser = cache(async (): Promise<AuthUser | null> => {
  const [user, profile] = await Promise.all([
    getCurrentUser(),
    getCurrentProfile(),
  ]);

  if (!user || !profile) return null;

  return {
    id: user.id,
    email: user.email ?? profile.email,
    profile,
  };
});
