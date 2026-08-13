"use client";

import { useCallback, useRef } from "react";

/**
 * A key identifying one attempt at one operation (§36).
 *
 * The key must survive a retry and must not survive a success. That is the
 * whole contract, and both halves matter:
 *
 *   * stable across retries, so a double-click, a dropped connection or a
 *     browser resubmit is recognised as the same submission and answered from
 *     the first result rather than performed again;
 *   * fresh after a success, so the next sale is a new sale. Two customers
 *     buying the same thing minutes apart is an ordinary afternoon, and the
 *     server cannot tell that from a duplicate on its own.
 *
 * Generated in the browser rather than on the server, because the server sees
 * a retry as a new request and would mint a new key for it — which is exactly
 * the case this exists to catch.
 */
export function useIdempotencyKey() {
  const keyRef = useRef<string | null>(null);

  const current = useCallback(() => {
    if (keyRef.current === null) keyRef.current = newKey();
    return keyRef.current;
  }, []);

  /** Call after a submission succeeds, so the next one is a new operation. */
  const reset = useCallback(() => {
    keyRef.current = null;
  }, []);

  return { key: current, reset };
}

function newKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Older browsers: still unique enough for a key that lives for one form.
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
