import { signOut } from "@/lib/auth";
import { getCurrentUser, getIdentityDiagnostics } from "@/lib/current-user";
import { graphSelfTest } from "@/lib/graph";

export default async function AccountPage() {
  const user = await getCurrentUser();
  // Diagnostics show for everyone: someone who *expects* elevated access but is
  // still `cardholder` is exactly who needs to see why.
  const diag = await getIdentityDiagnostics();
  const graph = await graphSelfTest();

  const matches = (id?: string | null) =>
    id && diag?.resolvedGroups.includes(id) ? "✓ member" : "not a member";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Your account</h1>
        <p className="text-sm opacity-70">
          {user?.name} · {user?.email}
        </p>
      </div>

      <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="opacity-60">Role</dt>
        <dd className="font-medium">{user?.role}</dd>
      </dl>

      {diag && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
            Identity diagnostics
          </h2>
          <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="opacity-60">Entra object id</dt>
            <dd className="font-mono text-xs">{diag.oid ?? "—"}</dd>

            <dt className="opacity-60">Group source</dt>
            <dd className="font-medium">{diag.groupSource}</dd>

            <dt className="opacity-60">Groups in token</dt>
            <dd>
              {diag.tokenGroups.length ? diag.tokenGroups.join(", ") : "none"}
              {diag.tokenGroupsOverage ? " (overage — list omitted from token)" : ""}
            </dd>

            <dt className="opacity-60">Resolved groups</dt>
            <dd className="font-mono text-xs">
              {diag.resolvedGroups.length ? diag.resolvedGroups.join(", ") : "none"}
            </dd>

            <dt className="opacity-60">IT → admin</dt>
            <dd>
              <span className="font-mono text-xs">{diag.configuredGroups.it ?? "not set"}</span> —{" "}
              {matches(diag.configuredGroups.it)}
            </dd>

            <dt className="opacity-60">Finance → accounting</dt>
            <dd>
              <span className="font-mono text-xs">{diag.configuredGroups.finance ?? "not set"}</span>{" "}
              — {matches(diag.configuredGroups.finance)}
            </dd>

            <dt className="opacity-60">HR → payroll</dt>
            <dd>
              <span className="font-mono text-xs">{diag.configuredGroups.hr ?? "not set"}</span> —{" "}
              {matches(diag.configuredGroups.hr)}
            </dd>

            <dt className="opacity-60">Graph fallback</dt>
            <dd className={graph.ok ? "" : "text-amber-600 dark:text-amber-400"}>
              {graph.ok ? "working" : "NOT working"} — {graph.detail}
            </dd>
          </dl>

          {!graph.ok && graph.appRoles.length === 0 && (
            <p className="rounded-md border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
              <strong>Fix:</strong> App registration → API permissions → Add a permission →
              Microsoft Graph → <strong>Application permissions</strong> →{" "}
              <code>GroupMember.Read.All</code> → Add, then <strong>Grant admin consent</strong>. A{" "}
              <em>Delegated</em> permission of the same name does nothing for this. Once the row shows
              Type <strong>Application</strong> with a green check, reload this page.
            </p>
          )}

          {diag.groupSource === "none" && (
            <p className="rounded-md border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
              No group membership could be read from the token either. If <code>IT@iws.world</code>{" "}
              and <code>IWS-Finance@iws.world</code> are Microsoft 365 groups (they have mailboxes),
              the groups claim must be set to <strong>&quot;Groups assigned to the application&quot;</strong>{" "}
              or <strong>&quot;All groups&quot;</strong> — not &quot;Security groups&quot;. Sign out
              and back in after changing it.
            </p>
          )}
        </section>
      )}

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/signin" });
        }}
      >
        <button
          type="submit"
          className="rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/20"
        >
          Sign out &amp; back in (refreshes groups)
        </button>
      </form>
    </div>
  );
}
