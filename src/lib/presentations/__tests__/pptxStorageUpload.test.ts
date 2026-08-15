import { describe, expect, it, vi } from "vitest";
import {
  isTransientPresentationStorageError,
  presentationObjectExists,
  presentationStorageErrorMessage,
  uploadPresentationWithRetry,
} from "@/lib/presentations/pptxStorageUpload";

describe("PPTX Storage upload recovery", () => {
  it("retries transient failures with exponential backoff and returns success", async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ error: { statusCode: 503, message: "Service unavailable" } })
      .mockResolvedValueOnce({ error: { status: 429, message: "Too many connections" } })
      .mockResolvedValueOnce({ error: null });
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(uploadPresentationWithRetry(upload, {
      maxAttempts: 3,
      baseDelayMs: 25,
      sleep,
    })).resolves.toEqual({ error: null });

    expect(upload).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 25);
    expect(sleep).toHaveBeenNthCalledWith(2, 50);
  });

  it("does not retry a permanent Storage error", async () => {
    const error = { statusCode: 400, message: "Invalid object path" };
    const upload = vi.fn().mockResolvedValue({ error });
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(uploadPresentationWithRetry(upload, { sleep })).resolves.toEqual({ error });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("returns the final transient error after the configured attempt limit", async () => {
    const error = { status: 504, message: "Gateway timeout" };
    const upload = vi.fn().mockResolvedValue({ error });

    await expect(uploadPresentationWithRetry(upload, {
      maxAttempts: 2,
      baseDelayMs: 0,
      sleep: vi.fn().mockResolvedValue(undefined),
    })).resolves.toEqual({ error });
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it("classifies transient status/message variants and keeps a useful Russian message", () => {
    expect(isTransientPresentationStorageError({ status: "503" })).toBe(true);
    expect(isTransientPresentationStorageError({ message: "Too many connections issued to the database" })).toBe(true);
    expect(isTransientPresentationStorageError({ status: 409, message: "Duplicate" })).toBe(false);
    expect(presentationStorageErrorMessage({ status: 503 })).toContain("временно перегружен");
    expect(presentationStorageErrorMessage({ status: 400, message: "Bad request" })).toBe(
      "Ошибка загрузки файла: Bad request",
    );
  });

  it("confirms an object that reached Storage after a damaged upload response", async () => {
    const list = vi.fn().mockResolvedValue({
      data: [{ name: "other.pptx" }, { name: "lesson-1.pptx" }],
      error: null,
    });

    await expect(presentationObjectExists({ list }, "course-1/lesson-1.pptx")).resolves.toBe(true);
    expect(list).toHaveBeenCalledWith("course-1", { search: "lesson-1.pptx", limit: 100 });
  });

  it("does not treat a failed or ambiguous listing as proof that the object exists", async () => {
    await expect(presentationObjectExists({
      list: vi.fn().mockResolvedValue({ data: null, error: new Error("offline") }),
    }, "course-1/lesson-1.pptx")).resolves.toBe(false);

    await expect(presentationObjectExists({
      list: vi.fn().mockRejectedValue(new Error("offline")),
    }, "lesson-1.pptx")).resolves.toBe(false);
  });
});
