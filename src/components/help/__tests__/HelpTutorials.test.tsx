import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { HelpTutorials } from "../HelpTutorials";
import { filterHelpTutorials, helpTutorials, type HelpTutorial } from "../helpTutorialData";

describe("helpTutorials data", () => {
  it("contains the seven requested training flows without tenant-specific public data", () => {
    expect(helpTutorials.map((tutorial) => tutorial.id)).toEqual([
      "register-organization",
      "create-course",
      "student-enrollment",
      "create-group",
      "document-exchange",
      "group-document-package",
      "student-personal-file",
    ]);
    expect(helpTutorials.every((tutorial) => tutorial.steps.length > 0)).toBe(true);
    expect(JSON.stringify(helpTutorials)).not.toMatch(/горэлтех/i);
  });

  it("searches titles, keywords and step content", () => {
    expect(filterHelpTutorials("ИНН").map((tutorial) => tutorial.id)).toContain("register-organization");
    expect(filterHelpTutorials("зачислить").map((tutorial) => tutorial.id)).toContain("student-enrollment");
    expect(filterHelpTutorials("повторить пакет").map((tutorial) => tutorial.id)).toContain("group-document-package");
    expect(filterHelpTutorials("несуществующий запрос")).toEqual([]);
  });

  it("documents course publication permission and the Beta group-package gate", () => {
    const courseGuide = helpTutorials.find((tutorial) => tutorial.id === "create-course");
    const packageGuide = helpTutorials.find((tutorial) => tutorial.id === "group-document-package");

    expect(JSON.stringify(courseGuide)).toContain("courses.write");
    expect(JSON.stringify(packageGuide)).toContain("Beta");
    expect(JSON.stringify(packageGuide)).toContain("сверить");
  });

  it("stores registration and OG screenshots as real JPEG files", () => {
    const helpImage = readFileSync(resolve(process.cwd(), "src/assets/help/registration-organization-form.jpg"));
    const ogImage = readFileSync(resolve(process.cwd(), "public/og-registration-organization.jpg"));

    expect([...helpImage.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect([...ogImage.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  });
});

describe("HelpTutorials", () => {
  it("opens a guide inline and renders the verified production screenshot", () => {
    render(<HelpTutorials tutorials={[helpTutorials[0]]} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Регистрация организации/i }));
    expect(screen.getByText("Откройте форму регистрации")).toBeInTheDocument();
    expect(screen.getByText(/Не передавайте пароль другим людям/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Пустая форма регистрации организации в СИНТАГМЕ" })).toHaveAttribute("loading", "lazy");
    expect(screen.getByText(/Продакшен, 22 августа 2026 года/)).toBeInTheDocument();
  });

  it("renders an optional verified screenshot with accessible text", () => {
    const tutorialWithScreenshot: HelpTutorial = {
      ...helpTutorials[0],
      steps: [{
        ...helpTutorials[0].steps[0],
        screenshots: [{
          src: "/assets/help/register.webp",
          alt: "Форма регистрации учебной организации",
          caption: "Шаг 1. Открыта форма регистрации.",
        }],
      }],
    };
    render(<HelpTutorials tutorials={[tutorialWithScreenshot]} />);
    fireEvent.click(screen.getByRole("button", { name: /Регистрация организации/i }));
    expect(screen.getByRole("img", { name: "Форма регистрации учебной организации" })).toHaveAttribute("loading", "lazy");
    expect(screen.getByText("Шаг 1. Открыта форма регистрации.")).toBeInTheDocument();
  });

  it("shows a clear empty result for a search query", () => {
    render(<HelpTutorials query="такой инструкции нет" />);
    expect(screen.getByTestId("tutorials-empty-state")).toBeInTheDocument();
  });
});
