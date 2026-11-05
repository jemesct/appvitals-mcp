import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/mcp/tests/**/*.test.ts",
      "packages/shipvitals-mcp/tests/**/*.test.ts",
      "hosted/tests/**/*.test.ts",
    ],
  },
  resolve: {
    alias: {
      "appvitals-mcp": path.resolve(__dirname, "packages/mcp/src/index.ts"),
      "shipvitals-mcp": path.resolve(__dirname, "packages/shipvitals-mcp/src/index.ts"),
    },
  },
});
