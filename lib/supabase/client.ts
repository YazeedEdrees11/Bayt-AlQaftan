import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

/**
 * Browser-side Supabase client.
 *
 * Authentication itself runs through Server Actions, so nothing in the current
 * phase needs this. It is the entry point for the client-side work the later
 * modules will do — product-image uploads to Storage, realtime stock updates —
 * and it keeps that access under the anon key plus RLS.
 *
 * Created lazily so importing the module never touches environment variables at
 * build time. Only the public URL and anon key are read here; the service-role
 * key must never reach the browser.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
    );
  }

  return createBrowserClient<Database>(url, anonKey);
}
