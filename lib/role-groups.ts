import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { policySettings, userRole, users } from "@/db/schema";

import { graphConfigured, isEmailInGroup } from "./graph";

export type Role = (typeof userRole.enumValues)[number];

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
  /** false when Microsoft 365 couldn't be asked (not configured / no consent / error) */
  checked: boolean;
  role: Role | null;
  /** the person's Entra object id, when found */
  oid?: string;
}

/**
 * Ask Microsoft 365 which mapped group(s) this email address is in — without
 * needing them to have signed in. Reads each mapped group's members (needs only
 * the GroupMember.Read.All application permission already used for role sync).
 */
export async function lookupRoleByEmail(email: string): Promise<M365Lookup> {
  const cfg = await getGroupConfig();
  if (!graphConfigured || cfg.driven.length === 0) return { checked: false, role: null };

  let failed = false;
  let oid: string | undefined;
  for (const role of GROUP_ROLES) {
    const g = cfg.groups[role];
    if (!g) continue;
    const res = await isEmailInGroup(g, email);
    if (res === null) {
      failed = true;
      continue;
    }
    if (res.found) return { checked: true, role, oid: res.oid };
    oid ??= undefined;
  }
  // A failed group read means we can't claim "not in any group".
  return failed ? { checked: false, role: null, oid } : { checked: true, role: null, oid };
}

/**
 * Set a user's role from their Microsoft 365 groups right now. Returns the role
 * they end up with and where it came from. Does nothing when Microsoft 365
 * can't be reached (the role is then applied at their next sign-in as usual).
 */
export async function syncUserRoleFromM365(
  userId: string,
): Promise<{ role: Role; changed: boolean; source: "group" | "none" | "unchecked" }> {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!u) return { role: "cardholder", changed: false, source: "unchecked" };

  const lookup = await lookupRoleByEmail(u.email);
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
