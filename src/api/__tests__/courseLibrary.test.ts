import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  archiveCourseLibraryResource,
  createCourseLibraryResource,
  createLibrarySignedUrl,
  fetchCourseLibrary,
  fetchCourseLibraryShell,
  updateCourseLibraryResource,
  type CourseLibraryResource,
  type CourseLibraryResourceInput,
} from "@/api/courseLibrary";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  createSignedUrl: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  documentInsert: vi.fn(),
  documentInsertSelect: vi.fn(),
  documentInsertSingle: vi.fn(),
  documentUpdate: vi.fn(),
  documentUpdateEq: vi.fn(),
  assignmentInsert: vi.fn(),
  assignmentUpdate: vi.fn(),
  assignmentUpdateEq: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.from,
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    storage: { from: mocks.storageFrom },
  },
}));

const externalInput: CourseLibraryResourceInput = {
  courseId: "course-1",
  organizationId: "org-1",
  title: "  Правила безопасности  ",
  category: "legal_acts",
  description: "  Нормативный материал  ",
  sourceName: "  Официальный источник  ",
  externalUrl: "https://example.test/safety",
  moduleId: "module-1",
  editionLabel: "  редакция 2026  ",
  lastCheckedAt: "2026-09-01",
  usageBasis: "official_open_source",
  status: "active",
  sortOrder: 7,
  allowDownload: false,
};

const existingExternalResource: CourseLibraryResource = {
  assignmentId: "assignment-1",
  libraryDocumentId: "document-1",
  courseId: "course-1",
  moduleId: "module-1",
  moduleTitle: "Модуль 1",
  title: "Правила безопасности",
  category: "legal_acts",
  description: "Нормативный материал",
  sourceName: "Официальный источник",
  externalUrl: "https://example.test/safety",
  storagePath: null,
  mimeType: null,
  originalFilename: null,
  fileSize: null,
  editionLabel: "редакция 2026",
  lastCheckedAt: "2026-09-01",
  usageBasis: "official_open_source",
  status: "active",
  sortOrder: 7,
  allowDownload: false,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
};

function updateInput() {
  return {
    title: "  Новое название  ",
    category: "educational_materials" as const,
    description: "  Новое описание  ",
    sourceName: "  Новый источник  ",
    externalUrl: "https://example.test/updated",
    moduleId: "module-2",
    editionLabel: "  редакция 2  ",
    lastCheckedAt: "2026-09-02",
    usageBasis: "rights_holder_permission" as const,
    status: "needs_review" as const,
    sortOrder: 3,
    allowDownload: true,
  };
}

