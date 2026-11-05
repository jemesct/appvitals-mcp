import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "appvitals-mcp",
    "shipvitals-mcp",
    "@modelcontextprotocol/sdk",
    "google-auth-library",
    "postgres",
  ],
};

export default nextConfig;
