# المرحلة العاشرة — تقرير التسليم

Final QA, UX polish, and go-live readiness. This is the honest account: what was
checked, what broke, what is still yours to do, and what the system deliberately
does not do.

---

## 1. What this phase was for

The nine phases before it built the system and verified each piece as it was
built. This phase asked a different question: **does the whole thing hold up
when a real shop uses it for a day?**

That question found four defects that nine phases of unit-level verification had
not. Three of them were invisible to every existing test, and the reason they
were invisible is the most useful thing in this report — see §3.

---

## 2. Defects found and fixed

### 2.1 Exchanges were impossible — `0026`

`require_exchange_reason` ships switched **on**. Since migration 0019,
`create_exchange` refused any payload whose `reason` was empty. Nothing ever
sent one: the form did not collect a reason, the action did not pass one, and
the `exchanges` table had nowhere to put one.

**Cost if shipped:** every exchange in the shop fails, with a generic
rule-blocked message that names no field. The feature is entirely dead.

**How it survived:** the exchange browser tests were written in Phase 6 and the
guard was added in Phase 8. Nothing re-ran them across that boundary.

**Fixed:** the reason is a first-class field (reusing the return reasons — an
exchange is a return and a sale in one movement, so the customer's answer to
"why?" is the same answer), collected by the form, stored on the row, shown on
the detail screen, and marked required in the UI only when the setting says so.

### 2.2 Money in the drawer that no report could explain — `0027`

`finance_summary` read sales, returns, purchases and expenses. It never read
`exchanges`. Every profit figure single-sources from it, so all of them shared
the blind spot.

**Measured:** a customer swapped a 150 piece for a 250 one and paid the 100
difference. The cash ledger recorded the 100 — drawer, closing report and
reconciliation screen all agreed it was there. No revenue line accounted for it,
and the 50 of extra cost that left the shop was missing from cost of goods to
match. The day's gross profit was understated by exactly the margin on the swap.

**Fixed:** revenue takes `new − returned` and cost takes
`new_cost − returned_cost`, both signed — a customer swapping *down* is a refund
wearing a different hat. The difference joins the gross line as well as the net
one, keeping `gross − discounts − returns = net` true for anyone checking by
hand.

### 2.3 The second opinion on the same number — `0028`

`get_sales_report` keeps its own copy of gross and net sales, so 0027 did not
reach it and the two screens disagreed by exactly the exchange differences.

That function *cannot* delegate: it filters by customer, category and payment
method, and `finance_summary` takes only dates. **The duplication is
load-bearing** — which means any change to the shape of revenue has to be made
in both places.

`reconciliation_summary` had the same copy and is fixed alongside it.
`sales_summary`, behind the sales list, is deliberately left invoice-only: it
summarises the rows shown beneath it, and folding exchanges in would stop its
total tying to the list. Its labels are qualified in the UI instead
(«الربح الإجمالي للفواتير», «لا يشمل الاستبدالات») so no two identically-named
figures disagree.

### 2.4 The breakdowns that no longer added up — `0029`

The headline figures counted exchanges; everything that breaks them down — by
product, category, brand, day, week, month — still counted only invoices.
Product rows came to 28,900 against a reported net of 29,410; the daily series
to 29,100 against 29,610.

**Fixed** in `get_profit_by_dimension`, `get_product_report`, `get_sales_series`
and `finance_series`. Attribution is exact rather than apportioned:
`exchange_items` keeps both legs with their own variant, quantity, price and
cost, so the replacement adds its value to its own product and the piece handed
back takes it off its own. Summed across variants that is precisely the
`new − returned` difference the headline carries — the breakdown reconciles by
construction, not by coincidence.

`invoice_count` is untouched on purpose: an exchange is not an invoice, and
inflating it would make average-order-value wrong to make another number tidy.

### 2.5 No way back into a locked-out account

No forgot-password link, no admin reset, nothing. A staff member who forgot
their password in week one had no remedy inside the system.

**Fixed:** an administrator sets a new password from **المستخدمون**, through the
same Supabase admin API that creates accounts. The application still hashes
nothing and stores nothing. It is guarded by the same role hierarchy as editing
— a manager with `MANAGE_USERS` cannot seize an administrator's account by
resetting it — and the audit entry records who and when, never what.

### 2.6 Interface defects

