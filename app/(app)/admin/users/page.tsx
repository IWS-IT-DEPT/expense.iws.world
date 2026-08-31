import { asc } from "drizzle-orm";

import { db } from "@/db";
import { entities, locations, userRole, users } from "@/db/schema";

import { inputClass, Row, SaveButton, Section, Table } from "../_ui";
import { inviteUser, updateUser } from "../actions";

const groupSyncOn = !!(process.env.ENTRA_GROUP_IT && process.env.ENTRA_GROUP_FINANCE);

export default async function AdminUsersPage() {
  const [userRows, entityRows, locationRows] = await Promise.all([
    db.query.users.findMany({ orderBy: [asc(users.email)] }),
    db.query.entities.findMany({ orderBy: [asc(entities.code)] }),
    db.query.locations.findMany({ orderBy: [asc(locations.name)] }),
  ]);

  return (
    <div className="space-y-8">
      <Section title="Add a user">
        <form action={inviteUser} className="flex flex-wrap items-end gap-2">
          <input name="email" type="email" required placeholder="name@iws.world" className={inputClass} />
          <input name="name" placeholder="Full name" className={inputClass} />
          <SaveButton label="Add" />
        </form>
        <p className="text-xs opacity-60">
          Users are also created automatically on first sign-in.
          {groupSyncOn
            ? " Role is synced from Entra groups (IT → admin, IWS-Finance → accounting) on every login — set it here only for approver/cardholder."
            : " Entra group role sync is OFF (ENTRA_GROUP_* not set) — roles set here are authoritative."}
        </p>
      </Section>

      <Section title={`Users (${userRows.length})`}>
        <Table head={["Email", "Name", "Role", "Home entity", "Home location", "Mileage", "Active", ""]}>
          {userRows.map((u) => (
            <Row key={u.id}>
              <td className="py-2 pr-3">{u.email}</td>
              <td className="pr-3">{u.name}</td>
              <td colSpan={6}>
                <form action={updateUser} className="flex flex-wrap items-center gap-2 py-1">
                  <input type="hidden" name="id" value={u.id} />
                  <select name="role" defaultValue={u.role} className={inputClass}>
                    {userRole.enumValues.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <select name="homeEntityId" defaultValue={u.homeEntityId ?? ""} className={inputClass}>
                    <option value="">—</option>
                    {entityRows.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.code}
                      </option>
                    ))}
                  </select>
                  <select name="homeLocationId" defaultValue={u.homeLocationId ?? ""} className={inputClass}>
                    <option value="">—</option>
                    {locationRows.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="mileageEligible" defaultChecked={u.mileageEligible} /> mileage
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="active" defaultChecked={u.active} /> active
                  </label>
                  <SaveButton />
                </form>
              </td>
            </Row>
          ))}
        </Table>
      </Section>
    </div>
  );
}
