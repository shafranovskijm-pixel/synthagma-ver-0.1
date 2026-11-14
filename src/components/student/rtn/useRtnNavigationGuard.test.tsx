import { useRef, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRtnNavigationGuard } from "./useRtnNavigationGuard";

const prior = "/rtn-navigation-fixture/prior";
const student = "/rtn-navigation-fixture/student";
const onBlocked = vi.fn();

function Attempt() {
  const [saved, setSaved] = useState(false);
  const [choice, setChoice] = useState(false);
  const [notice, setNotice] = useState(false);
  const [open, setOpen] = useState(true);
  const ready = useRef(false);
  ready.current = saved;
  useRtnNavigationGuard({ open, isCloseReadyRef: ready, onBlocked: () => { setNotice(true); onBlocked(); } });
  return <section aria-label="Frozen attempt">
    <label><input type="checkbox" checked={choice} onChange={event => setChoice(event.target.checked)} />Local choice</label>
    {notice && <p role="alert">Save or confirm submission before leaving.</p>}
    <button onClick={() => setSaved(true)}>Server confirmed safe</button>
    <button onClick={() => setOpen(false)}>Close safe modal</button>
  </section>;
}

function mount() {
  return render(<BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes>
    <Route path={student} element={<Attempt />} />
    <Route path={prior} element={<p>Prior route</p>} />
  </Routes></BrowserRouter>);
}

beforeEach(() => {
  onBlocked.mockReset();
  window.history.replaceState({ idx: 0, key: "prior", usr: null }, "", prior);
  window.history.pushState({ idx: 1, key: "attempt", usr: null }, "", student);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("RTN native SPA Back guard with the real BrowserRouter", () => {
  it("restores dirty Back without unmounting choices, then permits ordinary Back after server confirmation", async () => {
    mount();
    fireEvent.click(screen.getByLabelText("Local choice"));
    act(() => window.history.back());
    await screen.findByRole("alert");
    await waitFor(() => expect(window.location.pathname).toBe(student));
    expect(screen.getByLabelText("Local choice")).toBeChecked();
    expect(screen.queryByText("Prior route")).not.toBeInTheDocument();
    expect(onBlocked).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Server confirmed safe" }));
    act(() => window.history.back());
    expect(await screen.findByText("Prior route")).toBeInTheDocument();
    expect(onBlocked).toHaveBeenCalledTimes(1);
  });

  it("does not guess traversal for a legacy target without idx and replays it only when safe", async () => {
    window.history.replaceState({ key: "legacy" }, "", prior);
    window.history.pushState({ idx: 1, key: "attempt", usr: null }, "", student);
    const go = vi.spyOn(window.history, "go");
    mount();
    fireEvent.click(screen.getByLabelText("Local choice"));
    act(() => window.history.back());
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Local choice")).toBeChecked();
    expect(screen.queryByText("Prior route")).not.toBeInTheDocument();
    expect(go).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Server confirmed safe" }));
    expect(await screen.findByText("Prior route")).toBeInTheDocument();
    expect(go).not.toHaveBeenCalled();
  });

  it("bounds restoration when traversal does not return and retains the session until safe replay", async () => {
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    mount();
    fireEvent.click(screen.getByLabelText("Local choice"));
    act(() => {
      window.history.replaceState({ idx: 0, key: "prior", usr: null }, "", prior);
      window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
      window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    });
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith(1);
    expect(screen.getByLabelText("Local choice")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Server confirmed safe" }));
    expect(await screen.findByText("Prior route")).toBeInTheDocument();
    expect(go).toHaveBeenCalledTimes(1);
    expect(onBlocked).toHaveBeenCalledTimes(1);
  });

  it("removes the interception when the RTN modal closes", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Close safe modal" }));
    act(() => window.history.back());
    expect(await screen.findByText("Prior route")).toBeInTheDocument();
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it("reconciles a legacy deferred Back when the saved modal closes before its replay timer", async () => {
    window.history.replaceState({ key: "legacy" }, "", prior);
    window.history.pushState({ idx: 1, key: "attempt", usr: null }, "", student);
    mount();
    act(() => window.history.back());
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Server confirmed safe" }));
    fireEvent.click(screen.getByRole("button", { name: "Close safe modal" }));
    expect(await screen.findByText("Prior route")).toBeInTheDocument();
    expect(onBlocked).toHaveBeenCalledTimes(1);
  });
});
