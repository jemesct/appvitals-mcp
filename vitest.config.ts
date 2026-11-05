import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/mcp/tests/**/*.test.ts",
      "packages/shipvitals-mcp/tests/**/*.test.ts",
      "packages/merchantops-mcp/test/**/*.test.ts",
      "hosted/tests/**/*.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "hosted"),
      "merchantops-mcp/config": path.resolve(__dirname, "packages/merchantops-mcp/src/config.ts"),
      "merchantops-mcp": path.resolve(__dirname, "packages/merchantops-mcp/src/server.ts"),
      "appvitals-mcp": path.resolve(__dirname, "packages/mcp/src/index.ts"),
      "shipvitals-mcp": path.resolve(__dirname, "packages/shipvitals-mcp/src/index.ts"),
    },
  },
});
