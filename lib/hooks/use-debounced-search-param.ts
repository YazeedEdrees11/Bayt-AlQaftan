"use client";

import { useEffect, useRef } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";

/**
 * Pushes a search box into the URL, debounced, and only when it has actually
 * changed.
 *
 * The "only when it has changed" is not an optimisation. Every list screen used
 * to run this effect inline, and every one of them looped forever:
 *
 *   setParams closes over searchParams
 *     → calling it replaces the URL
 *     → the router hands back a new ReadonlyURLSearchParams object
 *     → useCallback rebuilds setParams because its identity changed
 *     → the effect re-runs because setParams is in its dependencies
 *     → another replace is scheduled 350ms later
 *     → and around again, for as long as the tab is open.
 *
 * Measured on an idle /products with nobody touching anything: nine requests in
 * six seconds, each one re-running the page's server component and its
 * database queries. Five screens did it; the shop would have been issuing
 * roughly one query a second per open tab, forever, having asked for nothing.
 *
 * What made it visible was the least of it — the list dimming to `opacity-60`
 * and back about three times a second, which is what "blink or pulse" was.
 *
 * Comparing against the URL before writing to it breaks the cycle at the only
 * point where it can be broken: after the replace lands the values match, so
 * the next pass does nothing. The effect still re-runs on every identity
 * change; it just no longer causes one.
 *
 * `setParams` is taken as-is and listed as a dependency rather than stashed in
 * a ref. It changes identity whenever the URL does, so the effect re-runs — but
 * re-running is free once the comparison is there, and a ref written during
 * render is not allowed in React 19.
 */
export function useDebouncedSearchParam({
  value,
  searchParams,
  setParams,
  key = "q",
  delay = 350,
}: {
  /** The live input value. */
  value: string;
  /** From `useSearchParams()` — the URL as it currently stands. */
  searchParams: ReadonlyURLSearchParams;
  /** The screen's own URL writer. Receives null when the box is cleared. */
  setParams: (updates: Record<string, string | number | null>) => void;
  /** Query-string key to compare against and write. */
  key?: string;
  delay?: number;
}) {
  // Skips the write on mount: the box is seeded from the URL, so the first
  // render always agrees with it and there is nothing to push.
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }

    const next = value.trim();
    if (next === (searchParams.get(key) ?? "")) return;

    const timer = setTimeout(() => setParams({ [key]: next || null }), delay);
    return () => clearTimeout(timer);
  }, [value, searchParams, setParams, key, delay]);
}
