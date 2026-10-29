/**
 * Mapbox (server only): driving distance between two points, and turning
 * coordinates into a readable address and back. Needs MAPBOX_ACCESS_TOKEN; without
 * it every call returns null and the UI asks the person to type the miles.
 * Callers never trust these for money without letting the person override.
 */

const TOKEN = process.env.MAPBOX_ACCESS_TOKEN?.trim();
export const mapboxConfigured = !!TOKEN;

const METERS_PER_MILE = 1609.344;

export interface LatLng {
  lat: number;
  lng: number;
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}access_token=${TOKEN}`, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("[mapbox] HTTP", res.status);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn("[mapbox] failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

interface GeoFeature {
  properties?: { full_address?: string; name?: string; place_formatted?: string };
  geometry?: { coordinates?: [number, number] };
}

function featureLabel(f: GeoFeature | undefined): string | null {
  const p = f?.properties;
  if (!p) return null;
  return p.full_address || [p.name, p.place_formatted].filter(Boolean).join(", ") || null;
}

/** Driving miles from a to b, to 0.1, or null if unavailable. */
export async function drivingMiles(a: LatLng, b: LatLng): Promise<number | null> {
  if (!TOKEN) return null;
  const json = (await getJson(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`,
  )) as { routes?: { distance?: number }[] } | null;
  const meters = json?.routes?.[0]?.distance;
  return typeof meters === "number" ? Math.round((meters / METERS_PER_MILE) * 10) / 10 : null;
}

/** "123 Main St, Houston, Texas 77002, United States" for a coordinate, or null. */
export async function reverseGeocode(p: LatLng): Promise<string | null> {
  if (!TOKEN) return null;
  const json = (await getJson(
    `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${p.lng}&latitude=${p.lat}&limit=1`,
  )) as { features?: GeoFeature[] } | null;
  return featureLabel(json?.features?.[0]);
}

/** Address text to coordinates + a tidy label, or null if not found. */
export async function forwardGeocode(
  query: string,
): Promise<(LatLng & { label: string }) | null> {
  if (!TOKEN || !query.trim()) return null;
  const json = (await getJson(
    `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(query)}&country=us&limit=1`,
  )) as { features?: GeoFeature[] } | null;
  const f = json?.features?.[0];
  const c = f?.geometry?.coordinates;
  const label = featureLabel(f);
  return c && label ? { lng: c[0], lat: c[1], label } : null;
}

/** Straight-line distance in metres (for "is this stop at a known site?"). */
export function metersBetween(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
