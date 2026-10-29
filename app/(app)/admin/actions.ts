"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  cards,
  categories,
  dimensionMappings,
  entities,
  entityQboSettings,
  jobs,
  locations,
  mileageRates,
  policySettings,
  qboConnections,
  qboDimensions,
  units,
  userRole,
  users,
} from "@/db/schema";
import { cardBlockers, dimensionBlockers, entityBlockers } from "@/lib/admin-usage";
import { requireRole } from "@/lib/current-user";
import { getUserGroupIds } from "@/lib/graph";
import {
  GROUP_ROLES,
  getGroupConfig,
  invalidateGroupConfig,
  diagnoseEmail,
  settingKey,
  syncAllRoles,
  syncUserRoleFromM365,
} from "@/lib/role-groups";
import { sendEmail } from "@/lib/email";
import { renderEmail } from "@/lib/email-template";
import { MAIL_GROUPS, parseAddresses, resolveRecipients, type MailGroup } from "@/lib/mail-settings";
import { forwardGeocode, mapboxConfigured } from "@/lib/mapbox";
import { notifyWelcome } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string) => str(fd, k) || null;
const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
const int = (fd: FormData, k: string) => {
  const n = Number.parseInt(str(fd, k), 10);
  return Number.isNaN(n) ? null : n;
};

async function done(path: string) {
  revalidatePath(path);
  revalidatePath("/admin");
}

/* -------------------------------------------------------------------- users */

export async function updateUser(fd: FormData) {
  const me = await requireRole("admin");
  const id = str(fd, "id");
  if (!id) return;
  const existing = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!existing) return;

  const cfg = await getGroupConfig();
  const allowed = userRole.enumValues as readonly string[];
  const choice = str(fd, "role"); // "auto" (follow Microsoft 365 groups) or a role
  const auto = choice === "auto" || !allowed.includes(choice);

  let role = (auto ? existing.role : choice) as (typeof userRole.enumValues)[number];
  // A role set by hand sticks (groups can't change it); automatic follows the groups.
  let roleOverride = auto ? false : cfg.driven.includes(role);
  let active = bool(fd, "active");

  // Admin comes ONLY from membership of the Microsoft 365 group mapped to Admin:
  // it can't be granted here, and an existing admin's role can't be changed here.
  if (role === "admin" || existing.role === "admin") {
    role = existing.role;
    roleOverride = false;
  }

  if (me.id === existing.id) {
    // Never let an admin lock themselves (or everyone) out.
    role = existing.role;
    roleOverride = existing.roleOverride;
    active = true;
  }

  // Risky changes need the person's email typed (the form asks; enforced here too).
  const deactivating = existing.active && !active;
  if (deactivating && str(fd, "confirmEmail").toLowerCase() !== existing.email) return;

  const name = str(fd, "name");
  await db
    .update(users)
    .set({
      ...(name ? { name } : {}),
      role,
      roleOverride,
      homeEntityId: opt(fd, "homeEntityId"),
      homeLocationId: opt(fd, "homeLocationId"),
      mileageEligible: bool(fd, "mileageEligible"),
      jobExempt: bool(fd, "jobExempt"),
      active,
    })
    .where(eq(users.id, id));

  // Switched back to Automatic: apply what their groups say right now.
  if (existing.roleOverride && !roleOverride) await syncUserRoleFromM365(id);

  revalidatePath(`/admin/users/${id}`);
  await done("/admin/users");
}

export async function inviteUser(fd: FormData) {
  await requireRole("admin");
  const email = str(fd, "email").toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) redirect(`/admin/users/${existing.id}`);

  // "auto" = follow Microsoft 365 groups (Cardholder if none). Picking a role by hand pins it:
  // that's how you make an owner an admin even though they're not in the IT group.
  const cfg = await getGroupConfig();
  const choice = str(fd, "role");
  // Admin can't be assigned in the app (only via its Microsoft 365 group), so it's never an explicit choice.
  const explicit =
    choice !== "admin" && (userRole.enumValues as readonly string[]).includes(choice)
      ? (choice as (typeof userRole.enumValues)[number])
      : null;
  const role = explicit ?? "cardholder";
  const roleOverride = !!explicit && cfg.driven.includes(explicit);

  const [created] = await db
    .insert(users)
    .values({ email, name: opt(fd, "name") ?? email, role, roleOverride })
    .returning({ id: users.id });

  // Group-driven roles are settled from Microsoft 365 BEFORE the email says what they are
  // (a manual override skips this — it's already final).
  const synced = await syncUserRoleFromM365(created.id);
  const welcomed = bool(fd, "sendWelcome") ? await notifyWelcome(created.id) : false;
  await done("/admin/users");
  const qs = new URLSearchParams({ rolesrc: synced.source, role: synced.role });
  if (welcomed) qs.set("welcome", "sent");
  redirect(`/admin/users/${created.id}?${qs.toString()}`);
}

