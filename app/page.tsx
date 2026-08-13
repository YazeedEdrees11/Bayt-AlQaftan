import { redirect } from "next/navigation";

import { DEFAULT_ROUTE } from "@/lib/routes";

/**
 * The application has no public landing page. Anonymous visitors are stopped
 * by the middleware and sent to /login; everyone else goes to the dashboard.
 */
export default function RootPage() {
  redirect(DEFAULT_ROUTE);
}
