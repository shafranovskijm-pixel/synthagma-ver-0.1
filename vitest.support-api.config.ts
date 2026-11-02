import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", maxWorkers: 1,
  include: ["src/lib/mcp/support-read.test.ts", "src/lib/mcp/postpaid-billing.test.ts",
    "src/lib/mcp/invoice-source.test.ts", "src/lib/mcp/platform-acts.test.ts",
    "src/lib/mcp/get-my-profile.test.ts", "scripts/mcp-sdk-windows.test.ts"] } });
