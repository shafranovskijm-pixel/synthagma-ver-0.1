import { supabase } from "@/integrations/supabase/client";
import type {
  CourseLibraryCategory,
  CourseLibraryStatus,
  CourseLibraryUsageBasis,
} from "@/lib/courseLibrary";
import { isValidHttpsUrl } from "@/lib/courseLibrary";

const libraryDb = supabase as any;

export interface CourseLibraryModule {
  id: string;
  title: string;
  orderIndex: number;
}

export interface CourseLibraryShell {
  courseId: string;
  title: string;
  libraryOnly: boolean;
  modules: CourseLibraryModule[];
}

export interface CourseLibraryResource {
  assignmentId: string;
  libraryDocumentId: string;
  courseId: string;
  moduleId: string | null;
  moduleTitle: string | null;
  title: string;
  category: CourseLibraryCategory;
  description: string | null;
  sourceName: string;
  externalUrl: string | null;
  storagePath: string | null;
  mimeType: string | null;
  originalFilename: string | null;
  fileSize: number | null;
  editionLabel: string | null;
  lastCheckedAt: string | null;
  usageBasis: CourseLibraryUsageBasis;
  status: CourseLibraryStatus;
  sortOrder: number;
  allowDownload: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CourseLibraryResourceInput {
  courseId: string;
  organizationId: string;
  title: string;
  category: CourseLibraryCategory;
  description?: string | null;
  sourceName: string;
  externalUrl?: string | null;
  moduleId?: string | null;
  editionLabel?: string | null;
  lastCheckedAt?: string | null;
  usageBasis: CourseLibraryUsageBasis;
  status?: CourseLibraryStatus;
  sortOrder?: number;
  allowDownload?: boolean;
  file?: File | null;
}

type RawLibraryAssignment = {
  id: string;
  course_id: string;
  module_id: string | null;
  library_category: CourseLibraryCategory;
  sort_order: number | null;
  allow_download: boolean | null;
  library_document: {
    id: string;
    name: string;
    description: string | null;
    source_name: string;
    external_url: string | null;
    storage_path: string | null;
    mime_type: string | null;
    original_filename: string | null;
    file_size: number | null;
    edition_label: string | null;
    last_checked_at: string | null;
    usage_basis: CourseLibraryUsageBasis;
    library_status: CourseLibraryStatus;
    created_at: string;
    updated_at: string;
  } | null;
};

function storageSafeFilename(name: string): string {
  const cleaned = name
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-120);
  return cleaned || "material";
}

type ValidatedCreateLocation =
  | { kind: "external"; externalUrl: string; file: null }
  | { kind: "internal"; externalUrl: null; file: File };

