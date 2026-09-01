<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# IWS Expense — project notes

Internal expense tracking for the 6-company IWS group. See `README.md` for the
full picture. Key facts an agent needs:

- **Next.js 16** (App Router, Turbopack). `middleware` is now `proxy.ts`.
- **6 entities**, each with its own QuickBooks Online file. Entity on a charge is
  chosen per-transaction, never derived from the card.
- **No CSV import.** Cardholders enter every expense themselves. The
  `transactions` / `allocations` / `exception_flags` tables and `/lib/transactions`
  parsers are dead (kept for a future reconciliation feature).
- **Card expense** = a `pending_expenses` row (historical name; the receipt-upload
  plumbing keys off it), lifecycle `draft → submitted → reconciled → approved`
  (`+ rejected`). **Submitted one at a time** by the cardholder
  (`submitCardExpense`) the moment it's ready — no `reportId`, no weekly batch.
  Guard every cardholder edit on `status in ('draft','rejected')`.
- **Out-of-pocket + mileage** = `expense_items`, batched weekly into an
  `expense_reports` row (`submitWeek`), lifecycle `draft → submitted → approved`
  (no reconcile step — nothing to check against a statement).
- **Coding** columns (entity, location, unit|job, category, purpose) live inline
  on both tables. `entities.costingMode` drives which of unit/job is required.
  Rules in `lib/coding.ts`; the 5 selects are `<CodingFields>`;
  `lib/expense-checks.ts` says whether a line is ready to submit.
- **`/report` ("This Week")** is a completeness checklist for card purchases +
  the `submitWeek` batch for reimbursements. **Reconcile** (`/reconcile`) is
  accounting confirming each submitted card charge vs. the statement (may set
  `actualAmountCents`/`actualPurchaseDate`), per-charge. **Approve**
  (`/approvals`) locks reconciled card charges (`approveCardExpenses`, bulk) and
  submitted reimbursement reports (`approveReport`).
- Receipt files go through `lib/receipt-store.ts`; bytes served only via
  `/api/receipts/[id]`. Phone handoff uses HMAC tokens (`lib/upload-token.ts`).
- Reminder emails: `app/api/cron/report-reminders` (hourly, picks a slot in
  `APP_TZ`), `lib/email.ts` (Resend).
- **Money is integer cents** everywhere (`amountCents`). Rates/miles use `numeric`.
- DB is **Neon Postgres via the `neon-http` driver** — no interactive
  transactions; write sequential statements.
- Auth: **Auth.js v5 + Entra**. `lib/auth.config.ts` is edge-safe (no DB);
  `lib/current-user.ts` does the session→`users` lookup and role checks.
- Run `npm run typecheck` (includes `next typegen`) and `npm run lint` before finishing.
- Don't run `npm run db:migrate` / `db:seed` against the production Neon DB
  without the user's say-so.
- QuickBooks integration is **stubbed** (`lib/qbo/`). Don't assume it works.
