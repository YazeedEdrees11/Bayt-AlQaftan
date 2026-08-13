/**
 * Route constants shared by the middleware, the guards and the navigation.
 * Keeping them in one module avoids drift between "what is protected" and
 * "what is linked".
 */

export const LOGIN_ROUTE = "/login";
export const DEFAULT_ROUTE = "/dashboard";
export const PROFILE_ROUTE = "/settings/profile";

/** Routes reachable without a session. Everything else requires auth. */
/** Where the maintenance page lives, outside the dashboard layout. */
export const MAINTENANCE_ROUTE = "/maintenance";

/** Liveness and readiness, for external monitoring (§99). */
export const HEALTH_ROUTE = "/api/health";

/**
 * Routes reachable without a session.
 *
 * `/api/health` is here deliberately: a monitor carries no cookies, and a
 * liveness check that redirects to the login page reports the login page as
 * healthy while the database is on fire. It was doing exactly that until this
 * was measured — the endpoint answered `307 → /login`.
 *
 * It is safe to expose because of what it does not say: a version, a status per
 * dependency, and a timestamp. No hostnames, no connection details, no error
 * text from the database.
 */
export const PUBLIC_ROUTES: readonly string[] = [
  LOGIN_ROUTE,
  MAINTENANCE_ROUTE,
  HEALTH_ROUTE,
];
