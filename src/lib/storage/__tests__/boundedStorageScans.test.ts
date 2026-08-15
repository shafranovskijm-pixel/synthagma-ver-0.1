import { describe, expect, it } from "vitest";
import { runBoundedStorageScans } from "@/lib/storage/boundedStorageScans";

describe("runBoundedStorageScans", () => {
  it("limits concurrent scans and keeps results in task order", async () => {
    let active = 0;
    let peak = 0;
    const release: Array<() => void> = [];

    const tasks = [0, 1, 2, 3].map((value) => async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => release.push(resolve));
      active -= 1;
      return value;
    });

    const resultPromise = runBoundedStorageScans(tasks, 2);
    await Promise.resolve();
    expect(active).toBe(2);
    expect(peak).toBe(2);

    release.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(active).toBe(2);

    while (release.length > 0) {
      release.shift()?.();
      await Promise.resolve();
      await Promise.resolve();
    }

    await expect(resultPromise).resolves.toEqual([0, 1, 2, 3]);
    expect(peak).toBe(2);
  });

  it("handles an empty task list without starting workers", async () => {
    await expect(runBoundedStorageScans([], 3)).resolves.toEqual([]);
  });

  it("normalizes zero concurrency to one worker", async () => {
    const calls: number[] = [];
    const result = await runBoundedStorageScans([
      async () => { calls.push(1); return "first"; },
      async () => { calls.push(2); return "second"; },
    ], 0);

    expect(result).toEqual(["first", "second"]);
    expect(calls).toEqual([1, 2]);
  });
});
