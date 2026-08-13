import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth/require-auth";

/**
 * "Profit by product" is the product report ordered by profit, not a second
 * report over the same rows. Redirecting rather than duplicating the screen is
 * what keeps the two from ever disagreeing about a number (§75) — and it keeps
 * the sort in the URL, so the page is still shareable.
 *
 * It guards itself rather than leaning on the page it redirects to. The target
 * does check, and a salesperson reaching here is correctly turned away — but a
 * route whose only protection is where it happens to point is one query-string
 * change away from being an open door.
 */
export default async function ProductProfitPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("VIEW_PROFIT_REPORT");
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && key !== "sort") query.set(key, value);
  }
  query.set("sort", "profit");
  redirect(`/reports/products/top?${query.toString()}`);
}
