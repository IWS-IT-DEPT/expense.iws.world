import { entityColor } from "@/lib/brand";

/** Small coloured pill for an entity, e.g. `RGT`. Colour comes from the logo. */
export function EntityBadge({
  code,
  color,
  className = "",
}: {
  code: string;
  color?: string | null;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold text-white ${className}`}
      style={{ backgroundColor: entityColor(code, color) }}
    >
      {code}
    </span>
  );
}
