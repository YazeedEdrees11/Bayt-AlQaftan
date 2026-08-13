import "server-only";

import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { getSettingBool } from "./queries";

export const MAINTENANCE_ROUTE = "/maintenance";

/**
 * Maintenance mode (§69).
 *
 * Checked in the dashboard layout rather than in middleware, deliberately:
 * middleware runs on every request including static assets, and answering it
 * would mean a database read on each one. The layout is the first thing every
 * protected page renders, which is early enough to keep anyone out and cheap
 * enough to do properly.
 *
 * Administrators pass through — someone has to be able to turn it back off.
 */
export async function enforceMaintenanceMode(): Promise<void> {
  const enabled = await getSettingBool("maintenance_mode", false);
  if (!enabled) return;

  const profile = await getCurrentProfile();
  if (profile?.role === "ADMIN") return;

  redirect(MAINTENANCE_ROUTE);
}
