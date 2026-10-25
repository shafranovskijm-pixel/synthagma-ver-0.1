import { runBoundedStorageScans } from './boundedStorageScans.ts';

// Confirmed private buckets. Never turn a failed signing request into a public URL.
export const MANAGED_PRIVATE_BUCKETS = new Set([
  "company-documents", "billing-documents", "library-files", "org-documents", "student-documents",
]);
const PAGE_SIZE = 500;
const MAX_PAGES = 20;
const LOAD_DEADLINE_MS = 45_000;
const REQUEST_DEADLINE_MS = 10_000;
export interface ManagedStorageEntry { bucket: string; path: string; size: number; createdAt: string; baseUrl: string; }
export interface ManagedStorageResult { entries: ManagedStorageEntry[]; errors: string[]; }
export interface ExternalStorageSource { client: any; baseUrl: string; }

export function validManagedStoragePath(path: string): boolean {
  return !!path && !path.startsWith("/") && !/[\\\u0000-\u001f?#]/.test(path)
    && !path.split("/").some(part => !part || part === "." || part === "..")
    && !/%(?:2f|5c|2e)/i.test(path);
}
export function managedStorageReference(reference: unknown, bucket: string, baseUrl: string): string | null {
  if (typeof reference !== "string" || !reference) return null;
  let path = reference;
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      if (url.origin !== new URL(baseUrl).origin) return null;
      const prefix = new RegExp("^/storage/v1/object/(?:public|sign|authenticated)/" + bucket + "/");
      if (!prefix.test(url.pathname)) return null;
      path = decodeURIComponent(url.pathname.replace(prefix, ""));
    } catch { return null; }
  }
  return validManagedStoragePath(path) ? path : null;
}
export function managedObjectPath(file: { folder: string; name: string }): string | null {
  const path = file.folder + "/" + file.name;
  return validManagedStoragePath(path) ? path : null;
}
export function managedPublicUrl(baseUrl: string, bucket: string, path: string): string {
  return baseUrl + "/storage/v1/object/public/" + bucket + "/" + path.split("/").map(encodeURIComponent).join("/");
}
export function storageRequestWithDeadline<T>(pending: PromiseLike<T>, signal?: AbortSignal, remaining = REQUEST_DEADLINE_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown, value?: T) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener("abort", abort);
      if (error) reject(error); else resolve(value as T);
    };
    const abort = () => finish(new Error("storage_request_cancelled"));
    const timer = setTimeout(() => finish(new Error("storage_request_deadline")), Math.max(1, Math.min(remaining, REQUEST_DEADLINE_MS)));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    // Always retain handlers on late SDK responses; they cannot update the completed load.
    Promise.resolve(pending).then(value => finish(undefined, value), error => finish(error));
  });
}

