import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FirstCourseCreationChoice } from "./FirstCourseCreationChoice";

describe("FirstCourseCreationChoice", () => {
  it("keeps the three real creation paths separate", () => {
    const onImportMaterials = vi.fn();
    const onOpenMarketplace = vi.fn();
    const onCreateManually = vi.fn();

    render(
      <FirstCourseCreationChoice
        onImportMaterials={onImportMaterials}
        onOpenMarketplace={onOpenMarketplace}
        onCreateManually={onCreateManually}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Создать из материалов" }));
    fireEvent.click(screen.getByRole("button", { name: "Открыть магазин" }));
    fireEvent.click(screen.getByRole("button", { name: "Создать вручную" }));

    expect(onImportMaterials).toHaveBeenCalledOnce();
    expect(onOpenMarketplace).toHaveBeenCalledOnce();
    expect(onCreateManually).toHaveBeenCalledOnce();
  });

  it("does not claim that the current importer accepts PDF", () => {
    render(
      <FirstCourseCreationChoice
        onImportMaterials={vi.fn()}
        onOpenMarketplace={vi.fn()}
        onCreateManually={vi.fn()}
      />,
    );

    expect(screen.getByText("DOCX")).toBeTruthy();
    expect(screen.getByText("PPTX")).toBeTruthy();
    expect(screen.getByText("DOC — Beta")).toBeTruthy();
    expect(screen.getByText(/Для документов рекомендуем DOCX/)).toBeTruthy();
    expect(screen.getByText("TXT")).toBeTruthy();
    expect(screen.getByText("HTML")).toBeTruthy();
    expect(screen.getByText("PDF — скоро")).toBeTruthy();
  });

  it("offers an explicit way to reveal the seeded welcome course", () => {
    const onSkip = vi.fn();
    render(
      <FirstCourseCreationChoice
        onImportMaterials={vi.fn()}
        onOpenMarketplace={vi.fn()}
        onCreateManually={vi.fn()}
        hasWelcomeCourse
        onSkip={onSkip}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Пока пропустить и открыть приветственный курс" }));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it("can return to the ordered first-run checklist without losing creation paths", () => {
    const onBack = vi.fn();
    render(
      <FirstCourseCreationChoice
        onImportMaterials={vi.fn()}
        onOpenMarketplace={vi.fn()}
        onCreateManually={vi.fn()}
        onBack={onBack}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Назад к шагам" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
