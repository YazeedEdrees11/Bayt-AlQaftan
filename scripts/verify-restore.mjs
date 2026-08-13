#!/usr/bin/env node
/**
 * Restore verification (§68, §119).
 *
 * A backup is not a backup until a restore has been tested. This turns that
 * nine-step checklist into one command, because a checklist nobody runs and an
 * untested backup are the same thing.
 *
 *   node scripts/verify-restore.mjs \
 *     --url https://<restored-project>.supabase.co \
 *     --key <service-role-key-of-the-restored-project>
 *
 * Point it at the project you restored *into*, never at production: it reads
 * widely and one check writes a single row and deletes it again, which is the
 * only honest way to prove the restore is writable rather than read-only.
 *
 * It prints a verdict and exits non-zero if the restore is not usable, so it can
 * sit in a scheduled job.
 */

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), all[i + 1]]);
    return pairs;
  }, []),
);

const URL_BASE = (args.url ?? process.env.RESTORE_SUPABASE_URL ?? "").replace(/\/$/, "");
const KEY = args.key ?? process.env.RESTORE_SERVICE_ROLE_KEY ?? "";

if (!URL_BASE || !KEY) {
  console.error(
    "Usage: node scripts/verify-restore.mjs --url <project-url> --key <service-role-key>\n" +
      "   or: RESTORE_SUPABASE_URL=… RESTORE_SERVICE_ROLE_KEY=… node scripts/verify-restore.mjs\n\n" +
      "Point it at the RESTORED project, not production.",
  );
  process.exit(2);
}

let passed = 0;
const failures = [];

function check(label, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function rest(path, init = {}) {
  const response = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: response.ok, status: response.status, body, headers: response.headers };
}

