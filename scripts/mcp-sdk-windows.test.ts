import { describe, expect, it } from "vitest";
import { isAbsolute } from "node:path";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PATCHED_SDK_VERSION, patchWindowsResolver } from "./mcp-sdk-windows.mjs";

describe("pinned Windows MCP SDK resolver correction", () => {
  it.each([["vite.js", "esm"], ["vite.cjs", "cjs"]])("patches installed %s exactly and is idempotent", (file, format) => {
    const sdkDir = resolve("node_modules/@lovable.dev/mcp-js");
    const pkg = JSON.parse(readFileSync(resolve(sdkDir, "package.json"), "utf8"));
    expect(pkg.version).toBe(PATCHED_SDK_VERSION);
    const original = readFileSync(resolve(sdkDir, "dist/stacks/supabase", file), "utf8");
    const patched = patchWindowsResolver(original, format);
    expect(patched).not.toEqual(original);
    expect(patchWindowsResolver(patched, format)).toBe(patched);
    expect(readFileSync(resolve(sdkDir, "dist/stacks/supabase", file), "utf8")).toBe(original);
    const guard = patched.split("\n").find(line => line.includes('p.startsWith(".")') && line.includes("return null;"));
    expect(guard).toBeDefined();
    const localPath = new Function("p", "isAbsolute", "node_path", `${guard} return false;`);
    for (const path of ["D:\\repo\\src\\lib\\mcp\\index.ts", "D:/repo/src/lib/mcp/index.ts", "./tools/read.ts", "/repo/entry.ts"]) {
      expect(localPath(path, isAbsolute, { isAbsolute })).toBeNull();
    }
    for (const path of ["@supabase/supabase-js", "zod", "npm:zod@3"]) {
      expect(localPath(path, isAbsolute, { isAbsolute })).toBe(false);
    }
  });
  it("fails closed when the expected SDK implementation changes", () => {
    expect(() => patchWindowsResolver("unrelated code", "esm")).toThrow("unexpected");
    expect(() => patchWindowsResolver("unrelated code", "other")).toThrow("Unknown SDK");
  });
  it("keeps the generated bundle self-contained and consistent with the manifest", () => {
    const manifest = JSON.parse(readFileSync(resolve(".lovable/mcp/manifest.json"), "utf8"));
    const compiled = readFileSync(resolve("supabase/functions/mcp/index.ts"), "utf8");
    expect(manifest.mcp.tools.length).toBeGreaterThan(0);
    expect(manifest.auth.issuer).not.toContain("project-ref-unset");
    expect(compiled).not.toMatch(/npm:[A-Za-z]:[\\/]/);
    expect(compiled).not.toContain("project-ref-unset");
    expect(compiled).toContain("Deno.serve(createSupabaseHandler(");
    for (const tool of manifest.mcp.tools) expect(compiled).toContain(`name: ${JSON.stringify(tool.name)}`);
  });
});
