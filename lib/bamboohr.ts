/**
 * Minimal BambooHR client (read-only for now). Auth is HTTP Basic with the API key
 * as the username and any string as the password. The key never leaves the server:
 * it is only ever sent to api.bamboohr.com in the Authorization header.
 */

const SUBDOMAIN = process.env.BAMBOOHR_SUBDOMAIN?.trim() ?? "";
const API_KEY = process.env.BAMBOOHR_API_KEY?.trim() ?? "";

// The subdomain goes into the URL path — keep it to a plain host label.
export const bambooConfigured = /^[a-z0-9-]+$/i.test(SUBDOMAIN) && API_KEY.length > 0;

export interface BambooPerson {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  displayName: string;
  workEmail: string | null;
  jobTitle: string | null;
  department: string | null;
  location: string | null;
}

export class BambooError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function bambooGet<T>(path: string): Promise<T> {
  if (!bambooConfigured) throw new BambooError("BambooHR isn't configured (BAMBOOHR_SUBDOMAIN / BAMBOOHR_API_KEY).");
  const res = await fetch(`https://api.bamboohr.com/api/gateway.php/${SUBDOMAIN}/v1/${path}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${API_KEY}:x`).toString("base64")}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  // Never put the response body or headers in the message — keep secrets and HR data out of logs.
  if (!res.ok) throw new BambooError(`BambooHR returned ${res.status} for ${path.split("?")[0]}`, res.status);
  return (await res.json()) as T;
}

const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Current employees from the company directory. */
export async function listBambooDirectory(): Promise<BambooPerson[]> {
  const data = await bambooGet<{ employees?: Record<string, unknown>[] }>("employees/directory");
  return (data.employees ?? []).map((e) => ({
    id: String(e.id),
    firstName: s(e.firstName) ?? "",
    lastName: s(e.lastName) ?? "",
    preferredName: s(e.preferredName),
    displayName: s(e.displayName) ?? `${s(e.firstName) ?? ""} ${s(e.lastName) ?? ""}`.trim(),
    workEmail: s(e.workEmail)?.toLowerCase() ?? null,
    jobTitle: s(e.jobTitle),
    department: s(e.department),
    location: s(e.location),
  }));
}

/* ------------------------------------------------------------------ writes -- */

export const bambooReceiptsCategoryId = process.env.BAMBOOHR_RECEIPTS_CATEGORY_ID?.trim() || null;

export interface BambooTableField {
  id: number;
  name: string;
  alias: string;
  type: string;
}

/** Fields of one table (incl. custom ones), by table alias. */
export async function getBambooTableFields(tableAlias: string): Promise<BambooTableField[]> {
  const tables = await bambooGet<{ alias: string; fields: BambooTableField[] }[]>("meta/tables");
  return tables.find((t) => t.alias === tableAlias)?.fields ?? [];
}

/** Alias for a field by its display name, case-insensitive ("Amount", "Report ID"). */
export function fieldAlias(fields: BambooTableField[], name: string): string | null {
  const want = name.trim().toLowerCase();
  return fields.find((f) => f.name.trim().toLowerCase() === want)?.alias ?? null;
}

async function bambooSend(path: string, init: { body: BodyInit; headers?: Record<string, string> }): Promise<Response> {
  if (!bambooConfigured) throw new BambooError("BambooHR isn't configured.");
  return fetch(`https://api.bamboohr.com/api/gateway.php/${SUBDOMAIN}/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${API_KEY}:x`).toString("base64")}`,
      Accept: "application/json",
      ...init.headers,
    },
    body: init.body,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
}

/** Last path segment of a Location header — Bamboo returns the new row/file id there. */
const idFromLocation = (res: Response) => res.headers.get("location")?.split("/").filter(Boolean).pop() ?? null;

/** Add a row to an employee's custom table. Values are keyed by field alias. Returns the new row id. */
export async function addBambooTableRow(
  employeeId: string,
  tableAlias: string,
  values: Record<string, string>,
): Promise<string> {
  const res = await bambooSend(`employees/${encodeURIComponent(employeeId)}/tables/${encodeURIComponent(tableAlias)}`, {
    body: JSON.stringify(values),
    headers: { "Content-Type": "application/json" },
  });
  // Message carries status only; Bamboo's reason text can echo HR data.
  const reason = res.status === 400 ? (res.headers.get("x-bamboohr-error-message") ?? "") : "";
  if (!res.ok) throw new BambooError(`BambooHR rejected the ${tableAlias} row (${res.status}) ${reason}`.trim(), res.status);
  return idFromLocation(res) ?? "created";
}

/** Upload a file to an employee's Documents folder. Returns the new file id. */
export async function uploadBambooEmployeeFile(
  employeeId: string,
  file: { name: string; data: Buffer; contentType: string },
  categoryId: string,
  shareWithEmployee = false,
): Promise<string> {
  const form = new FormData();
  form.set("fileName", file.name);
  form.set("category", categoryId);
  form.set("share", shareWithEmployee ? "yes" : "no");
  form.set("file", new Blob([new Uint8Array(file.data)], { type: file.contentType }), file.name);
  const res = await bambooSend(`employees/${encodeURIComponent(employeeId)}/files`, { body: form });
  if (!res.ok) throw new BambooError(`BambooHR rejected the file upload (${res.status})`, res.status);
  return idFromLocation(res) ?? "uploaded";
}
