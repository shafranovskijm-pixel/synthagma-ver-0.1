import { beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import type { ResolvedConfig } from "vite";
import { buildInfoPlugin, readBuildInfo } from "../../scripts/viteBuildInfo";

vi.mock("node:child_process", () => {
  const execFileSync = vi.fn();
  return { execFileSync, default: { execFileSync } };
});

const commit = "0123456789abcdef0123456789abcdef01234567";
const git = vi.mocked(execFileSync);

beforeEach(() => {
  git.mockReset();
});

describe("public build provenance", () => {
  it("reports the exact 40-character Git HEAD of a clean tracked tree", () => {
    git.mockReturnValueOnce(`${commit}\n`).mockReturnValueOnce("");

    expect(readBuildInfo("/build/source")).toEqual({
      schemaVersion: 1,
      gitStateCapturedAt: "before-build",
      gitCommit: commit,
      trackedDirty: false,
      builtAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(git).toHaveBeenNthCalledWith(1, "git", ["rev-parse", "--verify", "HEAD"], expect.objectContaining({ cwd: "/build/source" }));
    expect(git).toHaveBeenNthCalledWith(2, "git", ["status", "--porcelain=v1", "--untracked-files=no"], expect.objectContaining({ cwd: "/build/source" }));
  });

  it.each([" M src/file.ts\n", "M  src/file.ts\n", "D  src/file.ts\n"])(
    "does not hide tracked changes: %s", (status) => {
      git.mockReturnValueOnce(commit).mockReturnValueOnce(status);
      expect(readBuildInfo("/build/source")).toMatchObject({ gitCommit: commit, trackedDirty: true });
    },
  );

  it("reports unknown, not a clean build, when Git is unavailable", () => {
    git.mockImplementation(() => { throw new Error("No git in /private/machine/path token=secret"); });
    const info = readBuildInfo("/private/machine/path");
    expect(info).toMatchObject({ gitCommit: "unknown", trackedDirty: "unknown" });
    expect(JSON.stringify(info)).not.toMatch(/private|machine|secret|token/);
  });

  it("keeps dirty state unknown when status fails, even if HEAD was read", () => {
    git.mockReturnValueOnce(commit).mockImplementationOnce(() => { throw new Error("status failed"); });
    expect(readBuildInfo("/build/source")).toMatchObject({ gitCommit: commit, trackedDirty: "unknown" });
  });

  it.each(["0123456", "not-a-commit", `${commit}extra`, "a".repeat(64)])(
    "rejects a non-exact SHA instead of presenting it as a release: %s", (invalid) => {
      git.mockReturnValueOnce(invalid);
      expect(readBuildInfo("/build/source")).toMatchObject({ gitCommit: "unknown", trackedDirty: "unknown" });
      expect(git).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { state: "clean", sha: commit, dirty: false },
    { state: "dirty", sha: commit, dirty: true },
    { state: "no Git", sha: "unknown", dirty: "unknown" },
  ])("emits $state build-info.json from the Vite build hook", async ({ state, sha, dirty }) => {
    if (state === "no Git") {
      git.mockImplementation(() => { throw new Error("Git unavailable"); });
    } else {
      git.mockReturnValueOnce(commit).mockReturnValueOnce(state === "dirty" ? " M src/file.ts\n" : "");
    }
    const plugin = buildInfoPlugin();
    const emitFile = vi.fn();
    if (typeof plugin.configResolved !== "function" || typeof plugin.generateBundle !== "function") {
      throw new Error("Missing build hooks");
    }
    await plugin.configResolved.call({} as never, { root: process.cwd() } as ResolvedConfig);
    expect(git).toHaveBeenCalledWith("git", expect.any(Array), expect.objectContaining({ cwd: process.cwd() }));
    // A later generator may dirty tracked files; provenance is explicitly the input snapshot.
    git.mockReset().mockReturnValue(" M supabase/functions/mcp/index.ts\n");
    await plugin.generateBundle.call({ emitFile } as never, {} as never, {}, false);
    expect(emitFile).toHaveBeenCalledOnce();
    const marker = emitFile.mock.calls[0][0];
    expect(marker).toMatchObject({ type: "asset", fileName: "build-info.json" });
    expect(JSON.parse(marker.source)).toMatchObject({
      gitStateCapturedAt: "before-build", gitCommit: sha, trackedDirty: dirty,
    });
    expect(git).not.toHaveBeenCalled();
    expect(plugin.apply).toBe("build");
    expect(plugin.enforce).toBe("pre");
  });
});
