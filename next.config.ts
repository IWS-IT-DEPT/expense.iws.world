import type { NextConfig } from "next";

// Not a full script-src CSP (Next's inline bootstrap scripts need a nonce setup);
// these directives still block framing, <base>/<object> injection and
// cross-origin form posts.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    // The receipt scanner needs the camera. Same-origin only.
    const cameraPolicy = { key: "Permissions-Policy", value: "camera=(self), microphone=()" };
    const baseline = [
      { key: "Content-Security-Policy", value: CSP },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    return [
      { source: "/:path*", headers: baseline },
      { source: "/r/:path*", headers: [cameraPolicy] },
      { source: "/transactions/:path*", headers: [cameraPolicy] },
      { source: "/receipts/:path*", headers: [cameraPolicy] },
      // Upload tokens live in this URL — keep them out of Referer headers.
      { source: "/r/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
};

export default nextConfig;
