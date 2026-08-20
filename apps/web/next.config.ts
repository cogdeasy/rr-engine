import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages are shipped as TypeScript source.
  transpilePackages: ["@rr/ui", "@rr/data", "@rr/types"],
  outputFileTracingRoot: `${__dirname}/../..`,
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
