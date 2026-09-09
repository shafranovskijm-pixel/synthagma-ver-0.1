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

    mocks.documentInsertSelect.mockImplementation(() => {
      throw new Error("INSERT RETURNING cannot see the new card through its STABLE RLS helper");
    });
    mocks.documentInsert.mockReturnValue(Object.assign(
      Promise.resolve({ data: null, error: null }),
      { select: mocks.documentInsertSelect },
    ));
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

  it.each([
    { name: "omits a null-category row", category: null, hasDocument: true, expectedIds: [] },
    { name: "retains a categorized row", category: "educational_materials", hasDocument: true, expectedIds: ["assignment-1"] },
    { name: "still omits a missing joined document", category: "educational_materials", hasDocument: false, expectedIds: [] },
  ] as const)("$name without inventing a category", async ({ category, hasDocument, expectedIds }) => {
    const document = {
      id: "document-1", name: "Методический материал", description: null,
      source_name: "Учебный центр", external_url: null,
      storage_path: "library/org-1/document-1.pdf", mime_type: "application/pdf",
      original_filename: "Материал.pdf", file_size: 42, edition_label: null,
      last_checked_at: null, usage_basis: "own_material", library_status: "active",
      created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
    };
    const order = vi.fn().mockResolvedValue({ data: [{
      id: "assignment-1", course_id: "course-1", module_id: "module-1",
      library_category: category, sort_order: 1, allow_download: true,
      library_document: hasDocument ? document : null,
    }], error: null });
    const not = vi.fn().mockReturnValue({ order });
    const eq = vi.fn().mockReturnValue({ not });
    const select = vi.fn().mockReturnValue({ eq });
    mocks.from.mockReturnValue({ select });

    const result = await fetchCourseLibrary("course-1");

    expect(result.resources.map(resource => resource.assignmentId)).toEqual(expectedIds);
    if (expectedIds.length > 0) {
      expect(result.resources[0]).toMatchObject({
        category: "educational_materials", originalFilename: "Материал.pdf",
        moduleTitle: "Модуль 1", storagePath: "library/org-1/document-1.pdf",
      });
    }
    expect(eq).toHaveBeenCalledWith("course_id", "course-1");
    expect(mocks.storageFrom).not.toHaveBeenCalled();
  });

  it.each([
    { source_name: null },
    { usage_basis: null },
    { library_status: null },
    { source_name: null, usage_basis: null, library_status: null },
  ])("retains incomplete administrator metadata without changing it: %j", async (missing) => {
    const document = {
      id: "document-draft", name: "Черновая методичка", description: null,
      source_name: "Учебный центр", external_url: null,
      storage_path: "library/org-1/draft.pdf", mime_type: "application/pdf",
      original_filename: "Черновик.pdf", file_size: 42, edition_label: null,
      last_checked_at: null, usage_basis: "own_material", library_status: "needs_review",
      created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
      ...missing,
    };
    const order = vi.fn().mockResolvedValue({ data: [{
      id: "assignment-draft", course_id: "course-1", module_id: null,
      library_category: "educational_materials", sort_order: 1, allow_download: true,
      library_document: document,
    }], error: null });
    const not = vi.fn().mockReturnValue({ order });
    const eq = vi.fn().mockReturnValue({ not });
    const select = vi.fn().mockReturnValue({ eq });
    mocks.from.mockReturnValue({ select });

    const { resources } = await fetchCourseLibrary("course-1");

    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatchObject({
      assignmentId: "assignment-draft", libraryDocumentId: "document-draft",
      sourceName: document.source_name, usageBasis: document.usage_basis,
      status: document.library_status, originalFilename: "Черновик.pdf",
    });
    expect(mocks.documentInsert).not.toHaveBeenCalled();
    expect(mocks.documentUpdate).not.toHaveBeenCalled();
    expect(mocks.assignmentUpdate).not.toHaveBeenCalled();
    expect(mocks.storageFrom).not.toHaveBeenCalled();
  });

  it("creates one canonical external document and preserves course assignment metadata", async () => {
    await expect(createCourseLibraryResource(externalInput)).resolves.toBeUndefined();

    expect(mocks.storageFrom).not.toHaveBeenCalled();
    const documentId = mocks.documentInsert.mock.calls[0][0].id;
    expect(documentId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
    expect(mocks.documentInsertSelect).not.toHaveBeenCalled();
    expect(mocks.documentInsert).toHaveBeenCalledWith({
      id: documentId,
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
      library_document_id: documentId,
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

  it("uses an ASCII object basename while retaining a Cyrillic original filename", async () => {
    const file = new File(["manual"], "Методические материалы.pdf", { type: "application/pdf" });

    await expect(createCourseLibraryResource({ ...externalInput, externalUrl: null, file }))
      .resolves.toBeUndefined();

    const [storagePath, uploadedFile] = mocks.upload.mock.calls[0];
    expect(storagePath).toMatch(/^library\/org-1\/[0-9a-f-]+-material\.pdf$/u);
    expect(uploadedFile).toBe(file);
    expect(mocks.documentInsert).toHaveBeenCalledWith(expect.objectContaining({
      storage_path: storagePath, original_filename: "Методические материалы.pdf",
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
    mocks.documentInsert.mockResolvedValueOnce({
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
    expect(mocks.documentUpdateEq).toHaveBeenCalledWith("id", mocks.documentInsert.mock.calls[0][0].id);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("keeps an RLS-denied external insert failed without assignment or false compensation", async () => {
    const error = { code: "42501", message: "new row violates row-level security policy" };
    mocks.documentInsert.mockResolvedValueOnce({ data: null, error });

    await expect(createCourseLibraryResource(externalInput)).rejects.toEqual(error);

    expect(mocks.assignmentInsert).not.toHaveBeenCalled();
    expect(mocks.documentUpdate).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("uses distinct canonical IDs for separate creates and links each exact ID", async () => {
    await createCourseLibraryResource(externalInput);
    await createCourseLibraryResource(externalInput);

    const ids = mocks.documentInsert.mock.calls.map(([input]) => input.id);
    expect(new Set(ids).size).toBe(2);
    expect(mocks.assignmentInsert.mock.calls.map(([input]) => input.library_document_id)).toEqual(ids);
    expect(mocks.documentInsertSelect).not.toHaveBeenCalled();
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
