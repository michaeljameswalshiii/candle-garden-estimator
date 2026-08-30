import type { NextConfig } from "next";
import path from "node:path";

const repositoryRoot = path.join(process.cwd(), "..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: repositoryRoot,
  turbopack: {
    root: repositoryRoot,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.squarespace-cdn.com",
      },
    ],
  },
};

export default nextConfig;
