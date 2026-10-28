import { and, count, eq, inArray, ne } from "drizzle-orm";

import { db } from "@/db";
import { policySettings, userRole, users } from "@/db/schema";

import { findUserOidByEmail, getGroupName, getUserGroupIds, graphConfigured, scanGroupForEmail } from "./graph";

export type Role = (typeof userRole.enumValues)[number];

/** Break-glass admins (BOOTSTRAP_ADMIN_EMAILS) are always Admin, whatever any group says. */
const BOOTSTRAP = (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Which Microsoft 365 (Entra) group grants which app role. Editable by an admin
 * under Settings → Roles & groups (stored in `policy_settings`); the ENTRA_GROUP_*
 * environment variables are the fallback so existing setups keep working.
 *
 * Roles listed here are *group-driven*: membership decides the role at every
 * sign-in. Cardholder is everyone's default. If someone is in several mapped
 * groups the highest-privilege role wins (order below).
 */
export const GROUP_ROLES: Role[] = ["admin", "accounting", "payroll", "approver"]; // high → low

const ENV_KEYS: Partial<Record<Role, string>> = {
  admin: "ENTRA_GROUP_IT",
  accounting: "ENTRA_GROUP_FINANCE",
  payroll: "ENTRA_GROUP_HR",
};

export const settingKey = (role: Role) => `group_role_${role}`;

export interface GroupConfig {
  /** role → group object id (lower-case), only for mapped roles */
  groups: Partial<Record<Role, string>>;
  source: Partial<Record<Role, "setting" | "environment">>;
  /** Group sync counts as "on" when both Admin and Accounting are mapped. */
  syncEnabled: boolean;
  /** roles currently decided by group membership */
  driven: Role[];
}

let cache: { cfg: GroupConfig; at: number } | null = null;
const TTL_MS = 60_000;

export function invalidateGroupConfig() {
  cache = null;
}

export async function getGroupConfig(): Promise<GroupConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.cfg;

  const saved = new Map<string, string>();
  try {
    const rows = await db.query.policySettings.findMany({
      where: inArray(policySettings.key, GROUP_ROLES.map(settingKey)),
    });
    for (const r of rows) if (typeof r.value === "string" && r.value.trim()) saved.set(r.key, r.value.trim());
  } catch {
    // settings unreadable: fall back to environment rather than locking everyone out
  }

  const groups: GroupConfig["groups"] = {};
  const source: GroupConfig["source"] = {};
  for (const role of GROUP_ROLES) {
    const fromSetting = saved.get(settingKey(role));
    const fromEnv = ENV_KEYS[role] ? process.env[ENV_KEYS[role]!]?.trim() : undefined;
    if (fromSetting) {
      groups[role] = fromSetting.toLowerCase();
      source[role] = "setting";
    } else if (fromEnv) {
      groups[role] = fromEnv.toLowerCase();
      source[role] = "environment";
    }
  }

  const cfg: GroupConfig = {
    groups,
    source,
    syncEnabled: !!(groups.admin && groups.accounting),
    driven: GROUP_ROLES.filter((r) => groups[r]),
  };
  cache = { cfg, at: Date.now() };
  return cfg;
}

/** Highest-privilege role granted by the given group ids, or null. */
export function roleFromGroupIds(cfg: GroupConfig, groupIds: string[]): Role | null {
  const have = new Set(groupIds.map((g) => g.toLowerCase()));
  for (const role of GROUP_ROLES) {
    const g = cfg.groups[role];
    if (g && have.has(g)) return role;
  }
  return null;
}

export interface M365Lookup {
  /** false when Microsoft 365 couldn't answer (not configured / no permission / error) */
  checked: boolean;
  role: Role | null;
  /** the person's Entra object id, when known */
  oid?: string;
  /** group ids they belong to, when read by object id */
  groupIds?: string[];
  how?: "known-id" | "email-lookup" | "member-scan";
  /** why it couldn't be checked */
  problem?: "forbidden" | "notfound" | "error" | "members-hidden";
}

