import { describe, expect, it, vi } from "vitest";
import { getOrganizationStorageUsage } from "@/lib/storage/organizationStorageUsage";

interface StorageItem {
  id: string | null;
  name: string;
  metadata?: { size?: number };
}

function createClient(options: {
  courseIds?: string[];
  list?: (bucket: string, prefix: string) => Promise<StorageItem[]>;
} = {}) {
  const eq = vi.fn().mockResolvedValue({
    data: (options.courseIds ?? []).map((id) => ({ id })),
  });
  const select = vi.fn(() => ({ eq }));
  const fromTable = vi.fn(() => ({ select }));
  const list = vi.fn(async (bucket: string, prefix: string) => ({
    data: options.list ? await options.list(bucket, prefix) : [],
    error: null,
  }));
  const fromBucket = vi.fn((bucket: string) => ({
    list: (prefix: string) => list(bucket, prefix),
  }));

  return {
    client: {
      from: fromTable,
      storage: { from: fromBucket },
    },
    eq,
    list,
  };
}

describe("getOrganizationStorageUsage", () => {
  it("sums course and organization files, including nested prefixes", async () => {
    const { client } = createClient({
      courseIds: ["course-1"],
      list: async (bucket, prefix) => {
        if (bucket === "presentations" && prefix === "course-1") {
          return [{ id: "pptx", name: "deck.pptx", metadata: { size: 20 } }];
        }
        if (bucket === "course-files" && prefix === "course-1") {
          return [
            { id: "document", name: "lesson.pdf", metadata: { size: 10 } },
            { id: null, name: "nested" },
          ];
        }
        if (bucket === "course-files" && prefix === "course-1/nested") {
          return [{ id: "image", name: "slide.png", metadata: { size: 5 } }];
        }
        if (bucket === "org-documents" && prefix === "org-sum") {
          return [{ id: "org-file", name: "contract.pdf", metadata: { size: 7 } }];
        }
        return [];
      },
    });

    await expect(getOrganizationStorageUsage(client, "org-sum", 0)).resolves.toBe(42);
  });

  it("deduplicates simultaneous requests for the same organization", async () => {
    let releaseFirstList: (() => void) | undefined;
    const firstListGate = new Promise<void>((resolve) => { releaseFirstList = resolve; });
    let first = true;
    const { client, eq, list } = createClient({
      list: async () => {
        if (first) {
          first = false;
          await firstListGate;
        }
        return [];
      },
    });

    const left = getOrganizationStorageUsage(client, "org-in-flight", 0);
    const right = getOrganizationStorageUsage(client, "org-in-flight", 0);
    releaseFirstList?.();

    await expect(Promise.all([left, right])).resolves.toEqual([0, 0]);
    expect(eq).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(6);
  });

  it("reuses a fresh cached total without another database or Storage scan", async () => {
    const { client, eq, list } = createClient();

    await expect(getOrganizationStorageUsage(client, "org-cache", 0)).resolves.toBe(0);
    const eqCalls = eq.mock.calls.length;
    const listCalls = list.mock.calls.length;
    await expect(getOrganizationStorageUsage(client, "org-cache", 0)).resolves.toBe(0);

    expect(eq).toHaveBeenCalledTimes(eqCalls);
    expect(list).toHaveBeenCalledTimes(listCalls);
  });
});
