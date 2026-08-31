/**
 * App-only Microsoft Graph — used to resolve a user's Entra group membership
 * when the sign-in token doesn't carry the `groups` claim (or it overflowed).
 *
 * Requires the app registration to have the **application** permission
 * `GroupMember.Read.All` (or `Directory.Read.All`) with admin consent granted.
 * Reuses the same client id/secret as auth; tenant is parsed from the issuer.
 */

const CLIENT_ID = process.env.AUTH_MICROSOFT_ENTRA_ID_ID;
const CLIENT_SECRET = process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET;
const ISSUER = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ?? "";
const TENANT = ISSUER.match(/login\.microsoftonline\.com\/([^/]+)/)?.[1];

export const graphConfigured = !!(CLIENT_ID && CLIENT_SECRET && TENANT);

let cachedToken: { value: string; expiresAt: number } | null = null;

async function appToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  if (!graphConfigured) throw new Error("Graph not configured");

  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Graph token ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

const groupCache = new Map<string, { ids: string[]; expiresAt: number }>();
const GROUP_TTL_MS = 60_000;

/**
 * All (transitive) group object ids the user belongs to.
 * Returns `null` when the lookup could not be performed (not configured, no
 * consent, Graph error) so callers don't mistake a failure for "no groups".
 */
export async function getUserGroupIds(userOid: string): Promise<string[] | null> {
  if (!graphConfigured || !userOid) return null;

  const cached = groupCache.get(userOid);
  if (cached && cached.expiresAt > Date.now()) return cached.ids;

  try {
    const token = await appToken();
    const ids: string[] = [];
    let url:
      | string
      | null = `https://graph.microsoft.com/v1.0/users/${userOid}/transitiveMemberOf/microsoft.graph.group?$select=id&$top=999`;

    for (let i = 0; url && i < 10; i++) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        console.warn(`[graph] memberOf ${res.status}: ${await res.text()}`);
        return null;
      }
      const json = (await res.json()) as {
        value: { id: string }[];
        "@odata.nextLink"?: string;
      };
      for (const g of json.value) ids.push(g.id);
      url = json["@odata.nextLink"] ?? null;
    }
    groupCache.set(userOid, { ids, expiresAt: Date.now() + GROUP_TTL_MS });
    return ids;
  } catch (err) {
    console.warn("[graph] getUserGroupIds failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
