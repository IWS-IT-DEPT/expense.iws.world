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
- **Coding** = `allocations` rows (entity, location, unit|job, category, purpose).
  Which of unit/job is required comes from `entities.costingMode`. Logic lives in
  `lib/coding.ts`; keep validation there, not in components. The 5 coding selects
  are the shared `<CodingFields>` component.
- **Receipt Bank** = `pending_expenses` (pre-coded purchase + receipt, awaiting
  its charge). `lib/receipt-match.ts` matches + applies on import. Receipt files
  go through `lib/receipt-store.ts`; bytes are served only via
  `/api/receipts/[id]`. Phone handoff uses HMAC tokens (`lib/upload-token.ts`).
- **Money is integer cents** everywhere (`amountCents`). Rates/miles use `numeric`.
- DB is **Neon Postgres via the `neon-http` driver** — no interactive
  transactions; write sequential statements.
- Auth: **Auth.js v5 + Entra**. `lib/auth.config.ts` is edge-safe (no DB);
  `lib/current-user.ts` does the session→`users` lookup and role checks.
- Run `npm run typecheck` (includes `next typegen`) and `npm run lint` before finishing.
- Don't run `npm run db:migrate` / `db:seed` against the production Neon DB
  without the user's say-so.
- QuickBooks integration is **stubbed** (`lib/qbo/`). Don't assume it works.
