# IWS Expense

Internal expense tracking and reporting for the IWS group of companies — an
Expensify-style tool for employees with company credit cards, plus out-of-pocket
and mileage reimbursement.

Hosted at **expense.iws.world**.

---

## The group

Six sister companies, each with its **own QuickBooks Online company file**:

| Code   | Company                                        | Costing dimension |
| ------ | ---------------------------------------------- | ----------------- |
| `IWS`  | International Warehousing & Shipping, LLC      | none (entity + location) |
| `PRE`  | Precision Construction Repair                  | **job**           |
| `PORT` | Port City Repair                               | **unit**          |
| `RGT`  | Rolling Green Transportation                   | **unit** (trucks) |
| `RGL`  | Rolling Green Logistics                        | none              |
| `GGB`  | Gravel Grabbers, LLC                           | **unit** (trucks) |

Three card programs (the entity on a charge is chosen per-transaction, **not**
derived from the card):

- Capital One — IWS
- Capital One — Precision Construction Repair
- American Express — Rolling Green Transportation

## The coding model

Every card charge gets one or more **allocations**. Each allocation carries the
full cost coding, collected by a guided wizard:

1. **Who is this for?** → entity
2. **Which site?** → location (the entity's own sites listed first; any site is selectable)
3. **Which truck / job?** → unit or job, shown only when the entity requires it
4. **What kind of expense?** → category
5. **Why?** → business purpose

Display tag: `RGT · Main Office · Truck 07 · Fuel`

### Workflow

Cardholders **enter every expense themselves** — there is no statement import.
**Card purchases flow continuously**, one at a time; **reimbursements batch** into
a weekly report.

```
CARD PURCHASE:  cardholder logs it + coding + receipt → submits it →
                accounting reconciles vs. the statement (confirm / correct) →
                approver approves → ready for the books / QBO

OOP / MILEAGE:  cardholder logs items through the week → submits the weekly
                reimbursement report → approver approves → payroll
```

Everything is due **end of day Friday** — that's the reminder deadline, not a
batch gate for card charges.

- **Cards** (`/cards`): a cardholder self-registers each card — network + last 4 +
  nickname. No admin approval, no link to a card program.
- **Expenses** (`/expenses`): the `+ Log a Purchase / Out of Pocket / Mileage`
  buttons. Card lines can be drafted uncoded; coding + receipt are required to
  submit. `lib/expense-checks.ts` is the readiness rule set. A ready card
  purchase has a **submit** button on the row / edit page; `submitCardExpense`
  sends it straight to `/reconcile`.
- **This Week** (`/report`): a completeness checklist — which of this week's card
  purchases are submitted, which still need info — plus the **Submit
  reimbursements** batch for out-of-pocket + mileage (`submitWeek` →
  `expense_reports`). Reminder emails (Wed am / Fri am / Fri pm, Central) go to
  anyone with an unsubmitted expense — `app/api/cron/report-reminders` + Resend.
- **Reconcile** (`/reconcile`, accounting): submitted card charges grouped by
  cardholder + card, each with coding + receipts. Confirm each (recording
  `actualAmountCents` / `actualPurchaseDate` if the statement differs) or send it
  back. Out-of-pocket receipts show here too (display-only; acted on at approval).
- **Approvals** (`/approvals`, approver/admin): reconciled card charges grouped by
  cardholder — **approve all** or per-charge send-back — plus submitted
  reimbursement reports. Books total uses `COALESCE(actualAmountCents, amountCents)`.

Data model: a card purchase is a `pending_expenses` row (name is historical — the
receipt-upload plumbing keys off it), lifecycle
`draft → submitted → reconciled → approved`, no `reportId`. Out-of-pocket +
mileage are `expense_items` on an `expense_reports` batch. Every transition writes
an `approvals` audit row.

### Receipt capture

An in-browser scanner (`app/components/receipt-scanner.tsx` + `lib/scan-warp.ts`)
— camera → drag 4 corners → perspective de-skew → multi-page PDF via `pdf-lib`, no
OpenCV. Desktop can hand off to a phone via a QR code carrying a short-lived HMAC
token (`lib/upload-token.ts`); the phone posts to the public `/api/receipt-upload`
and the desktop polls for the result. Receipt bytes are only ever served through
the authenticated `/api/receipts/[id]` route.

The Capital One / Amex CSV parsers (`lib/transactions/`) are kept in the tree for
a future reconciliation feature but are not wired to anything.

## Stack

| Concern    | Choice                                              |
| ---------- | -------------------------------------------------- |
| Framework  | Next.js 16 (App Router) + TypeScript + Tailwind    |
| Hosting    | Vercel (Pro — the Hobby tier is non-commercial-use only) |
| DB         | Neon Postgres + Drizzle ORM                        |
| Auth       | Auth.js v5 + Microsoft Entra ID (M365 SSO)         |
| Receipts   | Vercel Blob (prod) / local disk (dev)              |
| Accounting | QuickBooks Online API — one connection per entity  |
| Email      | Resend                                             |

## Local setup

```bash
npm install
cp .env.example .env.local      # fill in DATABASE_URL + AUTH_SECRET at minimum
npm run db:migrate              # create tables
npm run db:seed                 # entities, locations, categories, mileage rate
npm run dev
```

`AUTH_SECRET`: `npx auth secret`. In dev, leave `ALLOWED_EMAIL_DOMAINS` blank so
any Microsoft account can sign in.

### Roles

| Role | Source | Access |
| ---- | ------ | ------ |
| `admin` | Entra group `IT@iws.world` | everything, incl. `/admin/*` and approvals |
| `accounting` | Entra group `IWS-Finance@iws.world` | `/reconcile`, `/approvals` |
| `approver` | set manually on `/admin/users` | `/reconcile`, `/approvals` |
| `cardholder` | default | own expenses + weekly report + `/cards` |

Cardholders self-register their cards at **`/cards`** (network + last 4 +
nickname) — no approval step. Admins can view/edit all cards under **IT Admin →
Cards**.

Role sync runs on **every request** once `ENTRA_GROUP_IT` + `ENTRA_GROUP_FINANCE`
are set. Membership is read from the token's `groups` claim, falling back to
**app-only Microsoft Graph** (`GroupMember.Read.All` application permission +
admin consent) when the claim is missing or overflowed. `BOOTSTRAP_ADMIN_EMAILS`
is a break-glass list that's always `admin`.

Visit **`/account`** to see your resolved role, groups, and which path produced
them — the place to debug "I don't see the admin toggle".

First-run: set `BOOTSTRAP_ADMIN_EMAILS=you@iws.world`, sign in, configure the
groups, then remove yourself from the bootstrap list.

### Scripts

| Command              | What                                          |
| -------------------- | --------------------------------------------- |
| `npm run dev`        | dev server                                    |
| `npm run db:generate`| generate a migration from schema changes      |
| `npm run db:migrate` | apply migrations                              |
| `npm run db:seed`    | (idempotent) reference data                   |
| `npm run db:studio`  | Drizzle Studio — browse/edit data             |
| `npm run typecheck`  | `next typegen && tsc --noEmit`                |
| `npm run lint`       | ESLint                                        |

## Microsoft Entra ID (M365 SSO)

1. **Entra admin center → App registrations → New registration.**
   Redirect URI: `https://expense.iws.world/api/auth/callback/microsoft-entra-id`
   (and `http://localhost:3000/...` for dev).
2. Create a **client secret**. Note the client ID, secret, and **tenant ID**.
3. **API permissions** → grant admin consent for the tenant:
   - Delegated: `openid`, `profile`, `email`, `User.Read`.
   - **Application: `GroupMember.Read.All`** — required for the group→role sync's
     Graph fallback. Without admin consent the Graph call returns
     `403 Authorization_RequestDenied` and everyone stays `cardholder`.
4. **Token configuration → Add groups claim → Security groups**, with the **ID**
   token box checked. This is the primary path for group membership; the Graph
   permission above only covers overage / a missing claim. Skipping this leaves
   "Groups in token: none" on `/account`.
5. Set env:
   - `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`
   - `AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/<TENANT_ID>/v2.0`
     (tenant-locked issuer — **not** `common` — is what restricts login to the org)
   - `ALLOWED_EMAIL_DOMAINS=iws.world`

Needs someone with **Application Administrator** rights in the tenant (and a
Privileged Role Administrator / Global Admin to grant admin consent in step 3).

## Deploy (Vercel)

1. Import the GitHub repo as a new Vercel project (framework auto-detected;
   `vercel.json` runs `db:migrate` before the build and registers the reminder
   cron).
2. Create a **Blob store** for the project (`BLOB_READ_WRITE_TOKEN` is injected
   automatically; the app uses Vercel Blob whenever that token is present).
3. Set the other env vars (see `.env.example`) for Production + Preview —
   including `RESEND_API_KEY`, `MAIL_FROM`, `CRON_SECRET`, `APP_TZ` for the
   weekly-report reminder emails.
4. Add `expense.iws.world` as a domain: in **GoDaddy DNS** add a `CNAME`,
   host `expense`, value `cname.vercel-dns.com`. TLS is automatic.
5. Add the production redirect URI to the Entra app registration.

Auth.js trusts the Vercel host automatically — no `AUTH_TRUST_HOST` needed.

## QuickBooks Online — Phase 2

Not wired yet. `lib/qbo/` has the types, dimension-mapping helpers and a stubbed
client. To finish:

1. Create an Intuit app; run the OAuth flow **6 times** (one grant per entity),
   store `realmId` + encrypted tokens in `qbo_connections`.
2. Sync Account / Class / Location / Customer / Vendor lists into `qbo_dimensions`.
3. Build the "map our dimensions to QBO" admin screen (`dimension_mappings`).
4. Dimension mapping: entity→company file, location→Location, unit→Class,
   job→Project, category→Account, cardholder→PrivateNote.
5. Export approved charges as **Purchase** objects; reimbursements as **Bill**s.
   Record every attempt in `qbo_exports`.

QBO has **no CSV import for Purchases** — the API is the only real path.

## Roadmap

- [x] Cardholder-entered expenses (card / out-of-pocket / mileage)
- [x] Weekly report → reconcile → approve, with reminder emails
- [x] Receipt scanner + QR phone handoff
- [ ] Split allocations UI (schema already supports it)
- [ ] Reimbursement batches → payroll CSV export (`reimbursement_batches`)
- [ ] QuickBooks Online integration (Phase 2 above)
- [ ] Statement reconciliation view — link cardholder expenses to imported lines
- [ ] Timezone-correct week boundaries (`weekBounds` is currently UTC)
- [ ] Drop the dead `transactions` / `allocations` / `exception_flags` tables

## Layout

```
db/            schema.ts, migrations, seed
lib/
  auth*.ts         Auth.js + Entra, edge-safe config split
  current-user.ts  session → users row, role helpers
  coding.ts        coding rules, validation, display tag
  expense-checks.ts  "is this line ready to submit / clean" rule set
  mileage.ts       IRS rate lookup + amount
  storage.ts       receipt blob store (Vercel Blob / local)
  receipt-store.ts validate + store a receipt file (shared by both upload routes)
  upload-token.ts  HMAC signed one-time links for the phone handoff
  scan-warp.ts     perspective de-skew for the scanner (no deps)
  pdf-assemble.ts  multi-page image/PDF → single PDF (pdf-lib)
  email.ts         Resend wrapper
  transactions/    Capital One / Amex CSV parsers — kept, not wired to anything
  qbo/             QuickBooks types + stubbed client (Phase 2)
app/
  signin/          M365 sign-in
  r/[token]/       public phone upload page (token-auth, no login)
  components/      modal, coding-fields, receipt-scanner, receipt-upload-button
  (app)/           authed shell
    page.tsx           dashboard (cardholder / accounting / approver tiles)
    expenses/          unified list + Log a Purchase / Out of Pocket / Mileage
    cards/             cardholder self-registers a card
    report/            weekly review-and-confirm + submit
    reconcile/         accounting: confirm each card line vs. the statement
    approvals/         approver: lock a reconciled report
    admin/             reference-data setup
  api/receipts/    authed receipt upload + streaming (/[id])
  api/receipt-upload/  public token-auth upload + status poll
  api/cron/report-reminders/  weekly-report reminder emails (hourly cron)
```
