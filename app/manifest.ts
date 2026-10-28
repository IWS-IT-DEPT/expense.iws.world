import type { MetadataRoute } from "next";

import { IWS_BRAND } from "@/lib/brand";

/**
 * Web app manifest — what makes "Add to Home Screen" install IWS Expense as an
 * app (own icon, full-screen, no browser bar). Served at /manifest.webmanifest;
 * the proxy leaves it public because the browser fetches it without a session.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "IWS Expense",
    short_name: "IWS Expense",
    description: "Expense tracking and reporting for the IWS group of companies",
    start_url: "/expenses",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: IWS_BRAND.green,
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the home-screen icon (Android) for quick actions.
    shortcuts: [
      { name: "Log a purchase", url: "/expenses/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "This week", url: "/report", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "My expenses", url: "/expenses", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
