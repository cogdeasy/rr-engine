import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages are shipped as TypeScript source.
  transpilePackages: ["@rr/ui", "@rr/data", "@rr/types"],
  outputFileTracingRoot: `${__dirname}/../..`,
  // Self-contained server bundle so the container image needs no workspace install.
  output: "standalone",
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