| What | Effect | Fix |
| --- | --- | --- |
| `SelectTrigger` carried `data-[size=default]:h-8` | **Every select in the app rendered 32px.** All 62 call sites asking for 36/40/44 were silently overruled — `cn` merges `h-8` against `h-11` but cannot know a data-attribute rule is the same property, so the cascade decided. A select sat visibly short of the 44px input beside it. | Plain `h-9`, which merges properly |
| `Button` default `h-8` | «إتمام البيع» — the most-tapped control in the shop — was 32px under 44px fields; every row action was a 32×32 square | 40px on touch, 32px from `lg` up. `lg` not `sm`: the counter tablet at 768px is a touch device |
| `PageHeader` actions did not wrap | `/inventory` scrolled sideways on **every** phone width — its badge was pushed 126px off the start edge. Shared component, so every screen with two actions had the same latent bug | `flex-wrap` |
| Deactivating a user fired straight from the menu | One misread row locked a colleague out mid-shift | Confirmation dialog naming the consequence |
| Export timestamps | Excel used the server clock and CSV used UTC — two exports of one report stamped hours apart, and on a UTC host a report pulled at 1am in Riyadh was dated the previous day | Both through the store's timezone |
| `/reports/products/profit` had no guard | Relied entirely on its redirect target's guard. No leak — a salesperson is correctly turned away — but a route whose only protection is where it happens to point is one query-string change away from being an open door | Guards itself |
| Sidebar announced «المرحلة الثامنة» | A development phase shown to shop staff; the second stale phase banner this project has had | Replaced with the version, which stays true and is the first thing anyone asks about when reporting a fault |

---

## 3. The thing worth carrying forward

**Two copies of the same mistake read exactly like correctness.**

Every cross-report consistency check passed for ten phases while the reports
were consistently wrong. `get_sales_report` and `finance_summary` agreed on a
figure that omitted exchanges, because both omitted it. The check that finally
caught it was not a comparison between two parts of the system — it was
arithmetic done by hand, on paper, before the day was run, and compared against
what the system said afterwards.

The corollary is a rule for the suites: **a test that reads a value out of the
system and asserts the system agrees with itself proves nothing.** There has to
be a third opinion.

The same shape appeared once more in the reset script, which is worth
recording because the script no longer exists to show it. Its table list was
written by hand and was wrong twice — the second miss (`financial_transfers`,
`cash_closings`) surfaced only when a restarted sequence collided with rows
still holding `TRF-000007`. Every transfer between till and bank would have
failed days into real trading, with no visible cause. The fix was to stop
writing the list: derive it from the schema, every `create table public.*`
minus what is deliberately kept. **A list of things to check, written from
memory, is a guess wearing a checklist's clothes.**

The second lesson is narrower and cost two rounds of rework. After 0028 I swept
every database function for its own copy of revenue and reported all clear. The
sweep looked for `sum(sales.total_amount)`; four functions aggregate
`sale_items` instead — a different route into the same data — and slipped
through. **A sweep is only as good as its question.** The corrected one asks
whether a function aggregates anything reachable from a sale.

---

## 4. What was verified

Fifteen suites, roughly 614 assertions, all against the real database and a real
browser — no mocks.

| Suite | Checks | What it proves |
| --- | --- | --- |
| Go-live simulation | 51 | A full trading day: 4 sales, a part-paid delivery, a debt settled, a return, an exchange, an expense. Every figure written down before the run and compared after |
| Route access matrix | 8 | All 72 routes × 4 principals. Nothing opens for a visitor; nothing restricted opens for a salesperson |
| Screens | 14 | 13 screens × 6 widths from 320px, RTL, labels, alt text, one `h1` per screen, visible focus |
| States | 13 | Empty searches on 11 lists, missing records on 8 detail routes, unknown URLs, confirmation before deactivation |
| Reports & analytics | 128 | Every figure reconciles with the ledger it derives from |
| Settings & rules | 271 | Each rule tested **both ways** — on must refuse, off must permit |
| Security & integrity | 55 | RLS, permission matrix, 14 integrity checks |
| Idempotency | 24 | A double submission is one sale |
| Financial correctness | 35 | Balances derive from ledgers, never stored |
| Monitoring & backup | 28 | Events record, stale-backup alert fires and clears |
| Load | 11 | Concurrent writes under contention |

Production build compiles clean. The only JWT in the client bundle decodes to
`"role":"anon"`; the service key's signature appears in neither `.next/static`
nor `.next/server`. That one needed care — both keys share a JWT header *and*
the project ref, so a prefix grep reports a false match.

