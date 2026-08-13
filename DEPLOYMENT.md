# النشر — بيت القفطان

## Requirements

Node 20+, a Supabase project, and a host that can run a Next.js server (Vercel,
or any Node host). The application is server-rendered throughout — there is no
static export.

## Environment variables (§3)

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser | project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser | anon key; RLS is what protects the data |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | bypasses RLS entirely |
| `NEXT_PUBLIC_STORE_TIMEZONE` | browser | display timezone, default `Asia/Amman` |

The service-role key must never be prefixed `NEXT_PUBLIC_`. Anything so prefixed
is inlined into the browser bundle, and a key in a bundle is a public key.

The application refuses to start a Supabase client with a required variable
missing, and names the variable — never the value.

`NEXT_PUBLIC_STORE_TIMEZONE` is read at **build** time. Changing it requires a
redeploy; the system screen flags it when it disagrees with the timezone
recorded in store settings.

## First deployment

1. Create the Supabase project.
2. Run the migrations **in order**, `0001` through `0024`, from the SQL editor.
   Each is idempotent; re-running is safe.
3. Set the environment variables on the host.
4. Build and deploy.
5. Create the first administrator — see the README; there is deliberately no
   public registration page.
6. Set `app_config.app_version` and `schema_version` to match what was deployed.
7. Walk the go-live checklist below.

## Migrations (§102, §103)

Every schema change is a numbered file in `supabase/migrations/`. There are no
undocumented manual changes; the production schema can be rebuilt from an empty
database by running them in order.

Before a destructive migration — dropping a column, changing a type, deleting
rows:

1. take a backup and **verify it restores** (`BACKUP.md`)
2. run it against a copy of production first
3. only then run it against production

Postgres DDL is transactional, so a failed migration rolls back. A *successful*
migration that turns out to be wrong does not, which is why the backup comes
first.

## Post-deployment checks

- [ ] `GET /api/health` returns `200`
- [ ] `GET /api/health?ready=1` returns `200` with database and storage `ok`
- [ ] sign in as an administrator
- [ ] `/settings/system` — version and schema version are what was deployed
- [ ] `/settings/system/integrity` — zero critical findings
- [ ] `/settings/system/readiness` — review each area
- [ ] record a test sale, then cancel it, and confirm both appear in the audit log

## Rollback (§137)

**Application:** redeploy the previous build. It is stateless; nothing else is
needed.

**Database:** assume it cannot be rolled back. A migration that added a column is
harmless to leave in place while the previous application version runs; one that
dropped or rewrote data is not, and the recovery path is a restore, not a reverse
migration. This is the reason destructive migrations get a verified backup first.

The safe ordering is: deploy the migration, confirm the old application still
works against the new schema, then deploy the new application. Then a rollback is
only ever an application rollback.

## Maintenance mode

`/settings/system` → وضع الصيانة. Non-administrators are held at a maintenance
page; administrators keep working. Use it during migrations and incidents. It is
checked in the dashboard layout, so it takes effect on the next page load rather
than needing a redeploy.

## Monitoring (§97)

`/api/health?ready=1` is intended for an external monitor. It returns `503` when
a dependency is down, so an uptime check needs no body parsing.

There is **no error-tracking service wired in.** Errors are logged as structured
JSON with a request id, severity, operation and user id — no payloads, no
secrets. If a service is added later, send it the same fields and no more.

## Go-live checklist (§138, §139)

Before the shop records its first real transaction:

- [ ] backup verified and a restore tested
- [ ] migrations run and `schema_version` recorded
- [ ] environment variables set, service-role key server-side only
- [ ] first administrator created; test accounts removed
- [ ] roles and permissions reviewed on `/settings/roles`
- [ ] store profile, logo, currency and timezone set
- [ ] financial accounts created, opening balances entered as adjustments
- [ ] products, variants and opening inventory entered
- [ ] suppliers and customers entered
- [ ] numbering prefixes agreed
- [ ] discount limit, return window and negative-stock rule set deliberately
- [ ] `/settings/system/integrity` — zero critical
- [ ] `/settings/system/readiness` — reviewed
- [ ] production build passes lint, typecheck and `npm run build`

## Opening balances (§140)

A shop that already trades has cash, stock and debts on the day it starts using
this system. Enter them as opening balances, never as invented historical sales:

| | How |
| --- | --- |
| Cash and bank | enable `allow_financial_adjustments`, post an `IN` adjustment per account with a reason, then **turn the setting off again** |
| Inventory | a purchase from the supplier, dated the opening day, at real cost — this sets the cost basis every later profit figure depends on |
| Customer debt | a sale dated the opening day for the amount owed |
| Supplier debt | an unpaid purchase dated the opening day |

Every one of these is audited, dated and attributed. Do not fabricate sales to
manufacture a balance — the profit reports would then report profit that was
never made.

## Commit convention

Commit messages carry the author's name only. Do not add
`Co-Authored-By: Claude ...` or any other AI-attribution trailer — not to
commits, not to pull request bodies, not to tags.
