import { signOut } from "@/lib/auth";
import { getCurrentUser, getIdentityDiagnostics } from "@/lib/current-user";

export default async function AccountPage() {
  const [user, diag] = await Promise.all([getCurrentUser(), getIdentityDiagnostics()]);

  const matches = (id?: string | null) =>
    id && diag?.resolvedGroups.includes(id) ? "member" : "not a member";

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

        <dt className="opacity-60">Entra object id</dt>
        <dd className="font-mono text-xs">{diag?.oid ?? "—"}</dd>

        <dt className="opacity-60">Group source</dt>
        <dd>{diag?.groupSource}</dd>

        <dt className="opacity-60">Groups in token</dt>
        <dd>
          {diag?.tokenGroups.length ? diag.tokenGroups.join(", ") : "none"}
          {diag?.tokenGroupsOverage ? " (overage — list omitted from token)" : ""}
        </dd>

        <dt className="opacity-60">Resolved groups</dt>
        <dd className="font-mono text-xs">
          {diag?.resolvedGroups.length ? diag.resolvedGroups.join(", ") : "none"}
        </dd>

        <dt className="opacity-60">IT group</dt>
        <dd>
          <span className="font-mono text-xs">{diag?.configuredGroups.it ?? "not set"}</span> —{" "}
          {matches(diag?.configuredGroups.it)}
        </dd>

        <dt className="opacity-60">Finance group</dt>
        <dd>
          <span className="font-mono text-xs">{diag?.configuredGroups.finance ?? "not set"}</span> —{" "}
          {matches(diag?.configuredGroups.finance)}
        </dd>

        <dt className="opacity-60">Graph fallback</dt>
        <dd>{diag?.graphConfigured ? "configured" : "not configured"}</dd>
      </dl>

      {diag?.groupSource === "none" && (
        <p className="rounded-md border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
          No group membership could be read. Either the token has no <code>groups</code> claim (check
          the app registration → Token configuration → groups claim, <strong>ID</strong> token
          checked) or the Graph app permission <code>GroupMember.Read.All</code> isn&apos;t consented.
          If you just changed either, sign out and back in.
        </p>
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
