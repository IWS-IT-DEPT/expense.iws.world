/**
 * Group + entity brand tokens. Colours are sampled from the company logos;
 * see `public/brand/README.md` for the logo files.
 */

export const IWS_BRAND = {
  green: "#2F9E5A",
  blue: "#2731A8",
  ink: "#3A2E24",
} as const;

interface EntityBrand {
  color: string;
  logoPath: string;
}

/** Fallbacks used when an entity row has no brandColor/logoPath yet. */
export const ENTITY_BRAND: Record<string, EntityBrand> = {
  IWS: { color: "#2F9E5A", logoPath: "/brand/iws.png" },
  PRE: { color: "#4B5563", logoPath: "/brand/pre.png" },
  PORT: { color: "#3B2A1E", logoPath: "/brand/port.png" },
  RGT: { color: "#2E7D32", logoPath: "/brand/rgt.png" },
  RGL: { color: "#4A8A96", logoPath: "/brand/rgl.png" },
  GGB: { color: "#1B3A6B", logoPath: "/brand/ggb.png" },
};

export function entityColor(code: string, dbValue?: string | null): string {
  return dbValue ?? ENTITY_BRAND[code]?.color ?? "#6b7280";
}

export function entityLogo(code: string, dbValue?: string | null): string | null {
  return dbValue ?? ENTITY_BRAND[code]?.logoPath ?? null;
}