function normalizedOptionalString(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

/**
 * Validate the resource location before storage or database I/O. The database
 * repeats these invariants, but the API must fail closed so a caller outside
 * the dialog cannot create an ambiguous or insecure resource.
 */
function validateCreateLocation(
  input: Pick<CourseLibraryResourceInput, "externalUrl" | "file">,
): ValidatedCreateLocation {
  const externalUrl = normalizedOptionalString(input.externalUrl);
  const file = input.file ?? null;

  if ((externalUrl === null) === (file === null)) {
    throw new Error("Укажите ровно один источник: корректную HTTPS-ссылку или внутренний файл.");
  }

  if (file !== null) {
    if (typeof File === "undefined" || !(file instanceof File)) {
      throw new Error("Для внутреннего ресурса требуется файл.");
    }
    return { kind: "internal", externalUrl: null, file };
  }

  if (!isValidHttpsUrl(externalUrl)) {
    throw new Error("Внешний ресурс должен иметь корректную абсолютную HTTPS-ссылку без логина и пароля.");
  }

  return { kind: "external", externalUrl, file: null };
}

function validateUpdateLocation(
  resource: Pick<CourseLibraryResource, "externalUrl" | "storagePath">,
  externalUrlInput: string | null | undefined,
): string | null {
  const storedExternalUrl = normalizedOptionalString(resource.externalUrl);
  const storagePath = normalizedOptionalString(resource.storagePath);
  const externalUrl = normalizedOptionalString(externalUrlInput);

  if (storedExternalUrl !== null && storagePath !== null) {
    throw new Error("У ресурса обнаружено несколько источников. Архивируйте карточку и создайте новую.");
  }

  if (storagePath !== null) {
    if (externalUrl !== null) {
      throw new Error("Для внутреннего файла нельзя одновременно указывать внешнюю ссылку.");
    }
    return null;
  }

  if (externalUrl === null || !isValidHttpsUrl(externalUrl)) {
    throw new Error("Внешний ресурс должен иметь корректную абсолютную HTTPS-ссылку без логина и пароля.");
  }

  return externalUrl;
}

function mapResource(
  row: RawLibraryAssignment,
  moduleTitles: Map<string, string>,
): CourseLibraryResource | null {
  const doc = row.library_document;
  if (!doc) return null;
  return {
    assignmentId: row.id,
    libraryDocumentId: doc.id,
    courseId: row.course_id,
    moduleId: row.module_id,
    moduleTitle: row.module_id ? moduleTitles.get(row.module_id) ?? null : null,
    title: doc.name,
    category: row.library_category,
    description: doc.description,
    sourceName: doc.source_name,
    externalUrl: doc.external_url,
    storagePath: doc.storage_path,
    mimeType: doc.mime_type,
    originalFilename: doc.original_filename,
    fileSize: doc.file_size == null ? null : Number(doc.file_size),
    editionLabel: doc.edition_label,
    lastCheckedAt: doc.last_checked_at,
    usageBasis: doc.usage_basis,
    status: doc.library_status,
    sortOrder: row.sort_order ?? 0,
    allowDownload: row.allow_download !== false,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
  };
}

export async function fetchCourseLibraryShell(courseId: string): Promise<CourseLibraryShell> {
  const normalizedCourseId = courseId.trim();
  if (!normalizedCourseId) throw new Error("Не указан курс электронной библиотеки.");

  const { data, error } = await libraryDb.rpc("get_course_electronic_library_shell", {
    p_course_id: normalizedCourseId,
  });
  if (error) throw error;

  const shell = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null;
  if (
    !shell
    || shell.course_id !== normalizedCourseId
    || typeof shell.title !== "string"
    || typeof shell.library_only !== "boolean"
  ) {
    throw new Error("Сервер вернул некорректную оболочку электронной библиотеки.");
  }

  const modulesInput = Array.isArray(shell.modules) ? shell.modules : [];
  const modules: CourseLibraryModule[] = modulesInput.map((value) => {
    const module = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
    if (!module || typeof module.id !== "string" || typeof module.title !== "string") {
      throw new Error("Сервер вернул некорректный список модулей электронной библиотеки.");
    }
    return {
      id: module.id,
      title: module.title,
      orderIndex: typeof module.order_index === "number" ? module.order_index : 0,
    };
  });

  return {
    courseId: normalizedCourseId,
    title: shell.title,
    libraryOnly: shell.library_only,
    modules,
  };
}

export async function fetchCourseLibrary(courseId: string): Promise<{
  resources: CourseLibraryResource[];
  modules: CourseLibraryModule[];
}> {
  // Authorize and resolve the minimal course/module shell before querying
  // resource rows. This prevents a denied deep link from issuing any library
  // table request and keeps draft course/module rows out of the REST surface.
  const shell = await fetchCourseLibraryShell(courseId);
  const resourcesResult = await libraryDb
    .from("course_documents")
    .select(`
        id,
        course_id,
        module_id,
        library_category,
        sort_order,
        allow_download,
        library_document:library_documents!course_documents_library_document_id_fkey(
          id,
          name,
          description,
          source_name,
          external_url,
          storage_path,
          mime_type,
          original_filename,
          file_size,
          edition_label,
          last_checked_at,
          usage_basis,
          library_status,
          created_at,
          updated_at
        )
      `)
    .eq("course_id", courseId)
    .not("library_document_id", "is", null)
    .order("sort_order", { ascending: true });

  if (resourcesResult.error) throw resourcesResult.error;

  const modules = shell.modules;
  const moduleTitles = new Map(modules.map((module) => [module.id, module.title]));
  const resources = (resourcesResult.data ?? [])
    .map((row: RawLibraryAssignment) => mapResource(row, moduleTitles))
    .filter((resource: CourseLibraryResource | null): resource is CourseLibraryResource => resource !== null);

  return { resources, modules };
}

async function uploadLibraryFile(
  organizationId: string,
  file: File,
): Promise<{ storagePath: string; mimeType: string; originalFilename: string; fileSize: number }> {
  const storagePath = `library/${organizationId}/${crypto.randomUUID()}-${storageSafeFilename(file.name)}`;
  const { error } = await supabase.storage
    .from("library-files")
    .upload(storagePath, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;
  return {
    storagePath,
    mimeType: file.type || "application/octet-stream",
    originalFilename: file.name,
    fileSize: file.size,
  };
}

export async function createCourseLibraryResource(
  input: CourseLibraryResourceInput,
): Promise<void> {
  const location = validateCreateLocation(input);
  let uploadedPath: string | null = null;
  let documentId: string | null = null;

  try {
    const uploaded = location.kind === "internal"
      ? await uploadLibraryFile(input.organizationId, location.file)
      : null;
    uploadedPath = uploaded?.storagePath ?? null;

    const { data: document, error: documentError } = await libraryDb
      .from("library_documents")
      .insert({
        organization_id: input.organizationId,
        name: input.title.trim(),
        type: uploaded ? "internal_file" : "external_link",
        description: input.description?.trim() || null,
        file_url: null,
        file_size: uploaded?.fileSize ?? null,
        source_name: input.sourceName.trim(),
        external_url: location.externalUrl,
        storage_path: uploaded?.storagePath ?? null,
        mime_type: uploaded?.mimeType ?? null,
        original_filename: uploaded?.originalFilename ?? null,
        edition_label: input.editionLabel?.trim() || null,
        last_checked_at: input.lastCheckedAt || null,
        usage_basis: input.usageBasis,
        library_status: input.status ?? "active",
        created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      })
      .select("id")
      .single();
    if (documentError) throw documentError;
    documentId = document.id;

    const { error: assignmentError } = await libraryDb.from("course_documents").insert({
      course_id: input.courseId,
      name: input.title.trim(),
      type: "library_resource",
      description: input.description?.trim() || null,
      file_url: null,
      library_document_id: documentId,
      module_id: input.moduleId || null,
      library_category: input.category,
      sort_order: input.sortOrder ?? 0,
      visible_to_students: true,
      allow_download: input.allowDownload !== false,
    });
    if (assignmentError) throw assignmentError;
  } catch (error) {
    if (documentId) {
      await libraryDb
        .from("library_documents")
        .update({ library_status: "archive" })
        .eq("id", documentId);
    } else if (uploadedPath) {
      await supabase.storage.from("library-files").remove([uploadedPath]);
    }
    throw error;
  }
}

export async function updateCourseLibraryResource(
  resource: CourseLibraryResource,
  input: Omit<CourseLibraryResourceInput, "courseId" | "organizationId" | "file">,
): Promise<void> {
  const externalUrl = validateUpdateLocation(resource, input.externalUrl);
  const { error: documentError } = await libraryDb
    .from("library_documents")
    .update({
      name: input.title.trim(),
      description: input.description?.trim() || null,
      source_name: input.sourceName.trim(),
      external_url: externalUrl,
      edition_label: input.editionLabel?.trim() || null,
      last_checked_at: input.lastCheckedAt || null,
      usage_basis: input.usageBasis,
      library_status: input.status ?? resource.status,
    })
    .eq("id", resource.libraryDocumentId);
  if (documentError) throw documentError;

  const { error: assignmentError } = await libraryDb
    .from("course_documents")
    .update({
      name: input.title.trim(),
      description: input.description?.trim() || null,
      module_id: input.moduleId || null,
      library_category: input.category,
      sort_order: input.sortOrder ?? resource.sortOrder,
      allow_download: input.allowDownload !== false,
    })
    .eq("id", resource.assignmentId);
  if (assignmentError) throw assignmentError;
}

export async function archiveCourseLibraryResource(resource: CourseLibraryResource): Promise<void> {
  const { error } = await libraryDb
    .from("library_documents")
    .update({ library_status: "archive" })
    .eq("id", resource.libraryDocumentId);
  if (error) throw error;
}

export async function createLibrarySignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("library-files")
    .createSignedUrl(storagePath, 10 * 60);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Не удалось получить временную ссылку на файл");
  return data.signedUrl;
}