**Two suites currently report `NEGATIVE_STOCK` CRITICAL.** Four variants sit
below zero, all of them QA products (`QA-DWRO5-B`, `Q88-CD8JA`, `QA-CCG4Z-B`,
`Q88-DXEGU`), left by the Phase 8 tests that deliberately enabled
`allow_negative_stock` to prove overselling is refused when it is off. The
integrity checker flagging them is the checker working. They go with the reset
in §5.

---

## 5. Before the shop opens — yours to do

Nothing below can be done from here. The order matters.

1. ~~Reset the database.~~ **Done.** Ten phases of test data removed; settings,
   permissions, accounts and users kept. The script that did it has been
   deleted from the repository on purpose — its only job was this one
   transition, and a file whose purpose is deleting every sale in the shop has
   no business sitting next to the code once real trading starts. A new
   environment is built by replaying `supabase/migrations/`, not by resetting
   an old one.
2. **Provision production** — domain, HTTPS, environment variables per
   [DEPLOYMENT.md](DEPLOYMENT.md). `SUPABASE_SERVICE_ROLE_KEY` is server-only and
   goes in no `NEXT_PUBLIC_*` variable, ever.
3. **Confirm backups are on**, then **run one restore test** with
   `node scripts/verify-restore.mjs` against a restored copy — never against
   production — and record it at **الإعدادات → النظام**. A backup nobody has
   restored is not a backup.
4. **Configure the shop** — [ADMIN-GUIDE.md](ADMIN-GUIDE.md) steps 1–10: store
   details, **opening cash and bank balances**, users, business rules, numbering
   prefixes, receipts, opening stock.

   The opening balance is not paperwork. The system refuses to pay out cash it
   does not have — the simulation was refused
   `insufficient_funds — الصندوق (الرصيد 0.00 والمطلوب 1200.00)` on its first
   run — which is correct, and which stops day one dead if the drawer opens at
   zero.
5. **Have the staff use it** for a day against real stock before it is the only
   record. Give them [USER-GUIDE.md](USER-GUIDE.md).
6. **Check `/api/health?ready=1`** returns 200, and point monitoring at it. It
   answers 503 when the system is not fit to take real work.

---

## 6. Deliberately not built

Not omissions — decisions, each with a reason:

- **No purchase returns to suppliers.** Not part of how this shop works today.
- **No double-entry ledger or financial statements.** The shop needs balances
  and profit, not a chart of accounts.
- **No delete of completed financial records.** Corrections are cancellations
  and reversals; the original stays visible. This is what makes a month
  auditable.
- **No "delete all data" or factory reset in the UI.** It would be the most
  dangerous button in the shop. The reset in §5 is a one-off script a developer
  runs deliberately.
- **No self-service password reset by email.** Shop staff have no work inbox to
  check; recovery goes through the administrator, who is standing there.
- **No server-side PDF.** Node PDF libraries do not join Arabic letterforms, so
  the output would be disconnected letters. The print view renders in the
  browser, which shapes Arabic correctly, and prints to PDF properly.

---

## 7. Known limitations

- **`sales_summary` and the sales report answer different questions.** The first
  ties to the invoice list it sits above; the second is the shop's revenue and
  includes exchange differences. Labels distinguish them. Anyone adding a third
  revenue figure must decide which of the two it is.
- **`get_sales_report` duplicates `finance_summary`'s definitions** because it
  filters and `finance_summary` does not. Any future change to the shape of
  revenue must be made in both. 0028 exists because that was missed once.
- **Average invoice value is invoice-only** and will not reproduce from
  `net_sales / invoice_count` once exchanges exist. That is correct, and it is
  the one figure on the report that does not divide out.
- **Row-action buttons inside tables remain 32px** on desktop. Chrome and
  primary actions are 40px on touch; dense secondary actions in a scrollable
  table are not.
- **`financial_accounts.current_balance` is a cache nobody reads.** Balances come
  from `account_balances`, which derives from the ledger. The column is
  maintained by a trigger and is correct in production, where nothing is
  deleted. Anyone reaching for it should reach for the view instead.

---

## 8. Sign-off

The application is complete and verified against the specification. It is **not
live**, and it should not take real money until §5 is done — particularly the
restore test and the opening balances.

Migrations 0001–0029 applied. Build clean. 614 checks, the only outstanding
failures being the QA negative stock that §5 step 1 removes.
