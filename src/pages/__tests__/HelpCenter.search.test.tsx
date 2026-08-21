import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import HelpCenter from "@/pages/HelpCenter";

vi.mock("@/components/landing/FloatingParticles", () => ({
  FloatingParticles: () => null,
}));

class IntersectionObserverMock {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: number[] = [];

  disconnect = vi.fn();
  observe = vi.fn();
  takeRecords = vi.fn(() => []);
  unobserve = vi.fn();
}

vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);

describe("HelpCenter search", () => {
  it("filters tutorials and FAQ from the same search field", () => {
    render(<MemoryRouter><HelpCenter isModal /></MemoryRouter>);
    const search = screen.getByPlaceholderText("Поиск по вопросам...");

    fireEvent.change(search, { target: { value: "ИНН" } });
    expect(screen.getByRole("button", { name: /Регистрация организации/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Создание курса/i })).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "промокоды" } });
    expect(screen.getByRole("button", { name: "Как работают промокоды?" })).toBeInTheDocument();
    expect(screen.getByTestId("tutorials-empty-state")).toBeInTheDocument();
  });

  it("does not publish unsupported identification, document or FRDO promises", () => {
    const helpCenterSource = readFileSync(resolve(process.cwd(), "src/pages/HelpCenter.tsx"), "utf8");

    expect(helpCenterSource).not.toContain("Система сравнивает его с эталонным фото");
    expect(helpCenterSource).not.toContain("сформируйте PDF");
    expect(helpCenterSource).not.toContain("данные можно отправить в реестр");
    expect(helpCenterSource).not.toContain("@sintagma_support");
    expect(helpCenterSource).not.toContain("ответим в течение рабочего дня");
    expect(helpCenterSource).toContain("XLSX-файл для последующей загрузки в ФИС ФРДО");
    expect(helpCenterSource).toContain("Срок и объём поддержки зависят от тарифа или заказа");
  });
});
