import type { BambooPerson } from "./bamboohr";

/**
 * Pairs app users with BambooHR employees by first + last name. Deliberately
 * conservative: a link is proposed only when exactly one user AND exactly one
 * Bamboo employee share the name — duplicates are surfaced, never guessed at —
 * because a wrong link would file one person's receipts in another's HR record.
 */

export interface AppPerson {
  id: string;
  name: string;
  email: string;
  bambooEmployeeId: string | null;
}

export interface NameMatch {
  userId: string;
  userName: string;
  bambooId: string;
  bambooName: string;
}

export interface MatchResult {
  matches: NameMatch[];
  /** A name shared by more than one user, or more than one Bamboo employee. */
  ambiguous: { name: string; users: AppPerson[]; people: BambooPerson[] }[];
  unmatchedUsers: AppPerson[];
  /** Bamboo employees with no app user (most field staff, probably) — not an error. */
  unlinkedPeople: BambooPerson[];
  alreadyLinked: number;
}

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

const clean = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\- ]/g, "")
    .trim();

function tokens(t: string): string[] {
  return clean(t)
    .split(/\s+/)
    .filter((w) => w && !SUFFIXES.has(w));
}

/** "first last" key, ignoring middle names and suffixes. Null if either part is missing. */
export function nameKey(first: string, last: string): string | null {
  const f = tokens(first)[0];
  const l = tokens(last).at(-1);
  return f && l ? `${f} ${l}` : null;
}

/** App users store one display name: "Jane Q. Smith", "Smith, Jane" or "Jane Smith Jr.". */
export function userNameKey(name: string): string | null {
  if (name.includes(",")) {
    const [last, rest] = name.split(",", 2);
    return nameKey(rest, last);
  }
  const t = tokens(name);
  return t.length >= 2 ? nameKey(t[0], t[t.length - 1]) : null;
}

/** A person can be known by legal first name or preferred name. */
function personKeys(p: BambooPerson): string[] {
  const keys = new Set<string>();
  const legal = nameKey(p.firstName, p.lastName);
  if (legal) keys.add(legal);
  if (p.preferredName) {
    const pref = nameKey(p.preferredName, p.lastName);
    if (pref) keys.add(pref);
  }
  return [...keys];
}

export function matchByName(users: AppPerson[], people: BambooPerson[]): MatchResult {
  const linkedIds = new Set(users.map((u) => u.bambooEmployeeId).filter(Boolean) as string[]);
  const candidates = people.filter((p) => !linkedIds.has(p.id));
  const unlinkedUsers = users.filter((u) => !u.bambooEmployeeId);

  const peopleByKey = new Map<string, BambooPerson[]>();
  for (const p of candidates) {
    for (const k of personKeys(p)) peopleByKey.set(k, [...(peopleByKey.get(k) ?? []), p]);
  }
  // Count every user with the key (linked ones too) so a duplicate name is never "unique".
  const usersByKey = new Map<string, AppPerson[]>();
  for (const u of users) {
    const k = userNameKey(u.name);
    if (k) usersByKey.set(k, [...(usersByKey.get(k) ?? []), u]);
  }

  const matches: NameMatch[] = [];
  const ambiguous: MatchResult["ambiguous"] = [];
  const unmatchedUsers: AppPerson[] = [];
  const seenAmbiguous = new Set<string>();
  const matchedPeople = new Set<string>();

  for (const u of unlinkedUsers) {
    const k = userNameKey(u.name);
    const ppl = k ? (peopleByKey.get(k) ?? []) : [];
    if (!k || ppl.length === 0) {
      unmatchedUsers.push(u);
      continue;
    }
    const sameName = usersByKey.get(k) ?? [];
    if (ppl.length === 1 && sameName.length === 1) {
      // A person reachable by two different keys must still only be claimed once.
      if (matchedPeople.has(ppl[0].id)) {
        unmatchedUsers.push(u);
        continue;
      }
      matchedPeople.add(ppl[0].id);
      matches.push({ userId: u.id, userName: u.name, bambooId: ppl[0].id, bambooName: ppl[0].displayName });
    } else if (!seenAmbiguous.has(k)) {
      seenAmbiguous.add(k);
      ambiguous.push({ name: k, users: sameName, people: ppl });
    }
  }

  const ambiguousIds = new Set(ambiguous.flatMap((a) => a.people.map((p) => p.id)));
  return {
    matches,
    ambiguous,
    unmatchedUsers,
    unlinkedPeople: candidates.filter((p) => !matchedPeople.has(p.id) && !ambiguousIds.has(p.id)),
    alreadyLinked: users.length - unlinkedUsers.length,
  };
}

/** True when the strings differ by at most one insert, delete or substitution. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/**
 * Near-misses for a user the strict pass couldn't place — for a person to confirm,
 * never auto-linked. Catches: same last name (incl. one half of a hyphenated name)
 * with a nickname/short first name, and same first name with a different last name
 * (a name change). Best candidates first.
 */
export function suggestFor(user: AppPerson, people: BambooPerson[], limit = 4): BambooPerson[] {
  const t = tokens(user.name.includes(",") ? user.name.split(",").reverse().join(" ") : user.name);
  if (t.length < 2) return [];
  const first = t[0];
  const last = t[t.length - 1];

  const scored = people.map((p) => {
    const firsts = [p.firstName, p.preferredName ?? ""].map((x) => tokens(x)[0]).filter(Boolean) as string[];
    const lastParts = clean(p.lastName).split(/[\s-]+/).filter(Boolean);
    const sameLast = lastParts.includes(last) || clean(p.lastName).replace(/[\s-]/g, "") === last;
    const sameFirst = firsts.includes(first);
    const closeFirst = firsts.some((f) => f.length >= 3 && first.length >= 3 && (f.startsWith(first) || first.startsWith(f) || withinOneEdit(f, first)));
    const score = (sameLast ? 2 : 0) + (sameFirst ? 2 : closeFirst ? 1 : 0);
    return { p, score, ok: (sameLast && (sameFirst || closeFirst)) || (sameFirst && !sameLast) };
  });
  return scored
    .filter((s) => s.ok)
    .sort((a, b) => b.score - a.score || a.p.displayName.localeCompare(b.p.displayName))
    .slice(0, limit)
    .map((s) => s.p);
}
