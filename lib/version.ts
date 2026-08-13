/**
 * The application version, and the one place it is written.
 *
 * Read from package.json at build time rather than kept as a second copy that
 * can disagree with it. `app_config.app_version` in the database is the
 * deployment's own record and is updated by the deploy, not by the UI (§68).
 */
import pkg from "../package.json";

export const APP_VERSION: string = pkg.version ?? "0.0.0";