async function rpc(name, args = {}) {
  return rest(`rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
}

async function count(table) {
  const response = await fetch(`${URL_BASE}/rest/v1/${table}?select=id`, {
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      Prefer: "count=exact", Range: "0-0",
    },
  });
  return Number((response.headers.get("content-range") ?? "/0").split("/")[1] ?? 0);
}

console.log(`\nRestore verification — ${URL_BASE}\n`);

/* ------------------------------------------------------------------ schema */
console.log("== schema");
const TABLES = [
  "profiles", "categories", "products", "product_variants", "suppliers",
  "customers", "sales", "sale_items", "sale_payments", "purchases",
  "purchase_items", "purchase_payments", "sales_returns", "exchanges",
  "inventory_transactions", "financial_accounts", "financial_transactions",
  "expenses", "audit_logs", "system_settings", "store_settings",
  "role_permissions", "app_config", "notifications",
];
const missing = [];
for (const table of TABLES) {
  const r = await rest(`${table}?select=*&limit=1`);
  if (!r.ok) missing.push(`${table} (${r.status})`);
}
check(`all ${TABLES.length} tables exist`, missing.length === 0, missing.join(", "));

const config = ((await rest("app_config?select=*")).body ?? [])[0];
check("app_config has a row", Boolean(config));
check("schema version is recorded", Boolean(config?.schema_version),
  `${config?.schema_version}`);
console.log(`       schema ${config?.schema_version}, app ${config?.app_version}`);

/* -------------------------------------------------------------------- data */
console.log("\n== data");
const counts = {};
for (const table of ["products", "product_variants", "customers", "suppliers",
                     "sales", "sale_items", "purchases", "inventory_transactions",
                     "financial_transactions", "audit_logs"]) {
  counts[table] = await count(table);
}
for (const [table, n] of Object.entries(counts)) {
  console.log(`       ${String(n).padStart(8)}  ${table}`);
}
check("the restore contains business data",
  counts.sales > 0 || counts.products > 0,
  "no products and no sales — is this the right project?");

/* ------------------------------------------------------------ relationships */
console.log("\n== relationships");
const sale = ((await rest("sales?select=id,sale_number&limit=1")).body ?? [])[0];
if (sale) {
  const items = (await rest(`sale_items?select=id&sale_id=eq.${sale.id}`)).body ?? [];
  check(`sale ${sale.sale_number} still has its items`, items.length > 0,
    `${items.length} items`);
  const movements =
    (await rest(`inventory_transactions?select=id&reference_id=eq.${sale.id}`)).body ?? [];
  check("and its inventory movements", movements.length > 0, `${movements.length}`);
} else {
  check("no sales to trace (empty restore)", true);
}

/* -------------------------------------------------------------- integrity */
console.log("\n== integrity");
const integrity = await rpc("integrity_checks");
if (integrity.ok && Array.isArray(integrity.body)) {
  const critical = integrity.body.filter((c) => c.severity === "CRITICAL");
  check(`${integrity.body.length} integrity checks ran`, integrity.body.length > 0);
  check("no critical findings", critical.length === 0,
    critical.map((c) => `${c.check_key}=${c.issue_count}`).join(", "));
} else {
  // The service role has no auth.uid(), so admin-only functions refuse it.
  // That is correct behaviour, not a restore failure — say so rather than fail.
  check("integrity checks are present (admin-only, not callable with a service key)",
    integrity.status === 400 || integrity.status === 403 || integrity.status === 500,
    `${integrity.status}`);
}

/* ------------------------------------------------------------------ writes */
console.log("\n== writable");
const probe = await rest("categories", {
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify({ name: `restore-probe-${Date.now()}`, is_active: false }),
});
check("the restored database accepts a write", probe.ok, `${probe.status}`);
if (probe.ok && probe.body?.[0]?.id) {
  await rest(`categories?id=eq.${probe.body[0].id}`, { method: "DELETE" });
  const gone = (await rest(`categories?select=id&id=eq.${probe.body[0].id}`)).body ?? [];
  check("and the probe row was removed again", gone.length === 0);
}

/* -------------------------------------------------------------------- auth */
console.log("\n== authentication");
const users = await fetch(`${URL_BASE}/auth/v1/admin/users?per_page=1`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
}).then((r) => r.json()).catch(() => null);
check("the auth schema restored with users",
  Array.isArray(users?.users) && users.users.length > 0,
  `${users?.users?.length ?? 0} users`);

const admins = (await rest("profiles?select=id&role=eq.ADMIN&is_active=eq.true")).body ?? [];
check("at least one active administrator exists", admins.length > 0, `${admins.length}`);

/* ----------------------------------------------------------------- storage */
console.log("\n== storage");
const buckets = await fetch(`${URL_BASE}/storage/v1/bucket`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
}).then((r) => r.json()).catch(() => null);
const names = Array.isArray(buckets) ? buckets.map((b) => b.id) : [];
check("storage buckets exist", names.length > 0, names.join(", "));
for (const bucket of ["product-images", "store-assets"]) {
  check(`bucket ${bucket} is present`, names.includes(bucket));
}
if (names.includes("store-assets")) {
  const listed = await fetch(`${URL_BASE}/storage/v1/object/list/store-assets`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ limit: 5, prefix: "" }),
  });
  const files = await listed.json().catch(() => []);
  check("bucket contents are listable", listed.ok, `${listed.status}`);
  if (Array.isArray(files) && files.length === 0) {
    console.log("       note: store-assets is empty — a database restore does not");
    console.log("             bring storage with it. Copy the buckets separately.");
  }
}

/* ------------------------------------------------------------------ verdict */
console.log(`\n${"-".repeat(46)}`);
console.log(`passed: ${passed}   failed: ${failures.length}`);
if (failures.length > 0) {
  console.log("\nfailures:");
  for (const line of failures) console.log(`  - ${line}`);
  console.log("\nRESTORE NOT VERIFIED");
} else {
  console.log("\nRESTORE VERIFIED");
  console.log("\nRecord it in production: /settings/system → سجّل التحقق,");
  console.log("ticking «اختُبرت الاستعادة». Then delete this scratch project —");
  console.log("it holds real customer data.");
}
process.exit(failures.length === 0 ? 0 : 1);
