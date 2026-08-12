import { describe, expect, it } from "vitest";
import { chunkSenderRows, parseSenderBatch, senderRowsForRpc } from "../senderBatch";

describe("sender batch parser", () => {
  it("normalizes and deduplicates sender lines without changing secrets", () => {
    const result = parseSenderBatch([
      " First@torgi.com.ru secret-1 ",
      "first@torgi.com.ru secret-2",
      "second@torgi.com.ru secret-3",
    ].join("\n"));
    expect(result.rows).toEqual([
      { email: "first@torgi.com.ru", password: "secret-1" },
      { email: "second@torgi.com.ru", password: "secret-3" },
    ]);
    expect(result.duplicateCount).toBe(1);
  });

  it("reports only line numbers for invalid credentials", () => {
    const result = parseSenderBatch("not-an-email secret\nvalid@torgi.com.ru\nok@torgi.com.ru good");
    expect(result.invalidLines).toEqual([1, 2]);
    expect(JSON.stringify(result.invalidLines)).not.toContain("secret");
  });

  it("builds inactive-import defaults in batches of at most 50", () => {
    const source = Array.from({ length: 203 }, (_, index) => ({
      email: `sender-${index}@torgi.com.ru`,
      password: `secret-${index}`,
    }));
    const rpcRows = senderRowsForRpc(source);
    const batches = chunkSenderRows(rpcRows);
    expect(batches.map((batch) => batch.length)).toEqual([50, 50, 50, 50, 3]);
    expect(rpcRows[0]).toMatchObject({
      smtp_host: "mail.torgi.com.ru",
      imap_host: "mail.torgi.com.ru",
      daily_limit: 2,
    });
  });
});
