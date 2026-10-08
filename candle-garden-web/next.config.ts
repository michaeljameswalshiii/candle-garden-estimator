import type { NextConfig } from "next";
import path from "node:path";

const repositoryRoot = path.join(process.cwd(), "..");

const nextConfig: NextConfig = {
  async headers() { return ["/orders/:path*","/payments/:path*","/account/push-token","/auth/apple"].map(source=>({source,headers:[{key:"Access-Control-Allow-Origin",value:"*"},{key:"Access-Control-Allow-Methods",value:"GET, POST, DELETE, OPTIONS"},{key:"Access-Control-Allow-Headers",value:"Content-Type, Authorization, X-Device-Id"},{key:"Cache-Control",value:"no-store"}]})); },
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