/** Current-user RLS queries only. No bucket-root scan or per-pupil folder listing. */
export async function loadManagedStorageEntries(
  client: any, organizationId: string, baseUrl: string,
  options: { signal?: AbortSignal; externalStorage?: () => Promise<ExternalStorageSource | null> } = {},
): Promise<ManagedStorageResult> {
  if (!organizationId || !validManagedStoragePath(organizationId) || organizationId.includes("/")) return { entries: [], errors: ["organization_scope"] };
  const deadline = Date.now() + LOAD_DEADLINE_MS;
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  options.signal?.addEventListener("abort", forwardAbort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timeout = setTimeout(forwardAbort, LOAD_DEADLINE_MS);
  const entries = new Map<string, ManagedStorageEntry>();
  const errors = new Set<string>();
  const active = () => !controller.signal.aborted && Date.now() < deadline;
  const wait = <T,>(pending: PromiseLike<T>) => storageRequestWithDeadline(pending, controller.signal, deadline - Date.now());
  const add = (bucket: string, path: string, size: unknown = 0, createdAt = "", origin = baseUrl) => {
    if (!active() || !validManagedStoragePath(path)) return;
    const key = bucket + "/" + path;
    if (entries.size >= 10_000 && !entries.has(key)) { errors.add("file_count_bound"); return; }
    const previous = entries.get(key);
    entries.set(key, { bucket, path, size: Math.max(previous?.size || 0, Number(size) || 0), createdAt: createdAt || previous?.createdAt || "", baseUrl: origin });
  };
  const pages = async (label: string, query: () => any): Promise<any[]> => {
    const rows: any[] = [];
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        if (!active()) throw new Error("storage_load_cancelled");
        const request = query().order("id", { ascending: true }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        const result: any = await wait(request.abortSignal(controller.signal));
        if (result.error || !Array.isArray(result.data)) throw new Error("storage_metadata_not_confirmed");
        rows.push(...result.data);
        if (result.data.length < PAGE_SIZE) return rows;
      }
      errors.add(label + "_page_bound");
    } catch { errors.add(label); }
    return rows;
  };
  const orgPath = (path: string) => path.startsWith(organizationId + "/") || path.startsWith("organizations/" + organizationId + "/");
  let folders = 0;
  const scan = async (storageClient: any, bucket: string, prefix: string, origin: string, depth = 0): Promise<void> => {
    if (!active()) { errors.add(bucket + "_deadline"); return; }
    if (++folders > 2_000) { errors.add("folder_count_bound"); return; }
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        if (!active()) throw new Error("storage_load_cancelled");
        const requestController = new AbortController();
        const abortRequest = () => requestController.abort();
        controller.signal.addEventListener("abort", abortRequest, { once: true });
        if (controller.signal.aborted) requestController.abort();
        let result: any;
        try {
          result = await wait(storageClient.storage.from(bucket).list(prefix, {
            limit: PAGE_SIZE, offset: page * PAGE_SIZE, sortBy: { column: "name", order: "asc" },
          }, { signal: requestController.signal }));
        } finally {
          controller.signal.removeEventListener("abort", abortRequest);
          // Installed Storage SDK forwards this signal to fetch. A timed-out scan
          // relinquishes its request before the worker starts another prefix.
          requestController.abort();
        }
        if (result.error || !Array.isArray(result.data)) throw new Error("storage_list_not_confirmed");
        for (const file of result.data) {
          if (!file || typeof file.name !== "string" || file.name.includes("/") || !validManagedStoragePath(file.name)) continue;
          const path = prefix + "/" + file.name;
          if (file.id === null) {
            if (depth < 2) await scan(storageClient, bucket, path, origin, depth + 1);
            else errors.add(bucket + "_depth_bound");
          } else add(bucket, path, file.metadata?.size, file.created_at, origin);
        }
        if (result.data.length < PAGE_SIZE) return;
      }
      errors.add(bucket + "_page_bound");
    } catch { errors.add(bucket); }
  };
  try {
    const [courses, companies, identities, enrollmentDocuments] = await Promise.all([
      pages("courses", () => client.from("courses").select("id").eq("organization_id", organizationId)),
      pages("companies", () => client.from("companies").select("id").eq("organization_id", organizationId)),
      pages("student_identity_documents", () => client.from("student_identity_documents").select("id,user_id,file_path,file_url,created_at").eq("organization_id", organizationId)),
      pages("student_documents", () => client.from("student_documents")
        .select("id,enrollment_id,file_url,created_at,enrollments!inner(courses!inner(organization_id))")
        .eq("enrollments.courses.organization_id", organizationId)),
    ]);
    for (const row of identities) {
      const path = managedStorageReference(row.file_path || row.file_url, "student-documents", baseUrl);
      if (path && typeof row.user_id === "string" && path.startsWith(row.user_id + "/")) add("student-documents", path, 0, row.created_at);
    }
    for (const row of enrollmentDocuments) {
      if (row.enrollments?.courses?.organization_id !== organizationId) continue;
      const path = managedStorageReference(row.file_url, "student-documents", baseUrl);
      if (path && path.startsWith("students/" + row.enrollment_id + "/")) add("student-documents", path, 0, row.created_at);
    }
    const companyIds = [...new Set(companies.map(row => row.id).filter(id => typeof id === "string"))];
    const companyTasks: Array<() => Promise<void>> = [];
    for (let start = 0; start < companyIds.length; start += 100) {
      const batch = companyIds.slice(start, start + 100);
      companyTasks.push(async () => {
        const documents = await pages("company_documents", () => client.from("company_documents")
          .select("id,company_id,file_path,file_url,file_size,uploaded_at").in("company_id", batch).is("deleted_at", null));
        for (const row of documents) {
          if (!batch.includes(row.company_id)) continue;
          const reference = row.file_path || row.file_url;
          for (const bucket of ["company-documents", "billing-documents"]) {
            const path = managedStorageReference(reference, bucket, baseUrl);
            if (path && (bucket === "company-documents" ? path.startsWith(row.company_id + "/") : orgPath(path))) {
              add(bucket, path, row.file_size, row.uploaded_at); break;
            }
          }
        }
      });
    }
    await runBoundedStorageScans(companyTasks, 3);
    const courseIds = [...new Set(courses.map(row => row.id).filter(id => typeof id === "string" && validManagedStoragePath(id) && !id.includes("/")))];
    const tasks: Array<() => Promise<void>> = [];
    for (const courseId of courseIds) {
      tasks.push(() => scan(client, "course-files", courseId, baseUrl));
      tasks.push(() => scan(client, "presentations", courseId, baseUrl));
    }
    // Standalone manager uploads/imports use orgId, while lesson files use courseId.
    tasks.push(() => scan(client, "course-files", organizationId, baseUrl));
    for (const bucket of ["org-documents", "org-branding", "billing-documents"]) tasks.push(() => scan(client, bucket, organizationId, baseUrl));
    tasks.push(() => scan(client, "billing-documents", "organizations/" + organizationId, baseUrl));
    tasks.push(() => scan(client, "library-files", "library/" + organizationId, baseUrl));
    if (courseIds.length && options.externalStorage) {
      try {
        const external = await wait(options.externalStorage());
        if (external) for (const courseId of courseIds) tasks.push(() => scan(external.client, "course-videos", courseId, external.baseUrl));
      } catch { errors.add("course-videos"); }
    }
    await runBoundedStorageScans(tasks, 3);
    if (!active()) errors.add("load_deadline_or_cancelled");
    return { entries: [...entries.values()], errors: [...errors] };
  } finally {
    clearTimeout(timeout); options.signal?.removeEventListener("abort", forwardAbort);
  }
}
