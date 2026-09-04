import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CourseLibraryResource } from "@/api/courseLibrary";

const useCourseLibraryMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useCourseLibrary", () => ({
  useCourseLibrary: useCourseLibraryMock,
}));

import { CourseLibraryReader } from "@/components/course-library/CourseLibraryReader";

function resource(
  overrides: Partial<CourseLibraryResource> & Pick<CourseLibraryResource, "libraryDocumentId" | "title">,
): CourseLibraryResource {
  return {
    assignmentId: `assignment-${overrides.libraryDocumentId}`,
    libraryDocumentId: overrides.libraryDocumentId,
    courseId: "course-1",
    moduleId: null,
    moduleTitle: null,
    title: overrides.title,
    category: "legal_acts",
    description: null,
    sourceName: "Официальный источник",
    externalUrl: "https://example.org/document",
    storagePath: null,
    mimeType: null,
    originalFilename: null,
    fileSize: null,
    editionLabel: null,
    lastCheckedAt: "2026-09-03",
    usageBasis: "official_open_source",
    status: "active",
    sortOrder: 0,
    allowDownload: true,
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
    ...overrides,
  };
}

describe("CourseLibraryReader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCourseLibraryMock.mockReturnValue({
      resources: [
        resource({
          libraryDocumentId: "official",
          title: "Правила противопожарного режима",
          sourceName: "МЧС России",
        }),
        resource({
          libraryDocumentId: "unavailable",
          title: "Методическое пособие",
          category: "educational_materials",
          sourceName: "Учебный центр",
          externalUrl: null,
          storagePath: null,
          status: "active",
          sortOrder: 1,
        }),
        resource({
          libraryDocumentId: "review",
          title: "Черновой материал",
          category: "additional_resources",
          status: "needs_review",
          sortOrder: 2,
        }),
        resource({
          libraryDocumentId: "archived",
          title: "Устаревшая инструкция изготовителя",
          category: "manufacturer_guides",
          sourceName: "Изготовитель",
          status: "archive",
          sortOrder: 3,
        }),
      ],
      modules: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
      getOpenUrl: vi.fn(),
    });
  });

  it("groups visible resources, shows their source and hides archived cards", () => {
    render(<CourseLibraryReader courseId="course-1" />);

    expect(screen.getByRole("heading", { name: "Нормативные правовые акты" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Учебно-методические материалы" })).toBeInTheDocument();
    expect(screen.getByText("МЧС России")).toBeInTheDocument();
    expect(screen.getByText("Учебный центр")).toBeInTheDocument();
    expect(screen.queryByText("Устаревшая инструкция изготовителя")).not.toBeInTheDocument();
    expect(screen.queryByText("Черновой материал")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Инструкции и руководства изготовителей" })).not.toBeInTheDocument();
  });

  it("shows a friendly unavailable message instead of an unusable open button", () => {
    render(<CourseLibraryReader courseId="course-1" />);

    const unavailableCard = screen.getByTestId("library-resource-unavailable");
    expect(unavailableCard).toHaveTextContent(
      "Ресурс временно недоступен. Обратитесь в учебный центр.",
    );
    expect(
      within(unavailableCard).queryByRole("button", {
        name: /Открыть материал|Перейти к источнику/,
      }),
    ).not.toBeInTheDocument();
  });
});
