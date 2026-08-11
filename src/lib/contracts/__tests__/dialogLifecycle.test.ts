import { describe, expect, it } from "vitest";
import {
  acquireContractSubmission,
  releaseContractSubmission,
  shouldDismissContractDialog,
} from "@/lib/contracts/dialogLifecycle";

describe("contract dialog lifecycle", () => {
  it("allows an idle dialog to close", () => {
    expect(shouldDismissContractDialog(false, false)).toBe(true);
  });

  it("keeps the dialog open while a contract is being saved", () => {
    expect(shouldDismissContractDialog(false, true)).toBe(false);
  });

  it("never treats an open-state notification as a close request", () => {
    expect(shouldDismissContractDialog(true, false)).toBe(false);
    expect(shouldDismissContractDialog(true, true)).toBe(false);
  });

  it("blocks a second synchronous submit until the first one releases", () => {
    const lock = { current: false };

    expect(acquireContractSubmission(lock)).toBe(true);
    expect(acquireContractSubmission(lock)).toBe(false);

    releaseContractSubmission(lock);
    expect(acquireContractSubmission(lock)).toBe(true);
  });
});
