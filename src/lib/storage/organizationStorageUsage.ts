import { runBoundedStorageScans } from "./boundedStorageScans";

const STORAGE_USAGE_CACHE_TTL_MS = 30_000;

interface CachedUsage {
  bytes: number;
  expiresAt: number;
}

const usageCache = new Map<string, CachedUsage>();
const inFlightUsage = new Map<string, Promise<number>>();

const ORG_STORAGE_PREFIXES = [
  "org-documents",
  "company-documents",
  "org-branding",
  "billing-documents",
  "student-documents",
] as const;

async function calculateOrganizationStorageUsage(client: any, organizationId: string): Promise<number> {
  const { data: courseRows } = await client
    .from("courses")
    .select("id")
    .eq("organization_id", organizationId);
  const courseIds = (courseRows || []).map((course: { id: string }) => course.id);
  let totalBytes = 0;

  const scanPath = async (bucket: string, prefix: string, depth = 0): Promise<void> => {
    try {
      const { data: items } = await client.storage.from(bucket).list(prefix, { limit: 500 });
      if (!items) return;

      for (const file of items) {
        if (file.id === null && depth < 2) {
          await scanPath(bucket, `${prefix}/${file.name}`, depth + 1);
        } else if (file.id !== null) {
          totalBytes += Number(file.metadata?.size) || 0;
        }
      }
    } catch {
      // Missing or inaccessible prefixes count as zero, matching previous UI behavior.
    }
  };

  const tasks: Array<() => Promise<void>> = [];
  for (const courseId of courseIds) {
    tasks.push(() => scanPath("course-files", courseId));
    tasks.push(() => scanPath("presentations", courseId));
  }
  for (const bucket of ORG_STORAGE_PREFIXES) {
    tasks.push(() => scanPath(bucket, organizationId));
  }
  tasks.push(() => scanPath("library-files", `library/${organizationId}`));

  await runBoundedStorageScans(tasks, 3);
  return totalBytes;
}

export async function getOrganizationStorageUsage(
  client: any,
  organizationId: string,
  now = Date.now(),
): Promise<number> {
  const cached = usageCache.get(organizationId);
  if (cached && cached.expiresAt > now) return cached.bytes;

  const existing = inFlightUsage.get(organizationId);
  if (existing) return existing;

  const request = calculateOrganizationStorageUsage(client, organizationId)
    .then((bytes) => {
      usageCache.set(organizationId, { bytes, expiresAt: Date.now() + STORAGE_USAGE_CACHE_TTL_MS });
      return bytes;
    })
    .finally(() => {
      inFlightUsage.delete(organizationId);
    });

  inFlightUsage.set(organizationId, request);
  return request;
}
