import React, { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecipientPicker, type RecipientPickerValue } from "../RecipientPicker";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));

const initial: RecipientPickerValue = { source: "manual", manualEmails: ["saved@example.com"], count: 0, previewReady: false };
const successful = (count: number) => ({ data: { input_count: count, eligible_count: count, duplicate_count: 0, invalid_count: 0, suppressed_count: 0 }, error: null });
const deferred = () => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};
const tick = async () => { await act(async () => { vi.advanceTimersByTime(351); }); };

function Harness({ changed }: { changed: (value: RecipientPickerValue, reason?: "user" | "preview") => void }) {
  const [value, setValue] = useState(initial);
  return <><RecipientPicker scope="platform" organizationId={null} value={value} onChange={(next, reason) => { changed(next, reason); setValue(next); }} /><output data-testid="state">{JSON.stringify(value)}</output></>;
}

beforeEach(() => { vi.useFakeTimers(); mocks.rpc.mockReset(); mocks.rpc.mockResolvedValue(successful(1)); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("RecipientPicker saved draft safety", () => {
  it("previews hydrated recipients without reporting a user edit", async () => {
    const changed = vi.fn();
    render(<Harness changed={changed} />);
    expect(screen.getByRole("textbox")).toHaveValue("saved@example.com");
    await tick();
    expect(mocks.rpc).toHaveBeenCalledWith("get_campaign_recipient_preview", expect.objectContaining({ p_manual_emails: ["saved@example.com"] }));
    expect(changed.mock.calls.every(([, reason]) => reason === "preview")).toBe(true);
    expect(JSON.parse(screen.getByTestId("state").textContent!)).toMatchObject({ manualEmails: ["saved@example.com"], count: 1, previewReady: true });
  });

  it("syncs a different reopened list into the existing textarea", async () => {
    const changed = vi.fn();
    const { rerender } = render(<RecipientPicker scope="platform" organizationId={null} value={initial} onChange={changed} />);
    rerender(<RecipientPicker scope="platform" organizationId={null} value={{ ...initial, manualEmails: ["reopened@example.com"] }} onChange={changed} />);
    expect(screen.getByRole("textbox")).toHaveValue("reopened@example.com");
    await tick();
    expect(mocks.rpc).toHaveBeenLastCalledWith("get_campaign_recipient_preview", expect.objectContaining({ p_manual_emails: ["reopened@example.com"] }));
    expect(changed.mock.calls.every(([, reason]) => reason === "preview")).toBe(true);
  });

  it("invalidates old requests immediately while the next edit is debouncing", async () => {
    const old = deferred();
    mocks.rpc.mockReturnValueOnce(old.promise).mockResolvedValue(successful(1));
    const changed = vi.fn();
    render(<Harness changed={changed} />);
    await tick();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "new@example.com" } });
    await act(async () => { old.resolve(successful(99)); });
    expect(JSON.parse(screen.getByTestId("state").textContent!)).toMatchObject({ manualEmails: ["new@example.com"], count: 0, previewReady: false });
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ manualEmails: ["new@example.com"] }), "user");
    await tick();
    expect(JSON.parse(screen.getByTestId("state").textContent!)).toMatchObject({ manualEmails: ["new@example.com"], count: 1, previewReady: true });
  });

  it("does not remain locked after typing a separator without changing parsed tokens", async () => {
    render(<Harness changed={vi.fn()} />);
    await tick();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "saved@example.com\n" } });
    await tick();
    expect(JSON.parse(screen.getByTestId("state").textContent!).previewReady).toBe(true);
    expect(screen.getByRole("textbox")).toHaveValue("saved@example.com\n");
  });

  it("keeps the list when preview fails and marks launch as unready", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Network unavailable" } });
    render(<Harness changed={vi.fn()} />);
    await tick();
    expect(screen.getByRole("textbox")).toHaveValue("saved@example.com");
    expect(JSON.parse(screen.getByTestId("state").textContent!)).toMatchObject({ count: 0, previewReady: false, manualEmails: ["saved@example.com"] });
    expect(screen.getByText(/Network unavailable/)).toBeInTheDocument();
  });
});
