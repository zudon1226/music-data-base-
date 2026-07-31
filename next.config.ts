import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // LAN phone testing: Next blocks cross-origin /_next/* (incl. HMR) unless listed.
  // Without this, SSR "Checking your session..." never hydrates and hangs forever.
  allowedDevOrigins: ["192.168.1.219", "127.0.0.1", "localhost"],
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/ringtones/[id]/process": ["./node_modules/ffmpeg-static/**/*"],
  },
};

export default nextConfig;