describe("course library API contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.rpc.mockResolvedValue({
      data: {
        course_id: "course-1",
        title: "Библиотека курса",
        library_only: true,
        modules: [
          { id: "module-2", title: "Модуль 2", order_index: 2 },
          { id: "module-1", title: "Модуль 1", order_index: 1 },
        ],
      },
      error: null,
    });
    mocks.upload.mockResolvedValue({ data: { path: "ignored" }, error: null });
    mocks.remove.mockResolvedValue({ data: [], error: null });
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://signed.example.test/resource" },
      error: null,
    });
    mocks.storageFrom.mockReturnValue({
      upload: mocks.upload,
      remove: mocks.remove,
      createSignedUrl: mocks.createSignedUrl,
    });

    mocks.documentInsertSingle.mockResolvedValue({ data: { id: "document-1" }, error: null });
    mocks.documentInsertSelect.mockReturnValue({ single: mocks.documentInsertSingle });
    mocks.documentInsert.mockReturnValue({ select: mocks.documentInsertSelect });
    mocks.documentUpdateEq.mockResolvedValue({ data: null, error: null });
    mocks.documentUpdate.mockReturnValue({ eq: mocks.documentUpdateEq });
    mocks.assignmentInsert.mockResolvedValue({ data: null, error: null });
    mocks.assignmentUpdateEq.mockResolvedValue({ data: null, error: null });
    mocks.assignmentUpdate.mockReturnValue({ eq: mocks.assignmentUpdateEq });

    mocks.from.mockImplementation((table: string) => {
      if (table === "library_documents") {
        return {
          insert: mocks.documentInsert,
          update: mocks.documentUpdate,
        };
      }
      if (table === "course_documents") {
        return {
          insert: mocks.assignmentInsert,
          update: mocks.assignmentUpdate,
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("loads only the column-limited electronic-library shell through the RPC", async () => {
    await expect(fetchCourseLibraryShell("course-1")).resolves.toEqual({
      courseId: "course-1",
      title: "Библиотека курса",
      libraryOnly: true,
      modules: [
        { id: "module-2", title: "Модуль 2", orderIndex: 2 },
        { id: "module-1", title: "Модуль 1", orderIndex: 1 },
      ],
    });

    expect(mocks.rpc).toHaveBeenCalledWith("get_course_electronic_library_shell", {
      p_course_id: "course-1",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects a malformed electronic-library shell instead of trusting extra table data", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        course_id: "course-1",
        title: "Библиотека курса",
        library_only: "yes",
        description: "must not be consumed",
      },
      error: null,
    });

    await expect(fetchCourseLibraryShell("course-1"))
      .rejects.toThrow("некорректную оболочку");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("authorizes the shell before querying visible library resources", async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const not = vi.fn().mockReturnValue({ order });
    const eq = vi.fn().mockReturnValue({ not });
    const select = vi.fn().mockReturnValue({ eq });
    mocks.from.mockReturnValue({ select });

    await expect(fetchCourseLibrary("course-1")).resolves.toEqual({
      resources: [],
      modules: [
        { id: "module-2", title: "Модуль 2", orderIndex: 2 },
        { id: "module-1", title: "Модуль 1", orderIndex: 1 },
      ],
    });

    expect(mocks.rpc.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.from.mock.invocationCallOrder[0]);
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.from).toHaveBeenCalledWith("course_documents");
  });

  it("creates one canonical external document and preserves course assignment metadata", async () => {
    await expect(createCourseLibraryResource(externalInput)).resolves.toBeUndefined();

    expect(mocks.storageFrom).not.toHaveBeenCalled();
    expect(mocks.documentInsert).toHaveBeenCalledWith({
      organization_id: "org-1",
      name: "Правила безопасности",
      type: "external_link",
      description: "Нормативный материал",
      file_url: null,
      file_size: null,
      source_name: "Официальный источник",
      external_url: "https://example.test/safety",
      storage_path: null,
      mime_type: null,
      original_filename: null,
      edition_label: "редакция 2026",
      last_checked_at: "2026-09-01",
      usage_basis: "official_open_source",
      library_status: "active",
      created_by: "user-1",
    });
    expect(mocks.assignmentInsert).toHaveBeenCalledWith({
      course_id: "course-1",
      name: "Правила безопасности",
      type: "library_resource",
      description: "Нормативный материал",
      file_url: null,
      library_document_id: "document-1",
      module_id: "module-1",
      library_category: "legal_acts",
      sort_order: 7,
      visible_to_students: true,
      allow_download: false,
    });
  });

  it("uploads an internal file only to private library-files and stores its exact metadata", async () => {
    const file = new File(["manual"], "Guide 2026.pdf", { type: "application/pdf" });

    await expect(createCourseLibraryResource({
      ...externalInput,
      externalUrl: null,
      file,
      allowDownload: true,
    })).resolves.toBeUndefined();

    expect(mocks.storageFrom).toHaveBeenCalledWith("library-files");
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const [storagePath, uploadedFile, options] = mocks.upload.mock.calls[0];
    expect(storagePath).toMatch(/^library\/org-1\/[0-9a-f-]+-Guide-2026\.pdf$/u);
    expect(uploadedFile).toBe(file);
    expect(options).toEqual({ contentType: "application/pdf", upsert: false });
    expect(mocks.documentInsert).toHaveBeenCalledWith(expect.objectContaining({
      type: "internal_file",
      external_url: null,
      storage_path: storagePath,
      mime_type: "application/pdf",
      original_filename: "Guide 2026.pdf",
      file_size: file.size,
    }));
  });

  it.each([
    { externalUrl: undefined, file: null, message: /ровно один источник/u },
    { externalUrl: "http://example.test/file", file: null, message: /HTTPS-ссылку/u },
    { externalUrl: "https://user:secret@example.test/file", file: null, message: /HTTPS-ссылку/u },
    {
      externalUrl: "https://example.test/file",
      file: new File(["x"], "file.pdf", { type: "application/pdf" }),
      message: /ровно один источник/u,
    },
    {
      externalUrl: null,
      file: { name: "not-a-file.pdf" } as File,
      message: /требуется файл/u,
    },
  ])("rejects invalid or ambiguous create location before any I/O", async ({ externalUrl, file, message }) => {
    await expect(createCourseLibraryResource({
      ...externalInput,
      externalUrl,
      file,
    })).rejects.toThrow(message);

    expect(mocks.storageFrom).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("removes an uploaded object when canonical document creation fails", async () => {
    const file = new File(["manual"], "guide.pdf", { type: "application/pdf" });
    mocks.documentInsertSingle.mockResolvedValueOnce({
      data: null,
      error: new Error("document insert failed"),
    });

    await expect(createCourseLibraryResource({
      ...externalInput,
      externalUrl: null,
      file,
    })).rejects.toThrow("document insert failed");

    const uploadedPath = mocks.upload.mock.calls[0][0];
    expect(mocks.remove).toHaveBeenCalledWith([uploadedPath]);
    expect(mocks.documentUpdate).not.toHaveBeenCalled();
    expect(mocks.assignmentInsert).not.toHaveBeenCalled();
  });

  it("archives the canonical document if course assignment creation fails", async () => {
    mocks.assignmentInsert.mockResolvedValueOnce({
      data: null,
      error: new Error("assignment insert failed"),
    });

    await expect(createCourseLibraryResource(externalInput))
      .rejects.toThrow("assignment insert failed");

    expect(mocks.documentUpdate).toHaveBeenCalledWith({ library_status: "archive" });
    expect(mocks.documentUpdateEq).toHaveBeenCalledWith("id", "document-1");
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("updates an external canonical card and its course assignment", async () => {
    await expect(updateCourseLibraryResource(existingExternalResource, updateInput()))
      .resolves.toBeUndefined();

    expect(mocks.documentUpdate).toHaveBeenCalledWith({
      name: "Новое название",
      description: "Новое описание",
      source_name: "Новый источник",
      external_url: "https://example.test/updated",
      edition_label: "редакция 2",
      last_checked_at: "2026-09-02",
      usage_basis: "rights_holder_permission",
      library_status: "needs_review",
    });
    expect(mocks.documentUpdateEq).toHaveBeenCalledWith("id", "document-1");
    expect(mocks.assignmentUpdate).toHaveBeenCalledWith({
      name: "Новое название",
      description: "Новое описание",
      module_id: "module-2",
      library_category: "educational_materials",
      sort_order: 3,
      allow_download: true,
    });
    expect(mocks.assignmentUpdateEq).toHaveBeenCalledWith("id", "assignment-1");
  });

  it("keeps an internal resource internal and rejects a second location before I/O", async () => {
    const internalResource: CourseLibraryResource = {
      ...existingExternalResource,
      externalUrl: null,
      storagePath: "library/org-1/document-1.pdf",
      mimeType: "application/pdf",
      originalFilename: "document-1.pdf",
      fileSize: 42,
    };

    await expect(updateCourseLibraryResource(internalResource, updateInput()))
      .rejects.toThrow(/нельзя одновременно/u);
    expect(mocks.from).not.toHaveBeenCalled();

    await expect(updateCourseLibraryResource(internalResource, {
      ...updateInput(),
      externalUrl: null,
    })).resolves.toBeUndefined();
    expect(mocks.documentUpdate).toHaveBeenCalledWith(expect.objectContaining({
      external_url: null,
    }));
  });

  it("archives a resource without deleting its canonical record", async () => {
    await expect(archiveCourseLibraryResource(existingExternalResource)).resolves.toBeUndefined();

    expect(mocks.documentUpdate).toHaveBeenCalledWith({ library_status: "archive" });
    expect(mocks.documentUpdateEq).toHaveBeenCalledWith("id", "document-1");
    expect(mocks.assignmentUpdate).not.toHaveBeenCalled();
  });

  it("creates only a short-lived signed URL from the private library-files bucket", async () => {
    await expect(createLibrarySignedUrl("library/org-1/document-1.pdf"))
      .resolves.toBe("https://signed.example.test/resource");

    expect(mocks.storageFrom).toHaveBeenCalledWith("library-files");
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(
      "library/org-1/document-1.pdf",
      10 * 60,
    );
  });
});
