/**
 * Formatting helpers.
 *
 * Dates use the Gregorian calendar with Latin digits: the store's paperwork,
 * invoices and bank statements all use them, so the dashboard matches.
 */

/**
 * The zone every timestamp is rendered in.
 *
 * Pinned rather than left to the runtime, and that matters more than it looks:
 * `Intl.DateTimeFormat` with no `timeZone` uses whatever zone the process is in
 * — the server's during SSR, the browser's on hydration. When those differ,
 * React finds different text on the two passes and throws the tree away.
 *
 * It comes from `NEXT_PUBLIC_STORE_TIMEZONE`, which is inlined at build time
 * and is therefore *identical* on the server and in the browser. That is the
 * property that matters: a value read per-request on the server and per-user in
 * the browser would reintroduce the mismatch this constant exists to prevent.
 *
 * The store's own `timezone` setting remains the record of where the shop is,
 * and the system screen reports it when the two disagree — changing it takes a
 * redeploy rather than a save, and saying so is better than a field that
 * appears to work and does not.
 */
export const DISPLAY_TIMEZONE =
  process.env.NEXT_PUBLIC_STORE_TIMEZONE?.trim() || "Asia/Amman";

const dateFormatter = new Intl.DateTimeFormat("ar", {
  dateStyle: "medium",
  calendar: "gregory",
  numberingSystem: "latn",
  timeZone: DISPLAY_TIMEZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat("ar", {
  dateStyle: "medium",
  timeStyle: "short",
  calendar: "gregory",
  numberingSystem: "latn",
  timeZone: DISPLAY_TIMEZONE,
});

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return dateFormatter.format(date);
}

export function formatDateTime(
  value: string | Date | null | undefined,
): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormatter.format(date);
}

const numberFormatter = new Intl.NumberFormat("ar", {
  numberingSystem: "latn",
  maximumFractionDigits: 0,
});

const moneyFormatter = new Intl.NumberFormat("ar", {
  numberingSystem: "latn",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Whole numbers with Latin digits and thousands separators. */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return numberFormatter.format(value);
}

/**
 * Money, always two decimals, with the Jordanian dinar symbol trailing.
 * PostgREST returns `numeric` columns as JS numbers, but strings are accepted
 * defensively because a future driver change could alter that.
 */
export function formatMoney(
  value: number | string | null | undefined,
  { withSymbol = true }: { withSymbol?: boolean } = {},
): string {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(numeric)) return "—";
  const formatted = moneyFormatter.format(numeric);
  return withSymbol ? `${formatted} د.أ` : formatted;
}

/** Percentage with a single decimal, e.g. `50.0%`. */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
}

/**
 * Gross profit and margin for a variant.
 * Margin is expressed against the selling price, which is how retail quotes it.
 */
export function calculateProfit(purchasePrice: number, sellingPrice: number) {
  const profit = sellingPrice - purchasePrice;
  const margin = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0;
  return { profit, margin };
}
