import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/contexts/OrgDashboardContext", () => ({ useOrgDashboard: () => ({ tabNavigation: { setActiveTab: vi.fn() } }) }));
import { FirstCourseCreationChoice } from "../tabs/courses/FirstCourseCreationChoice";
import { CoursesEmptyState } from "../tabs/courses/CoursesEmptyState";
afterEach(cleanup);

describe("course creation entry points wait for access verification", () => {
  it("disables import and manual creation until access verification finishes", () => {
    const importMaterials = vi.fn(), create = vi.fn(), marketplace = vi.fn();
    const choice = (loading: boolean) => <FirstCourseCreationChoice accessLoading={loading} onImportMaterials={importMaterials} onCreateManually={create} onOpenMarketplace={marketplace} />;
    const view = render(choice(true));
    for (const name of ["Создать из материалов", "Создать вручную"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("aria-busy", "true");
      fireEvent.click(button);
    }
    expect(importMaterials).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Открыть магазин" })).toBeEnabled();
    view.rerender(choice(false));
    fireEvent.click(screen.getByRole("button", { name: "Создать из материалов" }));
    fireEvent.click(screen.getByRole("button", { name: "Создать вручную" }));
    expect(importMaterials).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("does not permit the empty-list creation button while checking", () => {
    const create = vi.fn();
    const view = render(<CoursesEmptyState accessLoading onCreateCourse={create} />);
    expect(screen.getByRole("button", { name: "Создать курс" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Создать курс" }));
    expect(create).not.toHaveBeenCalled();
    view.rerender(<CoursesEmptyState accessLoading={false} onCreateCourse={create} />);
    fireEvent.click(screen.getByRole("button", { name: "Создать курс" }));
    expect(create).toHaveBeenCalledTimes(1);
  });
});
