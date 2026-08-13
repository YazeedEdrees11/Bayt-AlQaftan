import "server-only";

/**
 * Environment validation (§3, §4).
 *
 * Checked once, on the server, when the first request touches it. A missing
 * variable becomes a clear server-side error at the boundary instead of an
 * undefined threaded three layers down and surfacing as "Invalid API key" from
 * Supabase — a message that sends whoever is on call looking in the wrong place.
 *
 * The value is never named in what is thrown or logged. Only the variable's
 * name, and whether it was present.
 */

type EnvSpec = {
  name: string;
  /** True for variables that are inlined into the browser bundle. */
  public: boolean;
  describe: string;
};

const REQUIRED: EnvSpec[] = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    public: true,
    describe: "عنوان مشروع Supabase",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    public: true,
    describe: "مفتاح anon — محمي بسياسات RLS",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    public: false,
    describe: "مفتاح service role — للخادم فقط",
  },
];

const OPTIONAL: EnvSpec[] = [
  {
    name: "NEXT_PUBLIC_STORE_TIMEZONE",
    public: true,
    describe: "المنطقة الزمنية للعرض (الافتراضي Asia/Amman)",
  },
];

export type EnvReport = {
  ok: boolean;
  missing: string[];
  present: string[];
  warnings: string[];
};

/**
 * Reports on the environment without throwing, for the readiness screen.
 * Returns names and presence only — never a value, not even truncated.
 */
export function inspectEnv(): EnvReport {
  const missing: string[] = [];
  const present: string[] = [];
  const warnings: string[] = [];

  for (const spec of REQUIRED) {
    const value = process.env[spec.name];
    if (!value || value.trim() === "") missing.push(spec.name);
    else present.push(spec.name);
  }

  for (const spec of OPTIONAL) {
    if (process.env[spec.name]?.trim()) present.push(spec.name);
  }

  // §3, §22: the service-role key must never be inlined into the browser.
  // Anything NEXT_PUBLIC_ is in the bundle by definition, so a key named that
  // way is already public whatever anyone intended.
  for (const name of Object.keys(process.env)) {
    if (!name.startsWith("NEXT_PUBLIC_")) continue;
    if (/service[_-]?role|secret|password|private[_-]?key/i.test(name)) {
      warnings.push(
        `${name} — اسم يوحي بسر وهو معرّض للمتصفح؛ أعد تسميته وأزل البادئة NEXT_PUBLIC_`,
      );
    }
  }

  return { ok: missing.length === 0, missing, present, warnings };
}

let validated = false;

/**
 * Fails fast when something required is absent.
 *
 * Called from the places that are about to need it. The message says which
 * variable and nothing else — a stack trace carrying a key is how a secret ends
 * up in a log aggregator.
 */
export function assertEnv(): void {
  if (validated) return;

  const report = inspectEnv();
  for (const warning of report.warnings) {
    console.error(`[env] ${warning}`);
  }

  if (!report.ok) {
    throw new Error(
      `Missing required environment variable(s): ${report.missing.join(", ")}. ` +
        `See .env.example. Values are never printed.`,
    );
  }

  validated = true;
}
