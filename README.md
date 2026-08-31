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

```
import CSV → assign to cardholder → cardholder codes (weekly, mandatory)
          → accounting reviews → approve-by-exception → push to QuickBooks
```

Reimbursements (out-of-pocket + IRS-rate mileage) collect into a batch and export
to **payroll**. Intercompany charges (bought for an entity other than the card
owner) are flagged for accounting; no due-to/due-from automation yet.

### Approve-by-exception

`lib/exceptions.ts` scores each item. Clean items (coded, receipt present,
under threshold, known merchant, splits balance) can be **batch-approved**;
anything flagged surfaces individually in `/review`.

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
| `admin` | Entra group `IT@iws.world` | everything, incl. `/admin/*` backend management |
| `accounting` | Entra group `IWS-Finance@iws.world` | `/review`, `/imports`, exports |
| `approver` | set manually on `/admin/users` | `/review` |
| `cardholder` | default | own transactions + weekly report |

Role sync runs on **every login** once `ENTRA_GROUP_IT` + `ENTRA_GROUP_FINANCE`
are set (to the group Object Ids) and the app registration emits a `groups`
claim. Until then, set roles on `/admin/users`. `BOOTSTRAP_ADMIN_EMAILS` is a
break-glass list that's always `admin`.

First-run: set `BOOTSTRAP_ADMIN_EMAILS=you@iws.world`, sign in, then configure
the groups and remove yourself from the bootstrap list.

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
3. **API permissions:** `openid`, `profile`, `email`, `User.Read` → grant admin consent.
4. Set env:
   - `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`
   - `AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/<TENANT_ID>/v2.0`
     (tenant-locked issuer — **not** `common` — is what restricts login to the org)
   - `ALLOWED_EMAIL_DOMAINS=iws.world`

Needs someone with **Application Administrator** rights in the tenant.

## Deploy (Vercel)

1. Import the GitHub repo as a new Vercel project (framework auto-detected;
   `vercel.json` runs `db:migrate` before the build).
2. Create a **Blob store** for the project and set `STORAGE_DRIVER=vercel`
   (`BLOB_READ_WRITE_TOKEN` is injected automatically).
3. Set the other env vars (see `.env.example`) for Production + Preview.
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

- [ ] Split allocations UI (schema already supports it)
- [ ] Receipt upload + mobile capture (PWA), receipt viewer in `/review`
- [ ] Out-of-pocket + mileage entry on the weekly report
- [ ] Reimbursement batches → payroll CSV export
- [ ] Admin CRUD for locations / units / jobs / categories / card assignments
- [ ] Teller integration (replace/augment CSV import) behind `TransactionSource`
- [ ] Email digests for Allie (approve links) + missing-receipt nags
- [ ] QuickBooks Online integration (Phase 2 above)
- [ ] Structured multi-approver routing (pending managing-partner decision)
- [ ] Statement reconciliation view (charges vs. statement total per period)

## Layout

```
db/            schema.ts, migrations, seed
lib/
  auth*.ts         Auth.js + Entra, edge-safe config split
  current-user.ts  session → users row, role helpers
  coding.ts        wizard rules, validation, display tag
  exceptions.ts    approve-by-exception flag rules
  txn-flags.ts     recompute a transaction's flags
  transactions/    CSV parsers behind TransactionSource (Capital One, Amex)
  qbo/             QuickBooks types + stubbed client (Phase 2)
  storage.ts       receipt blob store (Vercel Blob / local)
  mileage.ts       IRS rate lookup
app/
  signin/          M365 sign-in
  (app)/           authed shell
    page.tsx           dashboard
    transactions/      list + coding wizard
    report/            weekly report + submit
    review/            accounting review queue
    admin/             CSV import + setup overview
  api/imports/     statement CSV upload
```
