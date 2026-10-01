import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { BrowserRouter, MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useUrlNavigation, useUrlQueryState } from "@/hooks/useUrlNavigation";

const wrapper = (entry: string) => ({ children }: PropsWithChildren) => <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>;
function useSection() {
  const [section, setSection] = useUrlQueryState("section", "profile", ["profile", "documents", "notifications"]);
  return { section, setSection, location: useLocation(), navigate: useNavigate(), ...useUrlNavigation() };
}

describe("URL screen history", () => {
  it("returns exactly one screen, skips repeated selections, and restores Forward", () => {
    const { result } = renderHook(useSection, { wrapper: wrapper("/student?tab=profile#details") });
    act(() => result.current.setSection("documents"));
    act(() => result.current.setSection("documents"));
    act(() => result.current.setSection("notifications"));
    expect(result.current.location.hash).toBe("#details");
    expect(result.current.params.get("tab")).toBe("profile");
    act(() => result.current.navigate(-1));
    expect(result.current.section).toBe("documents");
    act(() => result.current.navigate(-1));
    expect(result.current.section).toBe("profile");
    act(() => result.current.navigate(1));
    expect(result.current.section).toBe("documents");
  });

  it("restores a deep link and safely falls back for an unknown section", () => {
    const left = renderHook(useSection, { wrapper: wrapper("/student?tab=profile&section=documents") });
    const right = renderHook(useSection, { wrapper: wrapper("/student?tab=profile&section=unknown") });
    expect(left.result.current.section).toBe("documents");
    expect(right.result.current.section).toBe("profile");
    act(() => left.result.current.setSection("notifications"));
    expect(right.result.current.section).toBe("profile");
  });

  it("treats an explicitly written default as the current screen, without a duplicate entry", () => {
    const { result } = renderHook(useSection, { wrapper: wrapper("/student?tab=profile&section=profile") });
    act(() => result.current.setSection("profile"));
    expect(result.current.location.search).toContain("section=profile");
    act(() => result.current.setSection("documents"));
    act(() => result.current.navigate(-1));
    expect(result.current.location.search).toContain("section=profile");
  });

  it("updates several related parameters in one history entry", () => {
    const { result } = renderHook(useSection, { wrapper: wrapper("/organization?tab=group-folder&groupId=g1&groupView=members") });
    act(() => result.current.updateParams(params => {
      params.delete("groupView");
      params.set("folder", "docs");
      return params;
    }));
    expect(result.current.params.get("folder")).toBe("docs");
    expect(result.current.params.has("groupView")).toBe(false);
    act(() => result.current.navigate(-1));
    expect(result.current.params.get("groupView")).toBe("members");
    expect(result.current.params.has("folder")).toBe(false);
  });

  it("keeps React Router browser history metadata and Back/Forward functional", async () => {
    window.history.replaceState({ idx: 0, key: "start", usr: { from: "test" } }, "", "/student?tab=profile");
    const { result } = renderHook(useSection, { wrapper: ({ children }: PropsWithChildren) => <BrowserRouter>{children}</BrowserRouter> });
    act(() => result.current.setSection("documents"));
    expect(window.history.state.idx).toBe(1);
    expect(window.history.state.key).toBeTruthy();
    expect(window.history.state.usr).toEqual({ from: "test" });
    act(() => window.history.back());
    await waitFor(() => expect(result.current.section).toBe("profile"));
    act(() => window.history.forward());
    await waitFor(() => expect(result.current.section).toBe("documents"));
  });
});
