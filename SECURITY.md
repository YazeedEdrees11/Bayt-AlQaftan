# الأمان — بيت القفطان

Security model, and the decisions behind it. No secrets appear in this file.

## Authentication

Supabase Auth. The application implements **no** custom authentication: no
password hashing, no token minting, no session storage of its own. Sessions are
HTTP-only cookies written by `@supabase/ssr` on the server.

A deactivated account is blocked in three independent places, so no single
mistake reopens it:

| Layer | Mechanism |
| --- | --- |
| Sign-in | `requireAuth()` signs the session out and redirects |
| Database | `current_user_role()` filters on `is_active`, so every guard built on it returns false |
| RLS | policies call those guards |

Verified: a deactivated administrator holding a still-valid token cannot read
other profiles, cannot write, and **cannot reactivate themselves** — the update
matches no rows.

## Authorization

Three layers, and the first two are decoration without the third.

1. **Interface** — links and buttons are hidden. Presentation only.
2. **Server** — every page and action calls `requirePermission()`.
3. **Database** — RLS policies and `SECURITY DEFINER` functions.

The role → permission matrix lives in `role_permissions`. The twelve SQL guards
(`can_sell()`, `can_view_reports()`, …) read that table, so the permissions
screen changes what the database will accept, not merely what the interface
offers. `ADMIN` is not editable: `set_role_permission` refuses it outright, so
the system cannot be configured into having no administrator.

**Phase 7 found this the hard way.** The reporting functions shipped without a
database-level check — the screens were guarded, the RPCs underneath were not,
and a salesperson with nothing but their own session could read gross sales,
COGS and margin. Fixed in `0012`. The lesson is in the ordering above: guarding
the interface is not guarding the data.

## Row Level Security

Enabled on every business table. Audited by probing what a real signed-in user
can actually do, rather than by reading the catalogue:

- no table is readable anonymously
- no table accepts an anonymous insert
- append-only tables (`inventory_transactions`, `customer_balance_transactions`,
  `supplier_balance_transactions`, `financial_transactions`, `notifications`,
  settings, the matrix) reject direct insert, update and delete even from a
  manager — every write goes through a `SECURITY DEFINER` function
- a salesperson reads no financial or system table

`audit_logs` has a SELECT policy and no others. There is no update or delete
policy and none should be added: a log that can be edited is not evidence.

## Secrets

`SUPABASE_SERVICE_ROLE_KEY` is server-only and never prefixed `NEXT_PUBLIC_`.
Anything so prefixed is inlined into the browser bundle by definition, so a
secret named that way is already public whatever was intended — `inspectEnv()`
scans for that pattern and reports it on the readiness screen.

`.gitignore` covers `.env*`. The full git history was scanned for JWTs and
connection strings; none was ever committed. `.env.example` carries empty
placeholders.

If a real credential is ever committed, treat it as compromised and rotate it in
the Supabase dashboard. Removing it from the current file is not sufficient —
the object remains in the history and in every clone.

## Input validation

Validated at the boundary that matters, which is the database function, not the
form. Verified refused: negative prices, negative and zero and fractional
quantities, `NaN`, `Infinity`, malformed dates, and sort values carrying SQL.

Sorting is an allowlist. No user input is concatenated into SQL anywhere; every
query is parameterised or a typed RPC argument.

## Business rules

Rules that protect money are enforced inside the function that owns the write —
discount ceiling, negative stock, return window, credit-customer requirement,
expense receipts, manual ledger adjustments. A limit checked only in the browser
is a suggestion, and the API is one `fetch` away.

Each rule is tested **both ways**: on must refuse, off must permit. That matters
more than it sounds. A rule can fail by being attached to nothing — fourteen
settings were, before `0019` — or by refusing everything, which is how `0020`'s
predecessor would have blocked every return in the shop.

## Idempotency

Sales, purchases, payments, refunds, transfers and expenses accept an
`idempotency_key`. A repeat carrying the same key returns the first result
instead of doing the work again. The claim lives in the caller's transaction, so
a failed attempt releases its key and a genuine retry proceeds.

## File storage

| Bucket | Visibility | Writers |
| --- | --- | --- |
| `product-images` | public read | managers |
| `store-assets` (logo) | public read | administrators |
| `payment-receipts` | private | managers |
| `expense-receipts` | private | managers |

`store-assets` accepts PNG, JPEG and WEBP, capped at 2 MB. **SVG is excluded**
although §6 permits it conditionally: the bucket is world-readable and SVG can
carry script, which together is stored XSS. Enabling it would mean making the
bucket private and serving signed URLs.

Filenames are generated, never taken from the upload.

## Known and accepted

**`uuid` advisory GHSA-w5hq-g745-h8pq (moderate), reached through `exceljs`.**
Missing buffer bounds check in `uuid` v3/v5/v6 *when a buffer is supplied*.
`exceljs` calls `v4` with no buffer argument, server-side, on data this
application generates — no attacker-controlled input reaches it. The only fix
npm offers is `exceljs@3.4.0`, a major downgrade. **Assessed as not exploitable
here and accepted.** Re-evaluate when exceljs updates its dependency.

**CSP keeps `'unsafe-inline'` for scripts.** Next.js inlines its bootstrap and
hydration payload. Removing it needs per-request nonces threaded through the
framework. Writing a policy the application then violates would be worse.

**CSP adds `'unsafe-eval'` in development, and only there.** React's development
build calls `eval()` to rebuild callstacks across the server/client boundary;
blocking it fills the console with violations that hide real errors. React never
calls it in a production build, so the production policy stays strict — verify
with:

```bash
curl -sD - -o /dev/null https://<host>/login | grep -i content-security-policy
```

`script-src` must read `'self' 'unsafe-inline'` with no `'unsafe-eval'`, and
`connect-src` must name only the Supabase origin. The switch in
`next.config.ts` tests `NODE_ENV === "production"` rather than
`!== "development"`, so an unset or misspelled environment falls back to the
strict policy instead of the loose one.

## Incident response (§136)

1. **Detect** — an alert, a report, or a failing integrity check.
2. **Assess** — scope, and whether money or stock is affected.
3. **Contain** — enable maintenance mode (`/settings/system`) to stop writes.
   Administrators keep working; everyone else is held out.
4. **Preserve** — export the relevant audit log range before changing anything.
   `audit_logs` is append-only and is the record of who did what.
5. **Restore or fix** — see `BACKUP.md` for the restore procedure.
6. **Verify** — run `/settings/system/integrity`. Expect zero critical findings.
7. **Document** — what happened, what was done, what it cost.
8. **Prevent** — a test that would have caught it, before closing the incident.

If credentials were exposed: rotate in Supabase, redeploy, and review
`audit_logs` for activity in the exposure window.

## Dependency updates

`npm audit` before each release. Assess rather than upgrade reflexively: check
whether the vulnerable path is reachable from this application before accepting
a breaking change. Record the reasoning here, as above.
