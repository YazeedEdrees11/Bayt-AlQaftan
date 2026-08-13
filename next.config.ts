import type { NextConfig } from "next";

/**
 * Security headers (§83).
 *
 * Chosen to be strict where it costs nothing and honest where it would cost
 * something. Two notes worth leaving for whoever changes them next:
 *
 * `script-src` includes 'unsafe-inline' because Next.js inlines its bootstrap
 * and hydration payload. Removing it needs per-request nonces threaded through
 * the framework, which is a real change rather than a config tweak — writing a
 * policy that the application then has to violate would be worse than saying
 * so here.
 *
 * `connect-src` and `img-src` name the Supabase project explicitly, taken from
 * the public URL that is already in the bundle. That keeps a compromised script
 * from posting the shop's data to somewhere else.
 *
 * `'unsafe-eval'` is added in development and only there. React's development
 * build calls `eval()` to rebuild callstacks across the server/client boundary,
 * and without it the console fills with CSP violations that hide real errors.
 * React never calls it in a production build, so production keeps the strict
 * policy — which is the half that matters, since it is the only one an attacker
 * ever sees. The check below is deliberately `=== "production"` rather than
 * `!== "development"`: an unset NODE_ENV should fail closed to the strict
 * policy, not open to the loose one.
 */
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

const isProduction = process.env.NODE_ENV === "production";

const scriptSrc = isProduction
  ? "script-src 'self' 'unsafe-inline'"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace("https://", "wss://")}${
    isProduction ? "" : " ws: http://localhost:*"
  }`.trim(),
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    // The shop needs none of these. Denying them is free.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  {
    // Two years, subdomains included. Only meaningful over HTTPS, which §84
    // requires in production anyway.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // A monitor should never be handed a cached answer about liveness.
        source: "/api/health",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
