"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface Zone {
  key: string;
  label: string;
  href: string;
  matches: string[];
  nav: { href: string; label: string }[];
}

function pathInZone(path: string, zone: Zone): boolean {
  return zone.matches.some((m) => (m === "/" ? path === "/" : path === m || path.startsWith(`${m}/`)));
}

export function AppNav({ zones }: { zones: Zone[] }) {
  const path = usePathname();
  const active = zones.find((z) => pathInZone(path, z)) ?? zones[0];
  const showSwitcher = zones.length > 1;

  return (
    <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2">
      {showSwitcher && (
        <div className="flex rounded-md border border-black/15 p-0.5 text-xs dark:border-white/20">
          {zones.map((z) => (
            <Link
              key={z.key}
              href={z.href}
              className={`rounded px-2.5 py-1 font-medium ${
                z.key === active.key
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "opacity-70 hover:opacity-100"
              }`}
            >
              {z.label}
            </Link>
          ))}
        </div>
      )}
      <nav className="flex flex-wrap gap-4 text-sm">
        {active.nav.map((item) => {
          const on = path === item.href || path.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={on ? "font-medium" : "opacity-70 hover:opacity-100"}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