/**
 * Which mapped group(s) is this person in — without them having signed in?
 *   1. If we already know their object id (they've signed in), read their groups by id.
 *   2. Otherwise find them by email (needs the User.Read.All application permission),
 *      then read their groups by id.
 *   3. Last resort: scan group members by email — only works if Microsoft returns
 *      member emails, which group-only permissions don't.
 */
export async function lookupRoleByEmail(email: string, knownOid?: string | null): Promise<M365Lookup> {
  const cfg = await getGroupConfig();
  if (!graphConfigured || cfg.driven.length === 0) return { checked: false, role: null };

  let oid = knownOid ?? undefined;
  let how: M365Lookup["how"] = oid ? "known-id" : undefined;
  let problem: M365Lookup["problem"];

  if (!oid) {
    const found = await findUserOidByEmail(email);
    if (found.status === "found") {
      oid = found.oid;
      how = "email-lookup";
    } else if (found.status === "forbidden") problem = "forbidden";
    else if (found.status === "notfound") problem = "notfound";
    else problem = "error";
  }

  if (oid) {
    const groupIds = await getUserGroupIds(oid);
    if (groupIds) return { checked: true, role: roleFromGroupIds(cfg, groupIds), oid, groupIds, how };
    problem = "error";
  }
  if (problem === "notfound") return { checked: true, role: null, how, problem }; // not in the directory at all

  // Last resort: match by address inside the groups.
  let failed = false;
  let hidden = false;
  for (const role of GROUP_ROLES) {
    const g = cfg.groups[role];
    if (!g) continue;
    const scan = await scanGroupForEmail(g, email);
    if (!scan) {
      failed = true;
      continue;
    }
    if (scan.found) return { checked: true, role, oid: scan.oid, how: "member-scan" };
    if (scan.scanned > 0 && scan.noIdentity === scan.scanned) hidden = true;
  }
  // Members came back as bare ids, or a read failed: we can't say "not in any group".
  return { checked: false, role: null, how: "member-scan", problem: hidden ? "members-hidden" : (problem ?? (failed ? "error" : undefined)) };
}

/**
 * Set a user's role from their Microsoft 365 groups right now. Returns the role
 * they end up with and where it came from. Does nothing when Microsoft 365
 * can't be reached (the role is then applied at their next sign-in as usual).
 */
export async function syncUserRoleFromM365(
  userId: string,
): Promise<{ role: Role; changed: boolean; source: "group" | "none" | "unchecked" | "override" }> {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!u) return { role: "cardholder", changed: false, source: "unchecked" };
  if (BOOTSTRAP.includes(u.email.toLowerCase())) {
    if (u.role !== "admin") await db.update(users).set({ role: "admin" }).where(eq(users.id, userId));
    return { role: "admin", changed: u.role !== "admin", source: "override" };
  }
  // An admin set this role by hand — Microsoft 365 groups don't get a say.
  if (u.roleOverride) return { role: u.role, changed: false, source: "override" };

  const lookup = await lookupRoleByEmail(u.email, u.entraOid);
  if (!lookup.checked) return { role: u.role, changed: false, source: "unchecked" };

  const cfg = await getGroupConfig();
  let role: Role;
  let source: "group" | "none";
  if (lookup.role) {
    role = lookup.role;
    source = "group";
  } else {
    // Not in any mapped group: a group-driven role can't stand without its group.
    role = cfg.syncEnabled && cfg.driven.includes(u.role) ? "cardholder" : u.role;
    source = "none";
  }

  // Never strip the last active admin — a wrong mapping must not lock everyone out of Settings.
  if (u.role === "admin" && role !== "admin") {
    const [others] = await db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.active, true), ne(users.id, userId)));
    if (others.n === 0) role = "admin";
  }

  const patch: Partial<typeof users.$inferInsert> = {};
  if (role !== u.role) patch.role = role;
  if (lookup.oid && !u.entraOid) patch.entraOid = lookup.oid;
  if (Object.keys(patch).length) {
    try {
      await db.update(users).set(patch).where(eq(users.id, userId));
    } catch {
      delete patch.entraOid; // oid already attached to another row — keep the role change only
      if (Object.keys(patch).length) await db.update(users).set(patch).where(eq(users.id, userId));
    }
  }
  return { role, changed: role !== u.role, source };
}

