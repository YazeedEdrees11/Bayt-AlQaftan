# النسخ الاحتياطي والاستعادة — بيت القفطان

**What this document is not:** a claim that backups are configured. Nothing in
this codebase takes a backup, and nothing in it verifies one exists. Supabase
runs backups on its own schedule for the project's plan. This document says what
must be true, how to check it, and how to restore — and the readiness screen
reports the backup area as a warning precisely because the application cannot
confirm any of it.

## What must be backed up (§65)

| | Where it lives | Covered by |
| --- | --- | --- |
| Database | Supabase Postgres | Supabase automated backups |
| Storage files | Supabase Storage buckets | **not** covered by database backups |
| Migrations | `supabase/migrations/` in git | git |
| Configuration | `.env` on the host | **manual — nowhere else** |

The two gaps are the ones that bite. A database backup restores every sale and
every balance and **no receipt images**. And the environment file exists on the
deployment host and in nobody's git repository, by design — if it is lost, the
project keys must be read again from the Supabase dashboard.

## Schedule and retention (§64, §66)

Recommended for a single shop:

| | Retention |
| --- | --- |
| Daily database backup | 30 days |
| Weekly | 3 months |
| Monthly | 1 year |
| Point-in-time recovery | as the Supabase plan allows |

Storage buckets: a monthly copy is enough for a shop that adds a few receipts a
day. Copy them somewhere that is not the same Supabase project.

Do not automate deletion of business records to save space. Retention here means
how long *backups* are kept, never how long records are kept.

## Recording that a backup happened

The system has no way to observe Supabase's backup schedule, so the fact is
recorded by a person who has checked it:

```sql
update public.app_config
   set last_backup_at = now(),
       backup_status  = 'verified — daily, Supabase dashboard',
       updated_at     = now()
 where id;
```

`/settings/system` shows this, and readiness turns the backup area to FAIL once
it is more than 48 hours old. That field is a note from the operator, not a
measurement — treating it as proof of a backup is the mistake this paragraph
exists to prevent.

## Restore procedure (§70)

Never restore over a live database that still has good data in it. Restore to a
new project first, verify, then decide.

1. **Identify the incident** and stop writes — enable maintenance mode, or take
   the deployment offline if the application itself is the problem.
2. **Choose the backup.** Note its timestamp: everything after it is lost, and
   that gap is what the shop will have to re-enter by hand.
3. **Restore the database** into a *new* Supabase project from the dashboard.
4. **Restore storage** by copying the bucket contents into the new project.
   Database rows hold paths, not images; a restored database with no storage
   shows broken receipts.
5. **Verify migrations** — `app_config.schema_version` should match the highest
   file in `supabase/migrations/`.
6. **Run integrity checks** — `/settings/system/integrity`. Zero critical.
7. **Verify authentication** — sign in as an administrator.
8. **Verify balances** — compare cash, bank, receivables and payables on
   `/settings/system/integrity` against what they were before the incident.
9. **Point the application** at the new project (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) and redeploy.
10. **Reopen** — disable maintenance mode.

## Restore testing (§68, §119)

**A backup is not a backup until a restore has been tested.** An untested backup
is a belief.

Test quarterly, into a scratch project:

- [ ] the restore completes
- [ ] tables and row counts look right
- [ ] a sale opens and shows its items, payments and inventory movements
- [ ] `/settings/system/integrity` reports zero critical findings
- [ ] reports render and their totals match what the source project showed
- [ ] an administrator can sign in
- [ ] storage files resolve

Record the date and the result. Delete the scratch project afterwards — it
contains real customer data.

**Status at the time of writing: not performed.** Restoring requires access to
the Supabase project and a second project to restore into; neither is something
this codebase can do on its own.

## Targets (§69)

| | Target | What it means here |
| --- | --- | --- |
| RPO | 24 hours | at most one day of sales re-entered by hand |
| RTO | 4 hours | from decision to reopening the shop |

Both depend on the Supabase plan. Daily backups make a 24-hour RPO the best
achievable; point-in-time recovery would bring it to minutes and is worth the
cost once the shop is taking real money.
