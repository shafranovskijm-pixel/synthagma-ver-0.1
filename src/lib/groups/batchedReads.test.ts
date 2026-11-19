import { describe, expect, it, vi } from "vitest";
import { fetchRowsByIdBatches } from "./batchedReads";

describe("bounded group reads", () => {
  it.each([358, 1276])("reads every learner in a %i-member group without a long ID filter", async count => {
    const ids = Array.from({ length: count }, (_, i) => `learner-${i}`);
    const query = vi.fn(async (batch: string[]) => ({ data: batch.map(user_id => ({ user_id })), error: null }));
    expect(await fetchRowsByIdBatches(ids, query)).toEqual(ids.map(user_id => ({ user_id })));
    expect(query).toHaveBeenCalledTimes(Math.ceil(count / 100));
    expect(query.mock.calls.every(([batch]) => batch.length <= 100)).toBe(true);
  });

  it("deduplicates IDs across batches and does not query an empty group", async () => {
    const query = vi.fn(async (batch: string[]) => ({ data: batch, error: null }));
    expect(await fetchRowsByIdBatches([], query)).toEqual([]);
    expect(query).not.toHaveBeenCalled();
    expect(await fetchRowsByIdBatches(["one", "", "one", "two"], query)).toEqual(["one", "two"]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("paginates more than 1000 matching records inside one bounded ID batch", async () => {
    const rows = Array.from({ length: 2073 }, (_, id) => ({ id }));
    const ranges: number[] = [];
    expect(await fetchRowsByIdBatches(["one"], async (_batch, { from, to }) => {
      ranges.push(from);
      return { data: rows.slice(from, to + 1), error: null };
    })).toEqual(rows);
    expect(ranges).toEqual([0, 1000, 2000]);
  });

  it("rejects instead of returning partial rows when a later ID batch fails", async () => {
    const error = { code: "57014" };
    const query = vi.fn(async (batch: string[]) => ({ data: batch, error: batch.includes("100") ? error : null }));
    await expect(fetchRowsByIdBatches(Array.from({ length: 250 }, (_, i) => String(i)), query)).rejects.toBe(error);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("rejects instead of returning partial rows when a later result page fails", async () => {
    const error = { code: "42501" };
    await expect(fetchRowsByIdBatches(["one"], async (_batch, { from }) => ({
      data: from === 0 ? Array.from({ length: 1000 }, (_, id) => id) : null,
      error: from === 0 ? null : error,
    }))).rejects.toBe(error);
  });

  it.each([null, "not-a-row-array", {}])("rejects malformed success payload %j", async data => {
    await expect(fetchRowsByIdBatches(["one"], async () => ({ data: data as any, error: null })))
      .rejects.toThrow("group_rows_invalid_response");
  });
});
