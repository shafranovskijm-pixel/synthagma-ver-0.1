import { supabase } from "@/integrations/supabase/client";
import type {
  CourseLibraryCategory,
  CourseLibraryStatus,
  CourseLibraryUsageBasis,
} from "@/lib/courseLibrary";

const libraryDb = supabase as any;

export interface CourseLibraryModule {
  id: string;
  title: string;
  orderIndex: number;
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

export async function fetchCourseLibrary(courseId: string): Promise<{
  resources: CourseLibraryResource[];
  modules: CourseLibraryModule[];
}> {
  const [resourcesResult, modulesResult] = await Promise.all([
    libraryDb
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
      .order("sort_order", { ascending: true }),
    libraryDb
      .from("course_modules")
      .select("id, title, order_index")
      .eq("course_id", courseId)
      .order("order_index", { ascending: true }),
  ]);

  if (resourcesResult.error) throw resourcesResult.error;
  if (modulesResult.error) throw modulesResult.error;

  const modules: CourseLibraryModule[] = (modulesResult.data ?? []).map((row: any) => ({
    id: row.id,
    title: row.title,
    orderIndex: row.order_index ?? 0,
  }));
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
  let uploadedPath: string | null = null;
  let documentId: string | null = null;

  try {
    const uploaded = input.file
      ? await uploadLibraryFile(input.organizationId, input.file)
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
        external_url: uploaded ? null : input.externalUrl?.trim() || null,
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
  const { error: documentError } = await libraryDb
    .from("library_documents")
    .update({
      name: input.title.trim(),
      description: input.description?.trim() || null,
      source_name: input.sourceName.trim(),
      external_url: resource.storagePath ? null : input.externalUrl?.trim() || null,
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
