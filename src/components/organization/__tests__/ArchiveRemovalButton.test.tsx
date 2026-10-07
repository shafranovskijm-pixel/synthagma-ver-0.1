import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArchiveRemovalButton } from "../tabs/students/ArchiveRemovalButton";
describe("archive removal confirmation", () => {
  it("does not remove before confirmation and preserves the dialog on server refusal", async () => {
    const remove = vi.fn().mockResolvedValue(false);
    render(<ArchiveRemovalButton studentName="Тестовый ученик" onRemove={remove} />);
    fireEvent.click(screen.getByRole("button", { name: "Удалить из архива: Тестовый ученик" }));
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByText(/История обучения, результаты тестов и выданные документы сохранятся/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Удалить из архива" }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
