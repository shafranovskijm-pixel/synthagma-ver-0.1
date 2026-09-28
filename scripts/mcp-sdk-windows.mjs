import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const PATCHED_SDK_VERSION = "0.23.0";
const LEGACY_GUARD = 'if (p.startsWith(".") || p.startsWith("/")) return null;';
const ESM_PATH_IMPORT = 'import { dirname, join, relative, resolve, sep } from "node:path";';
const PATCHED_ESM_PATH_IMPORT = 'import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";';

function exactlyOnce(text, oldText, newText, label) {
  const oldCount = text.split(oldText).length - 1;
  const newCount = text.split(newText).length - 1;
  if (oldCount === 1 && newCount === 0) return text.replace(oldText, newText);
  if (oldCount === 0 && newCount === 1) return text;
  throw new Error(`MCP SDK ${PATCHED_SDK_VERSION}: unexpected ${label}; refusing a speculative patch`);
}

/** Pure, guarded and idempotent patch for the SDK 0.23.0 Windows resolver bug. */
export function patchWindowsResolver(source, format) {
  if (format !== "esm" && format !== "cjs") throw new Error("Unknown SDK module format");
  const absolute = format === "esm" ? "isAbsolute" : "node_path.isAbsolute";
  const guard = String.raw`if (p.startsWith(".") || p.startsWith("/") || ${absolute}(p) || /^[A-Za-z]:[\\/]/.test(p)) return null;`;
  let patched = exactlyOnce(source, LEGACY_GUARD, guard, `${format} absolute-path guard`);
  if (format === "esm") patched = exactlyOnce(patched, ESM_PATH_IMPORT, PATCHED_ESM_PATH_IMPORT, "node:path import");
  else if (!patched.includes('let node_path = require("node:path");')) throw new Error("MCP SDK: missing CJS node:path binding");
  return patched;
}

function containedBy(parent, child) {
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
}

/**
 * Load the normal plugin off Windows. On Windows copy the pinned SDK into this
 * repository before patching, even when node_modules itself is a shared junction.
 * The original dependency directory is never written to.
 */
export async function loadMcpPlugin(projectRoot) {
  if (process.platform !== "win32") return (await import("@lovable.dev/mcp-js/stacks/supabase/vite")).mcpPlugin;

  const root = realpathSync(projectRoot);
  const require = createRequire(resolve(root, "package.json"));
  const sdkRoot = dirname(dirname(require.resolve("@lovable.dev/mcp-js")));
  const pkg = JSON.parse(readFileSync(resolve(sdkRoot, "package.json"), "utf8"));
  if (pkg.name !== "@lovable.dev/mcp-js" || pkg.version !== PATCHED_SDK_VERSION) {
    throw new Error(`Windows MCP patch expects @lovable.dev/mcp-js ${PATCHED_SDK_VERSION}; found ${pkg.name}@${pkg.version}`);
  }

  // Validate both inputs before creating or writing the private package copy.
  const inputs = [
    ["dist/stacks/supabase/vite.js", "esm"],
    ["dist/stacks/supabase/vite.cjs", "cjs"],
  ];
  const patched = inputs.map(([file, format]) => [file, patchWindowsResolver(readFileSync(resolve(sdkRoot, file), "utf8"), format)]);
  const workDir = resolve(root, ".codex-temp");
  mkdirSync(workDir, { recursive: true });
  if (!containedBy(root, realpathSync(workDir))) throw new Error("MCP private SDK directory must stay inside this repository");
  const copyDir = resolve(workDir, `mcp-sdk-${PATCHED_SDK_VERSION}`);
  if (existsSync(copyDir) && (lstatSync(copyDir).isSymbolicLink() || !containedBy(root, realpathSync(copyDir)))) {
    throw new Error("Refusing to patch a shared or external SDK copy");
  }
  cpSync(sdkRoot, copyDir, { recursive: true, force: true, dereference: true });
  for (const [file, code] of patched) writeFileSync(resolve(copyDir, file), code);
  return (await import(pathToFileURL(resolve(copyDir, "dist/stacks/supabase/vite.js")).href)).mcpPlugin;
}
