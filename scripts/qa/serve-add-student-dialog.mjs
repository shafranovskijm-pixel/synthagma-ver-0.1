// Development-only component harness. No application/authentication initialization,
// no PWA or MCP generation, no production writes. Run from the repository root.
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react-swc";

const root = fileURLToPath(new URL("../../", import.meta.url));
const server = await createServer({
  configFile: false,
  root,
  envDir: false,
  cacheDir: "D:/CodexTmp/sintagma-add-student-dialog-vite-cache",
  plugins: [react()],
  optimizeDeps: { entries: ["scripts/qa/add-student-dialog.html"] },
  resolve: { alias: { "@": resolve(root, "src") }, dedupe: ["react", "react-dom"] },
  server: { host: "127.0.0.1", port: 4317, strictPort: true, open: false },
});
await server.listen();
console.log("Local synthetic component QA: http://127.0.0.1:4317/scripts/qa/add-student-dialog.html");
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => { await server.close(); process.exit(0); });
