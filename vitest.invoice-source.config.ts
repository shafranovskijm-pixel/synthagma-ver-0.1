import { defineConfig } from "vitest/config";

// No application/Vite plugins, environment loading, or compiled MCP regeneration.
export default defineConfig({ test: { environment: "node", include: ["src/lib/mcp/invoice-source.test.ts", "scripts/mcp-sdk-windows.test.ts"] } });