/** Re-send the setup email (they lost it, or it went to junk). */
export async function resendWelcome(fd: FormData) {
  await requireRole("admin");
  const id = str(fd, "id");
  if (!id) return;
  // Re-check Microsoft 365 first so the email describes their current role.
  const synced = await syncUserRoleFromM365(id);
  const sent = await notifyWelcome(id);
  const qs = new URLSearchParams({ rolesrc: synced.source, role: synced.role });
  if (sent) qs.set("welcome", "sent");
  redirect(`/admin/users/${id}?${qs.toString()}`);
}

/** Re-read someone's Microsoft 365 groups and update their role now. */
export async function recheckRole(fd: FormData) {
  await requireRole("admin");
  const id = str(fd, "id");
  if (!id) return;
  const synced = await syncUserRoleFromM365(id);
  revalidatePath(`/admin/users/${id}`);
  redirect(`/admin/users/${id}?${new URLSearchParams({ rolesrc: synced.source, role: synced.role }).toString()}`);
}

const GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Save which Microsoft 365 group grants each role. Blank = fall back to the server environment. */
export async function saveRoleGroups(fd: FormData) {
  const user = await requireRole("admin");
  const before = await getGroupConfig();
  const rows: { role: (typeof GROUP_ROLES)[number]; value: string }[] = [];
  for (const role of GROUP_ROLES) {
    const v = str(fd, role);
    if (v && !GUID_RE.test(v)) {
      redirect(`/admin/roles?error=${encodeURIComponent(`"${v}" isn't a group ID. It looks like 12345678-abcd-…; find it in Entra → Groups → Object ID.`)}`);
    }
    rows.push({ role, value: v.toLowerCase() });
  }
  const seen = new Map<string, string>();
  for (const r of rows) {
    if (!r.value) continue;
    if (seen.has(r.value)) {
      redirect(`/admin/roles?error=${encodeURIComponent(`The same group can't grant both ${seen.get(r.value)} and ${r.role}.`)}`);
    }
    seen.set(r.value, r.role);
  }
  // Changing which group grants Admin? Make sure YOU would still be an admin afterwards —
  // otherwise you'd demote yourself the moment this saves and couldn't undo it.
  const newAdminGroup = rows.find((r) => r.role === "admin")?.value;
  const currentAdminGroup = before.groups.admin;
  if (newAdminGroup && newAdminGroup !== currentAdminGroup) {
    const mine = user.entraOid ? await getUserGroupIds(user.entraOid) : null;
    if (!mine) {
      redirect(`/admin/roles?error=${encodeURIComponent("Couldn't confirm your own membership of the new admin group (Microsoft 365 didn't answer). Nothing was changed — try again in a minute.")}`);
    }
    if (!mine.map((g) => g.toLowerCase()).includes(newAdminGroup)) {
      redirect(`/admin/roles?error=${encodeURIComponent("You're not a member of that group yet, so saving would remove your own admin access. Add yourself to the group in Microsoft 365 first (it can take a few minutes to show up), then save again. Nothing was changed.")}`);
    }
  }
  for (const r of rows) {
    await db
      .insert(policySettings)
      .values({ key: settingKey(r.role), value: r.value, description: `Microsoft 365 group for the ${r.role} role`, updatedById: user.id })
      .onConflictDoUpdate({ target: policySettings.key, set: { value: r.value, updatedAt: new Date(), updatedById: user.id } });
  }
  invalidateGroupConfig();
  // Refresh everyone's stored role now, so the Users list matches the new mapping straight away.
  let tail = "";
  try {
    const r = await syncAllRoles();
    tail = `&checked=${r.checked}&changed=${r.changed.length}&unchecked=${r.unchecked}`;
  } catch {
    // access is recalculated per request anyway; the Re-check button can be used again
  }
  revalidatePath("/admin/roles");
  revalidatePath("/admin/users");
  redirect(`/admin/roles?saved=1${tail}`);
}

/** Re-read everyone's Microsoft 365 groups and update their stored roles. */
export async function recheckAllRoles() {
  await requireRole("admin");
  const r = await syncAllRoles();
  revalidatePath("/admin/users");
  revalidatePath("/admin/roles");
  redirect(`/admin/roles?synced=1&checked=${r.checked}&changed=${r.changed.length}&unchecked=${r.unchecked}&who=${encodeURIComponent(r.changed.map((c) => `${c.email}: ${c.from}→${c.to}`).join("; ").slice(0, 600))}`);
}

/** "Which role would this person get?" — reads Microsoft 365 only, changes nothing. */
export async function checkEmailRole(
  fd: FormData,
): Promise<{ ok: true; message: string; lines: string[] } | { ok: false; error: string; lines: string[] }> {
  await requireRole("admin");
  const email = str(fd, "email").toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Enter a full email address.", lines: [] };
  const r = await diagnoseEmail(email);
  if (!r.checked) {
    return { ok: false, error: "Couldn't read Microsoft 365 (see the connection status above).", lines: r.lines };
  }
  return {
    ok: true,
    message: r.role
      ? `${email} is in the group for ${r.role} — they'll get the ${r.role} role.`
      : `${email} isn't in any mapped group — they'll be a cardholder (or the role you choose, if it isn't group-driven).`,
    lines: r.lines,
  };
}


/* ----------------------------------------------------------------- entities */

/** Short, uppercase, label-safe: letters, digits, dash, underscore. */
const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{0,11}$/;

type CostingMode = "none" | "unit" | "job" | "unit_or_job";

export async function upsertEntity(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = opt(fd, "id");
  const common = {
    name: str(fd, "name"),
    legalName: opt(fd, "legalName"),
    costingMode: str(fd, "costingMode") as CostingMode,
    brandColor: opt(fd, "brandColor"),
    active: bool(fd, "active"),
  };
  if (id) {
    // Everything keys off the entity's id, so the code is just a label and safe to edit.
    const code = str(fd, "code").toUpperCase();
    const current = await db.query.entities.findFirst({ where: eq(entities.id, id) });
    if (!current) return;
    if (code && code !== current.code) {
      // Renaming is a deliberate act: the form makes you type the current code.
      if (str(fd, "confirmCodeChange").toUpperCase() !== current.code) return;
      if (!CODE_RE.test(code)) return;
      const clash = await db.query.entities.findFirst({ where: eq(entities.code, code) });
      if (clash && clash.id !== id) return;
      await db.update(entities).set({ ...common, code }).where(eq(entities.id, id));
    } else {
      await db.update(entities).set(common).where(eq(entities.id, id));
    }
  } else {
    const code = str(fd, "code").toUpperCase();
    if (!CODE_RE.test(code) || !common.name) return;
    const clash = await db.query.entities.findFirst({ where: eq(entities.code, code) });
    if (clash) return;
    const [created] = await db.insert(entities).values({ ...common, code }).returning({ id: entities.id });
    await done("/admin/entities");
    redirect(`/admin/entities/${created.id}`);
  }
  await done("/admin/entities");
  revalidatePath(`/admin/entities/${id}`);
}

export async function deleteEntity(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = str(fd, "id");
  if (!id) return;
  const entity = await db.query.entities.findFirst({ where: eq(entities.id, id) });
  if (!entity) return;
  // Typed confirmation, enforced here as well as in the form.
  if (str(fd, "confirm") !== `delete ${entity.code}`) return;
  // Re-checked here, not just on the page: history means retire, don't delete.
  if ((await entityBlockers(id)).length > 0) return;

  // QuickBooks setup belongs to the entity and goes with it.
  await db.delete(dimensionMappings).where(eq(dimensionMappings.entityId, id));
  await db.delete(qboDimensions).where(eq(qboDimensions.entityId, id));
  await db.delete(qboConnections).where(eq(qboConnections.entityId, id));
  await db.delete(entityQboSettings).where(eq(entityQboSettings.entityId, id));
  await db.delete(entities).where(eq(entities.id, id));
  await done("/admin/entities");
  redirect("/admin/entities");
}

/* --------------------------------------------------------- shared helpers */

/** Back to a settings page with a message shown at the top. */
function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

/** Codes/numbers shown on badges and reports: letters, digits, space and - _ . / (max 24). */
const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9 _./-]{0,23}$/;

/** Renaming something that appears everywhere is deliberate: the current value must be typed. */
function needRenameConfirm(fd: FormData, path: string, current: string, next: string) {
  if (next === current) return;
  if (str(fd, "confirmChange").toLowerCase() !== current.toLowerCase()) {
    fail(path, `Type the current value (${current}) to confirm changing it.`);
  }
}

/** Remove a dimension's QuickBooks mappings along with the dimension itself. */
async function dropMappings(localType: string, id: string) {
  await db
    .delete(dimensionMappings)
    .where(and(eq(dimensionMappings.localType, localType), eq(dimensionMappings.localId, id)));
}

/* ---------------------------------------------------------------- locations */

export async function upsertLocation(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = opt(fd, "id");
  const back = id ? `/admin/locations/${id}` : "/admin/locations/new";
  const values = {
    code: str(fd, "code").toUpperCase(),
    name: str(fd, "name"),
    homeEntityId: opt(fd, "homeEntityId"),
    active: bool(fd, "active"),
    address: opt(fd, "address"),
  };
  if (!values.name) fail(back, "Name is required.");
  const current = id ? await db.query.locations.findFirst({ where: eq(locations.id, id) }) : null;
  if (id && !current) return;
  if (!current || values.code !== current.code) {
    if (!LABEL_RE.test(values.code)) fail(back, "Code: letters, digits, space, - _ . / (max 24).");
    const clash = await db.query.locations.findFirst({ where: eq(locations.code, values.code) });
    if (clash && clash.id !== id) fail(back, `The code ${values.code} is already used by ${clash.name}.`);
  }
  // Find the address on the map so mileage stops near it are named after the site.
  let point: { latitude: string | null; longitude: string | null } = { latitude: null, longitude: null };
  if (values.address && values.address === current?.address && current.latitude) {
    point = { latitude: current.latitude, longitude: current.longitude };
  } else if (values.address) {
    const hit = await forwardGeocode(values.address);
    if (!hit && mapboxConfigured) fail(back, "Couldn't find that address on the map. Add the city and state.");
    if (hit) point = { latitude: hit.lat.toFixed(6), longitude: hit.lng.toFixed(6) };
  }
  const row = { ...values, ...point };
  if (current) {
    needRenameConfirm(fd, back, current.code, values.code);
    await db.update(locations).set(row).where(eq(locations.id, current.id));
    await done("/admin/locations");
    revalidatePath(back);
    return;
  }
  const [created] = await db.insert(locations).values(row).returning({ id: locations.id });
  await done("/admin/locations");
  redirect(`/admin/locations/${created.id}`);
}

export async function deleteLocation(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = str(fd, "id");
  const row = id ? await db.query.locations.findFirst({ where: eq(locations.id, id) }) : null;
  if (!row || str(fd, "confirm") !== `delete ${row.code}`) return;
  if ((await dimensionBlockers("location", id)).length > 0) return;
  await dropMappings("location", id);
  await db.delete(locations).where(eq(locations.id, id));
  await done("/admin/locations");
  redirect("/admin/locations");
}

/* -------------------------------------------------------------------- units */

const UNIT_TYPES = ["truck", "tractor", "trailer", "equipment", "other"] as const;

export async function upsertUnit(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = opt(fd, "id");
  const back = id ? `/admin/units/${id}` : "/admin/units/new";
  const type = str(fd, "type");
  const values = {
    unitNumber: str(fd, "unitNumber"),
    description: opt(fd, "description"),
    type: (UNIT_TYPES as readonly string[]).includes(type) ? (type as (typeof UNIT_TYPES)[number]) : "other",
    active: bool(fd, "active"),
  };
  if (!values.unitNumber) fail(back, "Unit number is required.");
  const current = id ? await db.query.units.findFirst({ where: eq(units.id, id) }) : null;
  if (id && !current) return;
  // A unit belongs to one entity for life: its QuickBooks mappings are per entity.
  const entityId = current ? current.entityId : str(fd, "entityId");
  if (!entityId) fail(back, "Pick the entity this unit belongs to.");
  if (!current || values.unitNumber !== current.unitNumber) {
    const clash = await db.query.units.findFirst({
      where: and(eq(units.entityId, entityId), eq(units.unitNumber, values.unitNumber)),
    });
    if (clash && clash.id !== id) fail(back, `That entity already has a unit "${values.unitNumber}".`);
  }
  if (current) {
    needRenameConfirm(fd, back, current.unitNumber, values.unitNumber);
    await db.update(units).set(values).where(eq(units.id, current.id));
    await done("/admin/units");
    revalidatePath(back);
    return;
  }
  const [created] = await db.insert(units).values({ ...values, entityId }).returning({ id: units.id });
  await done("/admin/units");
  redirect(`/admin/units/${created.id}`);
}

export async function deleteUnit(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = str(fd, "id");
  const row = id ? await db.query.units.findFirst({ where: eq(units.id, id) }) : null;
  if (!row || str(fd, "confirm") !== `delete ${row.unitNumber}`) return;
  if ((await dimensionBlockers("unit", id)).length > 0) return;
  await dropMappings("unit", id);
  await db.delete(units).where(eq(units.id, id));
  await done("/admin/units");
  redirect("/admin/units");
}

/* --------------------------------------------------------------------- jobs */

export async function upsertJob(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = opt(fd, "id");
  const back = id ? `/admin/jobs/${id}` : "/admin/jobs/new";
  const values = {
    jobNumber: str(fd, "jobNumber"),
    name: opt(fd, "name"),
    customerName: opt(fd, "customerName"),
    status: str(fd, "status") === "closed" ? ("closed" as const) : ("open" as const),
    active: bool(fd, "active"),
  };
  if (!values.jobNumber) fail(back, "Job number is required.");
  const current = id ? await db.query.jobs.findFirst({ where: eq(jobs.id, id) }) : null;
  if (id && !current) return;
  const entityId = current ? current.entityId : str(fd, "entityId");
  if (!entityId) fail(back, "Pick the entity this job belongs to.");
  if (!current || values.jobNumber !== current.jobNumber) {
    const clash = await db.query.jobs.findFirst({
      where: and(eq(jobs.entityId, entityId), eq(jobs.jobNumber, values.jobNumber)),
    });
    if (clash && clash.id !== id) fail(back, `That entity already has a job "${values.jobNumber}".`);
  }
  if (current) {
    needRenameConfirm(fd, back, current.jobNumber, values.jobNumber);
    await db.update(jobs).set(values).where(eq(jobs.id, current.id));
    await done("/admin/jobs");
    revalidatePath(back);
    return;
  }
  const [created] = await db.insert(jobs).values({ ...values, entityId }).returning({ id: jobs.id });
  await done("/admin/jobs");
  redirect(`/admin/jobs/${created.id}`);
}

export async function deleteJob(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = str(fd, "id");
  const row = id ? await db.query.jobs.findFirst({ where: eq(jobs.id, id) }) : null;
  if (!row || str(fd, "confirm") !== `delete ${row.jobNumber}`) return;
  if ((await dimensionBlockers("job", id)).length > 0) return;
  await dropMappings("job", id);
  await db.delete(jobs).where(eq(jobs.id, id));
  await done("/admin/jobs");
  redirect("/admin/jobs");
}

/* --------------------------------------------------------------- categories */

export async function upsertCategory(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = opt(fd, "id");
  const back = id ? `/admin/categories/${id}` : "/admin/categories/new";
  const values = {
    code: str(fd, "code").toUpperCase(),
    name: str(fd, "name"),
    description: opt(fd, "description"),
    requiresJobOrUnit: bool(fd, "requiresJobOrUnit"),
    receiptAlwaysRequired: bool(fd, "receiptAlwaysRequired"),
    sortOrder: int(fd, "sortOrder") ?? 100,
    active: bool(fd, "active"),
  };
  if (!values.name) fail(back, "Name is required.");
  const current = id ? await db.query.categories.findFirst({ where: eq(categories.id, id) }) : null;
  if (id && !current) return;
  if (!current || values.code !== current.code) {
    if (!LABEL_RE.test(values.code)) fail(back, "Code: letters, digits, space, - _ . / (max 24).");
    const clash = await db.query.categories.findFirst({ where: eq(categories.code, values.code) });
    if (clash && clash.id !== id) fail(back, `The code ${values.code} is already used by ${clash.name}.`);
  }
  if (current) {
    needRenameConfirm(fd, back, current.code, values.code);
    await db.update(categories).set(values).where(eq(categories.id, current.id));
    await done("/admin/categories");
    revalidatePath(back);
    return;
  }
  const [created] = await db.insert(categories).values(values).returning({ id: categories.id });
  await done("/admin/categories");
  redirect(`/admin/categories/${created.id}`);
}

export async function deleteCategory(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = str(fd, "id");
  const row = id ? await db.query.categories.findFirst({ where: eq(categories.id, id) }) : null;
  if (!row || str(fd, "confirm") !== `delete ${row.code}`) return;
  if ((await dimensionBlockers("category", id)).length > 0) return;
  await dropMappings("category", id);
  await db.delete(categories).where(eq(categories.id, id));
  await done("/admin/categories");
  redirect("/admin/categories");
}

/* -------------------------------------------------------------------- cards */

const CARD_NETWORKS = ["visa", "mastercard", "amex", "discover", "other"] as const;
const LAST4_RE = /^[0-9]{4}$/;

function cardError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

/** Admin/finance add or edit of a card (typo fix / reassign / deactivate). */
export async function upsertCard(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = opt(fd, "id");
  const net = str(fd, "network");
  const values = {
    userId: opt(fd, "userId"),
    network: CARD_NETWORKS.includes(net as (typeof CARD_NETWORKS)[number])
      ? (net as (typeof CARD_NETWORKS)[number])
      : null,
    last4: str(fd, "last4"),
    displayName: opt(fd, "displayName"),
    active: bool(fd, "active"),
  };
  const back = id ? `/admin/cards/${id}` : "/admin/cards/new";
  if (!LAST4_RE.test(values.last4)) cardError(back, "The last 4 must be exactly 4 digits.");

  const clash = async () => {
    if (!values.userId) return false;
    const other = await db.query.cards.findFirst({
      where: and(eq(cards.userId, values.userId), eq(cards.last4, values.last4)),
    });
    return !!other && other.id !== id;
  };

  if (id) {
    const current = await db.query.cards.findFirst({ where: eq(cards.id, id) });
    if (!current) return;
    const renumbering = values.last4 !== current.last4;
    const deactivating = current.active && !values.active;
    if ((renumbering || deactivating) && str(fd, "confirmLast4") !== current.last4) {
      cardError(back, `Type the current last 4 (${current.last4}) to confirm that change.`);
    }
    if (await clash()) cardError(back, "That person already has a card ending in those digits.");
    await db.update(cards).set(values).where(eq(cards.id, id));
    await done("/admin/cards");
    revalidatePath(back);
    return;
  }
  if (await clash()) cardError(back, "That person already has a card ending in those digits.");
  const [created] = await db.insert(cards).values(values).returning({ id: cards.id });
  await done("/admin/cards");
  redirect(`/admin/cards/${created.id}`);
}

export async function deleteCard(fd: FormData) {
  await requireRole("admin", "accounting");
  const id = str(fd, "id");
  if (!id) return;
  const card = await db.query.cards.findFirst({ where: eq(cards.id, id) });
  if (!card) return;
  // Typed confirmation, enforced here as well as in the form.
  if (str(fd, "confirm") !== `delete ${card.last4}`) return;
  // Re-checked here, not just on the page: history means turn it off, don't delete.
  if ((await cardBlockers(id)).length > 0) return;
  await db
    .delete(dimensionMappings)
    .where(and(eq(dimensionMappings.localType, "card"), eq(dimensionMappings.localId, id)));
  await db.delete(cards).where(eq(cards.id, id));
  await done("/admin/cards");
  redirect("/admin/cards");
}

/* ------------------------------------------------------------------ mileage */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function upsertMileageRate(fd: FormData) {
  await requireRole("admin", "payroll");
  const id = opt(fd, "id");
  const back = id ? `/admin/mileage/${id}` : "/admin/mileage/new";
  const rate = Number(str(fd, "ratePerMile"));
  const values = {
    effectiveDate: str(fd, "effectiveDate"),
    ratePerMile: Number.isFinite(rate) && rate > 0 && rate < 10 ? rate.toFixed(4) : "",
    source: str(fd, "source") || "IRS",
    note: opt(fd, "note"),
  };
  if (!DATE_RE.test(values.effectiveDate)) fail(back, "Pick the date the rate takes effect.");
  if (!values.ratePerMile) fail(back, "Enter the rate in dollars per mile, e.g. 0.7000.");
  const clash = await db.query.mileageRates.findFirst({ where: eq(mileageRates.effectiveDate, values.effectiveDate) });
  if (clash && clash.id !== id) fail(back, `A rate already starts on ${values.effectiveDate}.`);

  if (id) {
    const current = await db.query.mileageRates.findFirst({ where: eq(mileageRates.id, id) });
    if (!current) return;
    const moved = values.effectiveDate !== current.effectiveDate || Number(values.ratePerMile) !== Number(current.ratePerMile);
    if (moved && str(fd, "confirmChange").toLowerCase() !== "change rate") {
      fail(back, 'Type "change rate" to confirm changing the date or amount.');
    }
    await db.update(mileageRates).set(values).where(eq(mileageRates.id, id));
    await done("/admin/mileage");
    revalidatePath(back);
    return;
  }
  const [created] = await db.insert(mileageRates).values(values).returning({ id: mileageRates.id });
  await done("/admin/mileage");
  redirect(`/admin/mileage/${created.id}`);
}

/** Remove a rate — only when no mileage line references it (kept for the audit). */
export async function deleteMileageRate(fd: FormData) {
  await requireRole("admin", "payroll");
  const id = str(fd, "id");
  const row = id ? await db.query.mileageRates.findFirst({ where: eq(mileageRates.id, id) }) : null;
  if (!row || str(fd, "confirm") !== `delete ${row.effectiveDate}`) return;
  if ((await dimensionBlockers("mileage", id)).length > 0) return;
  await db.delete(mileageRates).where(eq(mileageRates.id, id));
  await done("/admin/mileage");
  redirect("/admin/mileage");
}

/* ------------------------------------------------------------------- policy */

export async function updatePolicy(fd: FormData) {
  const user = await requireRole("admin");
  const dollars = int(fd, "receipt_threshold");
  if (dollars == null || dollars < 0) return;
  await db
    .insert(policySettings)
    .values({
      key: "receipt_threshold_cents",
      value: dollars * 100,
      description: "Receipt required at/above this amount",
      updatedById: user.id,
    })
    .onConflictDoUpdate({
      target: policySettings.key,
      set: { value: dollars * 100, updatedAt: new Date(), updatedById: user.id },
    });
  await done("/admin/policy");
}

/* ------------------------------------------------------------- QuickBooks -- */

const QBO_ID_RE = /^[A-Za-z0-9_.:-]{1,40}$/;

function qboId(fd: FormData, k: string): string | null {
  const v = str(fd, k);
  return QBO_ID_RE.test(v) ? v : null;
}

/** Per-entity QuickBooks company settings (no secrets). */
export async function saveQboSettings(fd: FormData) {
  const user = await requireRole("admin", "accounting");
  const entityId = str(fd, "entityId");
  if (!entityId) return;
  const realm = str(fd, "realmId");
  const pick = <T extends string>(k: string, allowed: readonly T[], fallback: T): T =>
    (allowed as readonly string[]).includes(str(fd, k)) ? (str(fd, k) as T) : fallback;

  const values = {
    realmId: /^\d{5,20}$/.test(realm) ? realm : null,
    companyName: opt(fd, "companyName"),
    environment: pick("environment", ["sandbox", "production"], "sandbox"),
    enabled: bool(fd, "enabled"),
    exportTrigger: pick("exportTrigger", ["manual", "on_approval"], "manual"),
    usesClasses: bool(fd, "usesClasses"),
    usesLocations: bool(fd, "usesLocations"),
    jobsAs: pick("jobsAs", ["project", "customer"], "project"),
    cardAccountQboId: qboId(fd, "cardAccountQboId"),
    cardAccountName: opt(fd, "cardAccountName"),
    apAccountQboId: qboId(fd, "apAccountQboId"),
    apAccountName: opt(fd, "apAccountName"),
    defaultVendorQboId: qboId(fd, "defaultVendorQboId"),
    defaultVendorName: opt(fd, "defaultVendorName"),
    notes: opt(fd, "notes"),
    updatedAt: new Date(),
    updatedById: user.id,
  };
  // Never leave an entity "enabled" without a company file to export to.
  if (!values.realmId) values.enabled = false;

  await db
    .insert(entityQboSettings)
    .values({ entityId, ...values })
    .onConflictDoUpdate({ target: entityQboSettings.entityId, set: values });
  revalidatePath(`/admin/entities/${entityId}/quickbooks`);
  revalidatePath("/admin/entities");
}

const MAP_TYPES = ["location", "unit", "job", "category", "card", "user"] as const;
const MAP_DIM = {
  location: "location",
  unit: "class",
  job: "customer",
  category: "account",
  card: "account",
  user: "vendor",
} as const;

/**
 * Save this entity's QBO id mappings. Fields are `map:<localType>:<localId>`;
 * a blank value clears the mapping. Only rows that changed are written.
 */
export async function saveQboMappings(fd: FormData) {
  await requireRole("admin", "accounting");
  const entityId = str(fd, "entityId");
  if (!entityId) return;

  const wanted = new Map<string, string>(); // "type:id" -> qbo id ("" = clear)
  for (const [k, v] of fd.entries()) {
    const m = /^map:([a-z]+):([0-9a-f-]{36})$/.exec(k);
    if (!m || !(MAP_TYPES as readonly string[]).includes(m[1])) continue;
    const val = String(v).trim();
    if (val && !QBO_ID_RE.test(val)) continue;
    wanted.set(`${m[1]}:${m[2]}`, val);
  }

  const existing = await db.query.dimensionMappings.findMany({
    where: eq(dimensionMappings.entityId, entityId),
  });
  const have = new Map(existing.map((e) => [`${e.localType}:${e.localId}`, e]));

  const toClear: string[] = [];
  for (const [key, val] of wanted) {
    const cur = have.get(key);
    const [type, localId] = key.split(":") as [(typeof MAP_TYPES)[number], string];
    if (!val) {
      if (cur) toClear.push(cur.id);
    } else if (!cur || cur.qboId !== val) {
      await db
        .insert(dimensionMappings)
        .values({ entityId, localType: type, localId, qboDimType: MAP_DIM[type], qboId: val })
        .onConflictDoUpdate({
          target: [dimensionMappings.entityId, dimensionMappings.localType, dimensionMappings.localId],
          set: { qboId: val, updatedAt: new Date() },
        });
    }
  }
  if (toClear.length) await db.delete(dimensionMappings).where(inArray(dimensionMappings.id, toClear));
  revalidatePath(`/admin/entities/${entityId}/quickbooks`);
}

/* ----------------------------------------------------------------- email -- */

/** Save who gets the internal alert emails. Blank = fall back to env/default. */
export async function saveMailRecipients(fd: FormData) {
  const user = await requireRole("admin");

  const rows: { key: string; description: string; value: string }[] = [];
  for (const g of Object.keys(MAIL_GROUPS) as MailGroup[]) {
    const text = str(fd, g);
    const { ok, bad } = parseAddresses(text);
    if (bad.length) {
      redirect(`/admin/email?error=${encodeURIComponent(`"${bad[0]}" isn't a valid email address (${MAIL_GROUPS[g].label}).`)}`);
    }
    if (ok.length > 10) redirect(`/admin/email?error=${encodeURIComponent("At most 10 addresses per group.")}`);
    rows.push({
      key: MAIL_GROUPS[g].key,
      description: `Email recipients: ${MAIL_GROUPS[g].label}`,
      value: ok.join(", "),
    });
  }

  for (const r of rows) {
    await db
      .insert(policySettings)
      .values({ key: r.key, value: r.value, description: r.description, updatedById: user.id })
      .onConflictDoUpdate({
        target: policySettings.key,
        set: { value: r.value, updatedAt: new Date(), updatedById: user.id },
      });
  }
  revalidatePath("/admin/email");
  redirect("/admin/email?saved=1");
}

/** Send a labelled test message to a recipient group's current addresses. */
export async function sendTestMail(fd: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireRole("admin");
  const group = str(fd, "group") as MailGroup;
  if (!(group in MAIL_GROUPS)) return { ok: false, error: "Unknown group." };
  if (!(await rateLimit(`mail-test:${user.id}`, 6, 10 * 60))) {
    return { ok: false, error: "Too many tests — wait a few minutes." };
  }

  const { addresses } = await resolveRecipients(group);
  const { html, text } = renderEmail({
    accent: "blue",
    heading: "Test message from IWS Expense",
    paragraphs: [
      `This is a test sent by ${user.name} from Settings → Email.`,
      `Your address is set up to receive the "${MAIL_GROUPS[group].label}" alerts from IWS Expense — for example when someone submits an expense for review. No action is needed.`,
    ],
  });
  try {
    await sendEmail({ to: addresses, subject: "Test message — IWS Expense", text, html });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Send failed." };
  }
}
