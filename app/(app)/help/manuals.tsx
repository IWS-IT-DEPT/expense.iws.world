import type { ReactNode } from "react";

import type { Role } from "@/lib/current-user";

/**
 * Role manuals for /help. Plain content only — keep it in step with the real
 * screens (labels, queue names, who can do what). Everyone is a cardholder, so
 * that manual is always shown; the others appear by role (admin sees all).
 */

export interface Manual {
  id: string;
  role: Role;
  title: string;
  /** one line under the title */
  blurb: string;
  body: ReactNode;
}

function H({ children }: { children: ReactNode }) {
  return <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide opacity-60">{children}</h3>;
}
function P({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-sm leading-relaxed">{children}</p>;
}
function UL({ children }: { children: ReactNode }) {
  return <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">{children}</ul>;
}
function OL({ children }: { children: ReactNode }) {
  return <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed">{children}</ol>;
}
function Note({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 rounded-md border border-black/10 bg-black/[0.03] px-3 py-2 text-sm dark:border-white/15 dark:bg-white/[0.05]">
      {children}
    </p>
  );
}

const cardholder: Manual = {
  id: "cardholder",
  role: "cardholder",
  title: "Employee guide",
  blurb: "Logging card purchases, out-of-pocket expenses and mileage — for everyone.",
  body: (
    <>
      <H>The big picture</H>
      <P>
        You enter every expense yourself. There is no statement import. Two kinds of expense follow two
        different paths:
      </P>
      <UL>
        <li>
          <strong>Company card purchases</strong> are submitted <em>one at a time</em>, as soon as each is
          ready. They go to Accounting, then to an Approver.
        </li>
        <li>
          <strong>Out-of-pocket expenses and mileage</strong> are collected through the week and submitted
          together as one weekly report. They go to Payroll.
        </li>
      </UL>
      <Note>
        Everything for the week is due by <strong>end of day Friday</strong>. You&apos;ll get reminder emails
        Wednesday morning, Friday morning and Friday afternoon if anything is still unsubmitted.
      </Note>

      <H>Install it as an app</H>
      <P>
        You can install IWS Expense on your phone&apos;s home screen or as a Windows/Mac desktop app, so it opens like any other app. See{" "}
        <a href="#install-app" className="underline">
          Install the app
        </a>{" "}
        at the top of this page.
      </P>

      <H>Notifications</H>
      <P>
        Turn on notifications (on <strong>Your account</strong> or the Help page) to be told when an expense
        is sent back, and for the Wednesday and Friday reminders. If notifications are on you won&apos;t also
        get those emails. On iPhone, install the app to your home screen first.
      </P>

      <H>Pull down to refresh</H>
      <P>
        In the installed app, drag down from the top of any screen to refresh it — handy after someone sends
        something back.
      </P>

      <H>Signing in</H>
      <UL>
        <li>Use <strong>Sign in with Microsoft</strong> with your company account.</li>
        <li>
          You&apos;re signed out after 8 hours of inactivity, and always after 10 hours. Sign in again and
          carry on — nothing is lost.
        </li>
        <li>
          Click your name in the top bar (<strong>Your account</strong>) to see your role. If you think you
          should have more access, send IT a screenshot of that page.
        </li>
      </UL>

      <H>One-time setup: register your card</H>
      <OL>
        <li>Go to <strong>My Expenses → My Cards</strong>.</li>
        <li>Choose the card network, enter the <strong>last 4 digits</strong> and a nickname, then add it.</li>
        <li>Repeat for every company card you carry. You can remove a card you no longer use.</li>
      </OL>
      <P>Only the last 4 digits are stored — never the full number.</P>

      <H>Log a card purchase</H>
      <OL>
        <li>On <strong>My Expenses</strong>, click <strong>+ Log a Purchase</strong>.</li>
        <li>
          Fill in the <strong>merchant</strong>, <strong>amount</strong>, <strong>purchase date</strong> and{" "}
          <strong>which card</strong>. Notes are optional.
        </li>
        <li>
          Add the <strong>coding</strong> (below) and the <strong>receipt</strong> (below).
        </li>
        <li>
          Save. Add the <strong>receipt on this same screen</strong> (tap <strong>Scan or add receipt</strong>) —
          for purchases at or over the receipt amount you need it to save. Changed your mind? Tap{" "}
          <strong>✕ Cancel</strong> at the top (or Cancel at the bottom); if you&apos;ve entered anything it asks
          before throwing it away. You can still save a purchase as a draft with missing details and finish it
          later — it just can&apos;t be submitted until it&apos;s complete.
        </li>
        <li>
          When it&apos;s ready, click <strong>Submit</strong> on its row. It goes straight to Accounting.
          On <strong>This Week</strong> you can use <strong>Submit N ready</strong> to send everything that&apos;s
          complete in one click.
        </li>
      </OL>

      <H>Coding: five dropdowns</H>
      <P>
        Every expense needs to be coded so Accounting can book it to the right company file. The entity is
        chosen <strong>per purchase</strong>, not by the card — you can buy for a different company on the
        same card.
      </P>
      <OL>
        <li><strong>Entity</strong> — which company is this for?</li>
        <li><strong>Location</strong> — which site? (The entity&apos;s own sites are listed first.)</li>
        <li>
          <strong>Truck/unit or job</strong> — only shown when the company needs one (for example trucks for
          Rolling Green and Gravel Grabbers, jobs for Precision Construction Repair).
        </li>
        <li><strong>Category</strong> — what kind of expense?</li>
        <li><strong>Business purpose</strong> — a short sentence on why. Be specific (&ldquo;Fuel for Truck 07, Houston run&rdquo;).</li>
      </OL>

      <H>Receipts</H>
      <UL>
        <li>
          A receipt is required for card and out-of-pocket expenses <strong>at or above the policy amount</strong>{" "}
          (set by IT; $75 by default). Mileage never needs one.
        </li>
        <li>
          Use <strong>Scan</strong> to photograph the receipt with your camera: drag the four corners onto the
          receipt edges and it straightens the page. Add more pages if needed.
        </li>
        <li>
          On a computer, the receipt dialog shows a <strong>QR code</strong>. Scan it with your phone to take
          the photo there — it appears on your computer automatically. The link is short-lived and works only
          for that expense.
        </li>
        <li>
          Or upload a file: JPG, PNG, WebP, HEIC or PDF, up to 10 MB each and 12 files at a time.
        </li>
        <li>
          Receipt first? You can scan a receipt before logging anything — it creates a draft purchase for you
          to fill in.
        </li>
      </UL>

      <H>Out-of-pocket expenses</H>
      <OL>
        <li>Click <strong>+ Out of Pocket</strong>.</li>
        <li>
          Enter the <strong>date</strong>, <strong>amount</strong> and <strong>how you paid</strong>, add the
          coding and a receipt, and save.
        </li>
        <li>It stays on your list as a draft until you submit your weekly report.</li>
      </OL>

      <H>Mileage</H>
      <OL>
        <li>Click <strong>+ Mileage</strong>.</li>
        <li>
          Enter the <strong>date</strong>, <strong>miles</strong>, and where you went <strong>from</strong> and{" "}
          <strong>to</strong>, plus the coding.
        </li>
        <li>
          The dollar amount is worked out for you from the IRS rate in effect on that date. You never type a
          rate.
        </li>
      </OL>

      <H>The weekly report (This Week)</H>
      <UL>
        <li>
          <strong>Card purchases</strong> section: a checklist of this week&apos;s card purchases — which are
          already submitted and which still need something. Fix the ones that need info, then submit.
        </li>
        <li>
          <strong>Reimbursements</strong> section: your out-of-pocket and mileage items. Review them, then click{" "}
          <strong>Submit reimbursements</strong> to send them to Payroll as one report.
        </li>
        <li>Anything dated this week or earlier that isn&apos;t submitted yet still shows up here.</li>
      </UL>

      <H>What the statuses mean</H>
      <UL>
        <li><strong>Draft</strong> — yours to edit; not submitted.</li>
        <li><strong>Submitted</strong> — waiting for Accounting (card) or Payroll (reimbursement) to check it.</li>
        <li><strong>Reconciled</strong> — checked; waiting for final approval.</li>
        <li>
          <strong>Approved</strong> — done and locked. You&apos;ll get an email, and it moves off My Expenses
          into <strong>History</strong>.
        </li>
        <li><strong>Sent back</strong> (shown in red) — the reviewer wants a change; the reason is shown.</li>
        <li><strong>Voided</strong> — you cancelled it.</li>
      </UL>

      <H>If something is sent back</H>
      <OL>
        <li>Open the red item and read the reason (you&apos;ll also get an email).</li>
        <li>Fix it — add the missing receipt, correct the coding or amount.</li>
        <li>Submit it again.</li>
      </OL>
      <P>
        You can edit an expense only while it&apos;s a draft or sent back. Once submitted it&apos;s locked; if
        you spot a mistake, ask the reviewer to send it back. Drafts can be <strong>deleted</strong>; sent-back
        items can be <strong>discarded</strong>.
      </P>

      <H>Overdue expenses</H>
      <P>
        An expense you haven&apos;t submitted by end of day Friday of the week it belongs to is marked with a
        red <strong>N days overdue</strong> badge. Submit it (or delete it if it&apos;s not needed) to clear it.
        Sent-back items count too if they&apos;re still waiting on you.
      </P>

      <H>History tab</H>
      <P>
        <strong>History</strong> lists everything that&apos;s been approved, newest first, 20 per page. Use it to
        look up an old expense or receipt. Approved items no longer clutter My Expenses.
      </P>

      <H>Summary tab</H>
      <P>
        <strong>Summary</strong> shows your week at a glance: what&apos;s been submitted, what&apos;s waiting on
        someone, and what still needs your attention.
      </P>
    </>
  ),
};

const accounting: Manual = {
  id: "accounting",
  role: "accounting",
  title: "Accounting guide",
  blurb: "Reconciling card charges, card-spend reports, and the shared coding tables.",
  body: (
    <>
      <P>
        Switch to the <strong>Accounting</strong> section with the toggle in the top bar. You also keep
        everything in the Employee guide for your own expenses.
      </P>

      <H>Reconcile — check each card charge</H>
      <P>
        <strong>Accounting → Reconcile</strong> lists submitted card charges grouped by cardholder and card,
        each with its coding and receipts.
      </P>
      <OL>
        <li>Compare each charge to the card statement and open the receipt.</li>
        <li>
          If it matches, click <strong>Confirm</strong>.
        </li>
        <li>
          If the statement shows a different amount or date, enter the <strong>actual amount</strong> and/or{" "}
          <strong>actual purchase date</strong> before confirming. Reports use the corrected figure.
        </li>
        <li>Add a note if something is worth recording.</li>
        <li>
          If something is wrong with the coding or receipt, use <strong>Send back</strong> and give the
          cardholder a clear reason — they&apos;re emailed it.
        </li>
      </OL>
      <Note>
        You can&apos;t reconcile your own expenses. Someone else on the team has to.
      </Note>
      <P>
        Confirmed charges move to <em>Reconciled</em> and wait for an Approver. Accounting does not give final
        approval.
      </P>

      <H>Reports — card spend</H>
      <UL>
        <li>
          <strong>Accounting → Reports</strong> shows card spend only: totals, charts, and breakdowns by
          entity, category and cardholder, for a week, month or quarter.
        </li>
        <li>
          Switch between <strong>Turned in</strong> (everything submitted) and <strong>Approved</strong> (only
          locked charges).
        </li>
        <li>Export to <strong>Excel</strong> or <strong>PDF</strong> from the same page.</li>
        <li>Reimbursements (mileage and out-of-pocket) are handled by Payroll and don&apos;t appear here.</li>
      </UL>

      <H>Settings you maintain</H>
      <P>
        Open <strong>Settings</strong> from the top bar. You can manage the shared lists that feed every
        dropdown:
      </P>
      <UL>
        <li>
          <strong>Entities</strong> — the companies. Click one to open its page: edit its code, name and
          costing, set up its QuickBooks company (Realm ID, accounts, and the mapping of our categories,
          locations, units, jobs, cards and employees to QuickBooks), or remove it. Changes only show a
          Save bar once you&apos;ve edited something. Renaming a code or deleting an entity makes you type a
          confirmation first; an entity with expense history can&apos;t be deleted — untick{" "}
          <strong>Active</strong> to retire it instead.
        </li>
        <li><strong>Locations</strong> and <strong>Units</strong> (trucks) / <strong>Jobs</strong>.</li>
        <li><strong>Categories</strong> — expense types.</li>
        <li><strong>Cards</strong> — view and edit any cardholder&apos;s registered cards.</li>
      </UL>
      <UL>
        <li>To stop using an item, untick <strong>Active</strong> — it disappears from dropdowns but history is kept.</li>
        <li>
          <strong>Delete</strong> only appears when nothing has ever used that row. Retire it instead if it
          has history.
        </li>
      </UL>
    </>
  ),
};

const approver: Manual = {
  id: "approver",
  role: "approver",
  title: "Approver guide",
  blurb: "Final approval of reconciled card charges.",
  body: (
    <>
      <P>
        Approvers use the <strong>Accounting</strong> section of the top bar.
      </P>

      <H>Approvals</H>
      <OL>
        <li>
          Open <strong>Accounting → Approvals</strong>. It lists charges Accounting has already reconciled,
          grouped by cardholder. The total uses the corrected amount where Accounting adjusted it.
        </li>
        <li>
          Review a group, then click <strong>Approve all</strong> for that cardholder, or approve selected
          charges.
        </li>
        <li>
          If a charge shouldn&apos;t go through, use <strong>Send back</strong> on that charge and give a reason.
          It returns to the cardholder, who is emailed.
        </li>
      </OL>
      <P>
        Approving <strong>locks</strong> the charge — it can no longer be edited — and emails the cardholder.
      </P>
      <Note>You can&apos;t approve your own charges. Another approver or an admin has to.</Note>

      <H>Also available</H>
      <UL>
        <li>
          <strong>Reconcile</strong> — you can confirm or send back submitted charges the same way Accounting
          does (see the Accounting guide).
        </li>
        <li><strong>Reports</strong> — card-spend analytics and exports.</li>
      </UL>
      <P>
        Reimbursements (mileage and out-of-pocket) are approved by Payroll, not by approvers.
      </P>
    </>
  ),
};

const payroll: Manual = {
  id: "payroll",
  role: "payroll",
  title: "Payroll guide",
  blurb: "Reimbursements for mileage and out-of-pocket expenses, start to finish.",
  body: (
    <>
      <P>
        Payroll owns reimbursements end to end. Switch to the <strong>Payroll</strong> section with the toggle
        in the top bar. It has three tabs that follow the order of the work.
      </P>

      <H>1. Reconcile — check each line</H>
      <P>
        <strong>Payroll → Reconcile</strong> lists submitted lines grouped by employee, each with its receipt or
        trip details.
      </P>
      <OL>
        <li>Check each line against its receipt (out-of-pocket) or trip (mileage).</li>
        <li>
          Click <strong>Confirm</strong> on a line, or confirm a whole employee&apos;s group at once.
        </li>
        <li>
          If a line is wrong, <strong>Send back</strong> with a reason. The employee is emailed and the line
          leaves their report so they can fix and resubmit.
        </li>
      </OL>
      <P>
        You can&apos;t change an amount. The employee&apos;s entry is the request — if you disagree, send it back.
        When every line in a weekly report is settled, the report moves to <em>Reconciled</em> automatically.
      </P>
      <Note>You can&apos;t reconcile or approve your own reimbursements.</Note>

      <H>2. Approvals — release for payment</H>
      <UL>
        <li>
          <strong>Payroll → Approvals</strong> shows reconciled reports. Click <strong>Approve</strong> to lock
          the report for payment; the employee is emailed.
        </li>
        <li>Or <strong>Send back</strong> the whole report with a reason.</li>
      </UL>

      <H>3. Reports</H>
      <UL>
        <li>
          <strong>Payroll → Reports</strong> is the reimbursement dashboard: totals, mileage vs. out-of-pocket,
          and breakdowns by employee, entity and category.
        </li>
        <li>Export to <strong>Excel</strong> or <strong>PDF</strong> for processing.</li>
      </UL>

      <H>The mileage rate</H>
      <P>
        Under <strong>Settings → Mileage</strong> you maintain the IRS rate. Add a new rate with its{" "}
        <strong>effective date</strong> when the IRS changes it; each mileage entry automatically uses the rate
        in effect on its own date. If no rate exists for a date, employees can&apos;t log mileage for it — so
        add the new rate before it takes effect.
      </P>
    </>
  ),
};

const admin: Manual = {
  id: "admin",
  role: "admin",
  title: "Administrator (IT) guide",
  blurb: "Users and roles, shared settings, policy, and troubleshooting.",
  body: (
    <>
      <P>
        Admins can open every section: Employee, Accounting, Payroll and <strong>Settings</strong>. Admins can
        also act as approvers and as payroll — but never on their own expenses.
      </P>

      <H>How roles are assigned</H>
      <UL>
        <li>
          <strong>Admin</strong>, <strong>Accounting</strong> and <strong>Payroll</strong> come from Microsoft 365
          groups (IT, Finance and HR) and update automatically each time someone uses the app. To grant or
          remove one of these roles, change group membership in Microsoft 365, not in this app.
        </li>
        <li>
          <strong>Approver</strong> is set by hand under <strong>Settings → Users</strong>.
        </li>
        <li>Everyone else is a <strong>Cardholder</strong>.</li>
        <li>
          If someone is removed from a group, they drop back to Cardholder at their next page load.
        </li>
        <li>
          A break-glass admin list in the app settings keeps named people as admin regardless of groups.
        </li>
      </UL>

      <H>Settings → Users</H>
      <UL>
        <li>
          The Users tab is a searchable list. <strong>Click a person</strong> to open their page: change their
          name, role (for approvers), home entity and location, and whether they can log mileage. The Save bar
          appears only once you&apos;ve changed something.
        </li>
        <li>
          Untick <strong>Active</strong> to disable an account — they&apos;re locked out of receipts, uploads and
          exports immediately. Deactivating someone, or granting/removing admin, makes you type their email to
          confirm. You can&apos;t deactivate or demote yourself. People can&apos;t be deleted, because their
          expenses are the company&apos;s record.
        </li>
        <li>
          <strong>+ Add user</strong> sets a person up by email ahead of their first sign-in. They still sign in
          with Microsoft. Pick their role (Cardholder or Approver; Admin, Accounting and Payroll come from Microsoft 365
          groups). By default they&apos;re emailed setup instructions — what their role lets them do, how to sign
          in, add the app to an iPhone, Android or computer, and where the Help guide is. People who sign in on their own for the first
          time get the same email, and <strong>Email setup instructions</strong> on a person&apos;s page re-sends it.
        </li>
        <li>
          Only people whose email is on an allowed company domain can sign in at all (set by the
          environment, not in the app).
        </li>
      </UL>

      <H>Other Settings tabs</H>
      <UL>
        <li>
          <strong>Overview</strong> — access-control summary and entities at a glance.
        </li>
        <li>
          <strong>Entities, Locations, Units, Jobs, Categories, Cards</strong> — the shared coding lists
          (see the Accounting guide). Retire rows with <strong>Active</strong>; <strong>Delete</strong> appears
          only if nothing uses the row.
        </li>
        <li>
          <strong>Mileage</strong> — the IRS rate by effective date (see the Payroll guide).
        </li>
        <li>
          <strong>Policy</strong> — the dollar amount at or above which a receipt is required (default $75).
          Applies to card and out-of-pocket expenses, not mileage.
        </li>
        <li>
          <strong>Go-live cleanup</strong> — permanently removes test users and/or their expenses before launch
          (admin only). Pick the users, choose whether to remove only their expenses or the accounts too, review
          the exact counts, and type the confirmation phrase. It can&apos;t delete your own account, and it can&apos;t
          be undone.
        </li>
        <li>
          <strong>Email</strong> — who receives the internal alerts: Accounting (&ldquo;new card expenses to
          reconcile&rdquo;) and Payroll / HR (&ldquo;new reimbursement to reconcile&rdquo;). Enter one or several
          addresses, save, and use <strong>Send test</strong> to confirm the mailbox gets it. Leave a box blank to
          use the default (<code>accounting@iws.world</code>, <code>HR@iws.world</code>).
        </li>
        <li>
          <strong>Errors</strong> — server errors grouped by cause with counts. Mark an error{" "}
          <strong>Resolved</strong> when handled (it reopens if it recurs), or clear out resolved ones.
        </li>
      </UL>

      <H>Troubleshooting</H>
      <UL>
        <li>
          <strong>&ldquo;I don&apos;t see a section I should have.&rdquo;</strong> Ask them to open{" "}
          <strong>Your account</strong>: it shows their resolved role, the groups Microsoft sent, and where the
          role came from. &ldquo;Groups in token: none&rdquo; means the Entra groups claim isn&apos;t configured;
          an overage message means they&apos;re in too many groups and the app falls back to Microsoft Graph.
        </li>
        <li>
          <strong>Can&apos;t sign in.</strong> Check their email domain is on the allowed list and the account is{" "}
          <strong>Active</strong> in Users.
        </li>
        <li>
          <strong>Mileage won&apos;t save.</strong> No IRS rate exists on or before that date — add one.
        </li>
        <li>
          <strong>Nobody can approve something.</strong> Reviewers can&apos;t act on their own expenses; make
          sure at least two people hold each reviewing role.
        </li>
        <li>
          <strong>Reminder emails.</strong> They run from a scheduled job (Wednesday and Friday mornings, Friday
          afternoon, Central time). During testing all email can be redirected to a single address — clear that
          setting before go-live.
        </li>
        <li>
          <strong>A user is stuck on a receipt.</strong> Check <strong>Errors</strong> first; receipts are stored
          privately and are only ever shown through the app.
        </li>
      </UL>
    </>
  ),
};

export const MANUALS: Manual[] = [cardholder, accounting, approver, payroll, admin];

/** Manuals a given role should see: everyone gets the employee guide; admin sees all. */
export function manualsFor(role: Role): Manual[] {
  if (role === "admin") return MANUALS;
  return MANUALS.filter((m) => m.role === "cardholder" || m.role === role);
}