/** Plain-language report of what Microsoft 365 says about an address. */
export async function diagnoseEmail(email: string): Promise<{ role: Role | null; checked: boolean; lines: string[] }> {
  const cfg = await getGroupConfig();
  if (!graphConfigured) return { role: null, checked: false, lines: ["Microsoft 365 isn't configured for the app."] };
  if (cfg.driven.length === 0) return { role: null, checked: false, lines: ["No roles are mapped to groups yet."] };

  const known = await db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) });
  const r = await lookupRoleByEmail(email, known?.entraOid);
  const lines: string[] = [];

  if (r.how === "known-id") lines.push("They've signed in before, so their Microsoft 365 ID is already known — read their groups directly.");
  if (r.how === "email-lookup") lines.push("Found them in Microsoft 365 by email, then read their groups.");

  if (r.groupIds) {
    for (const role of GROUP_ROLES) {
      const g = cfg.groups[role];
      if (!g) continue;
      const name = (await getGroupName(g)) ?? g;
      lines.push(`${role} ← "${name}": ${r.groupIds.map((x) => x.toLowerCase()).includes(g) ? "MEMBER" : "not a member"}`);
    }
  }

  if (r.problem === "forbidden" || r.problem === "members-hidden") {
    lines.push(
      "Microsoft won't let the app look people up by email yet. Group permissions alone only return members as bare IDs. In Entra → App registrations → this app → API permissions → Add a permission → Microsoft Graph → APPLICATION permissions → User.Read.All → then \"Grant admin consent\". (It's read-only. User.ReadBasic.All is NOT an option — it only exists as a delegated permission.) Until then, roles are applied from their groups when they sign in.",
    );
  } else if (r.problem === "notfound") {
    lines.push("No one with that email address exists in your Microsoft 365 directory — check the spelling, or use the address in their Microsoft account.");
  } else if (r.problem === "error") {
    lines.push("Microsoft returned an error — see the connection status at the top of this page.");
  }
  return { role: r.role, checked: r.checked, lines };
}

export interface SyncAllResult {
  checked: number;
  /** couldn't be read from Microsoft 365 this time (their role will update when they next use the app) */
  unchecked: number;
  changed: { email: string; from: Role; to: Role }[];
}

/**
 * Re-read everyone's Microsoft 365 groups and refresh the stored roles. Run after the
 * group mapping changes so the Users list is accurate immediately (access itself is
 * always recalculated per request). Promotions run before demotions, so a new admin
 * exists before an old one is removed.
 */
export async function syncAllRoles(): Promise<SyncAllResult> {
  const all = await db.select({ id: users.id, email: users.email, role: users.role }).from(users);
  const result: SyncAllResult = { checked: 0, unchecked: 0, changed: [] };

  const one = async (u: { id: string; email: string; role: Role }) => {
    try {
      const r = await syncUserRoleFromM365(u.id);
      result.checked++;
      if (r.source === "unchecked") result.unchecked++;
      if (r.changed) result.changed.push({ email: u.email, from: u.role, to: r.role });
    } catch {
      result.unchecked++;
    }
  };

  const others = all.filter((u) => u.role !== "admin");
  for (let i = 0; i < others.length; i += 5) await Promise.all(others.slice(i, i + 5).map(one));
  for (const u of all.filter((x) => x.role === "admin")) await one(u); // demotions last, one at a time
  return result;
}
