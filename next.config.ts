import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    // The receipt scanner needs the camera. Same-origin only.
    const cameraPolicy = { key: "Permissions-Policy", value: "camera=(self), microphone=()" };
    return [
      { source: "/r/:path*", headers: [cameraPolicy] },
      { source: "/transactions/:path*", headers: [cameraPolicy] },
      { source: "/receipts/:path*", headers: [cameraPolicy] },
    ];
  },
};

export default nextConfig;
