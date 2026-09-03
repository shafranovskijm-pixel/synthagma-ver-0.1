import { execFileSync } from "node:child_process";
import type { Plugin } from "vite";

export interface BuildInfo {
  schemaVersion: 1;
  gitStateCapturedAt: "before-build";
  gitCommit: string;
  trackedDirty: boolean | "unknown";
  builtAt: string;
}

type GitRunner = (args: string[], root: string) => string;

const runGit: GitRunner = (args, root) => execFileSync("git", args, {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
  windowsHide: true,
  timeout: 5000,
});

/** Build provenance only: never expose Git output, errors, paths or environment variables. */
export function readBuildInfo(root: string, git: GitRunner = runGit): BuildInfo {
  const info: BuildInfo = {
    schemaVersion: 1,
    gitStateCapturedAt: "before-build",
    gitCommit: "unknown",
    trackedDirty: "unknown",
    builtAt: new Date().toISOString(),
  };

  try {
    const commit = git(["rev-parse", "--verify", "HEAD"], root).trim();
    if (!/^[0-9a-f]{40}$/i.test(commit)) return info;
    info.gitCommit = commit.toLowerCase();
    // Include staged and unstaged tracked changes; build output/untracked files are excluded.
    info.trackedDirty = git(["status", "--porcelain=v1", "--untracked-files=no"], root).trim() !== "";
  } catch {
    // Source archives and some hosted builders omit Git. Unknown must not look like a clean build.
  }

  return info;
}

export function buildInfoPlugin(): Plugin {
  let info: BuildInfo;

  return {
    name: "sintagma-build-info",
    apply: "build",
    enforce: "pre",
    configResolved(config) {
      // Capture synchronously before other configResolved/buildStart code generators
      // (including MCP) can modify tracked files in an otherwise clean checkout.
      info = readBuildInfo(config.root);
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "build-info.json",
        source: `${JSON.stringify(info, null, 2)}\n`,
      });
    },
  };
}
