import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { proxiedAssetUrl } from "@/utils/proxyFetch";
import { toast } from "sonner";
import { getSignedStorageUrl, downloadPrivateFile } from "@/utils/storageHelpers";
import { loadManagedStorageEntries, MANAGED_PRIVATE_BUCKETS, managedObjectPath, managedPublicUrl, storageRequestWithDeadline, validManagedStoragePath } from "@/lib/storage/managedStorageFiles";

export interface StorageFile {
  name: string;
  url: string;
  bucket: string;
  folder: string;
  size: number;
  created_at: string;
  type: "video" | "image" | "audio" | "document" | "presentation" | "other";
  isPrivate?: boolean;
}

const VIDEO_EXT = ["mp4", "webm", "ogg", "mov", "avi", "mkv"];
const IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"];
const AUDIO_EXT = ["mp3", "wav", "ogg", "m4a", "aac", "flac"];
const DOC_EXT = ["pdf", "doc", "docx", "xls", "xlsx", "rtf", "txt", "csv"];
const PRES_EXT = ["ppt", "pptx", "odp", "key"];
const HIDDEN_EXT = ["wmf", "emf"];

export function getFileExt(name: string): string { return name.split(".").pop()?.toLowerCase() || ""; }
export function getFileType(name: string): StorageFile["type"] {
  const ext = getFileExt(name);
  if (VIDEO_EXT.includes(ext)) return "video";
  if (IMAGE_EXT.includes(ext)) return "image";
  if (AUDIO_EXT.includes(ext)) return "audio";
  if (PRES_EXT.includes(ext)) return "presentation";
  if (DOC_EXT.includes(ext)) return "document";
  return "other";
}
function isHiddenArtifact(name: string): boolean { return HIDDEN_EXT.includes(getFileExt(name)); }

const PREVIEWABLE_IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp", "svg"];
const PREVIEWABLE_VIDEO_EXT = ["mp4", "webm"];
const PREVIEWABLE_AUDIO_EXT = ["mp3", "wav"];
const PREVIEWABLE_PDF_EXT = ["pdf"];
export function getPreviewType(name: string): "image" | "video" | "audio" | "pdf" | "none" {
  const ext = getFileExt(name);
  if (PREVIEWABLE_IMAGE_EXT.includes(ext)) return "image";
  if (PREVIEWABLE_VIDEO_EXT.includes(ext)) return "video";
  if (PREVIEWABLE_AUDIO_EXT.includes(ext)) return "audio";
  if (PREVIEWABLE_PDF_EXT.includes(ext)) return "pdf";
  return "none";
}
export function formatSize(bytes: number): string {
  if (bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
}
export function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try { return new Date(dateStr).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
}

export const BUCKET_LABELS: Record<string, string> = {
  "all": "Все разделы", "presentations": "Презентации", "course-files": "Файлы курсов",
  "course-videos": "Видео курсов", "org-documents": "Документы организации",
  "company-documents": "Документы компаний", "org-branding": "Брендинг",
  "library-files": "Библиотека", "billing-documents": "Платёжные документы",
  "student-documents": "Документы слушателей",
};
export const TYPE_LABELS: Record<string, string> = {
  all: "Все типы", video: "Видео", image: "Изображения", audio: "Аудио",
  presentation: "Презентации", document: "Документы", other: "Прочее",
};

export function useStorageManager(organizationId: string) {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [bucketFilter, setBucketFilter] = useState("all");
  const [expandedBuckets, setExpandedBuckets] = useState<Record<string, boolean>>({});
  const [deleteFile, setDeleteFile] = useState<StorageFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<StorageFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const loadRequest = useRef(0);
  const activeLoad = useRef<AbortController | null>(null);
  const previewRequest = useRef(0);
  const currentOrganization = useRef(organizationId);
  const loadedOrganization = useRef<string | null>(null);
  if (currentOrganization.current !== organizationId) loadedOrganization.current = null;
  currentOrganization.current = organizationId;

  const externalStorage = useCallback(async () => {
    const { data: config, error } = await safeInvoke<any>("get-external-storage-config");
    if (error) throw error;
    if (!config?.configured || !config?.url || !config?.key) return null;
    const { createClient } = await import("@supabase/supabase-js");
    return { client: createClient(config.url, config.key), baseUrl: config.url };
  }, []);

  const getFileUrl = useCallback(async (file: StorageFile): Promise<string | null> => {
    const path = managedObjectPath(file);
    if (!path || loadedOrganization.current !== organizationId || !files.some(item => item.bucket === file.bucket && managedObjectPath(item) === path)) return null;
    if (MANAGED_PRIVATE_BUCKETS.has(file.bucket) || file.isPrivate) {
      try { return await storageRequestWithDeadline(getSignedStorageUrl(file.bucket, path)); }
      catch { return null; }
    }
    return file.url || null;
  }, [files, organizationId]);

  const loadFiles = useCallback(async () => {
    activeLoad.current?.abort();
    const controller = new AbortController(); activeLoad.current = controller;
    const request = ++loadRequest.current;
    const scope = organizationId;
    setLoading(true); setLoadErrors([]);
    try {
      const result = await loadManagedStorageEntries(supabase, scope, import.meta.env.VITE_SUPABASE_URL, {
        signal: controller.signal, externalStorage,
      });
      if (request !== loadRequest.current || currentOrganization.current !== scope || controller.signal.aborted) return;
      const loaded: StorageFile[] = result.entries.flatMap(entry => {
        const split = entry.path.lastIndexOf("/");
        const name = entry.path.slice(split + 1);
        if (split < 1 || isHiddenArtifact(name)) return [];
        const isPrivate = MANAGED_PRIVATE_BUCKETS.has(entry.bucket);
        return [{ name, folder: entry.path.slice(0, split), bucket: entry.bucket,
          url: isPrivate ? "" : proxiedAssetUrl(managedPublicUrl(entry.baseUrl, entry.bucket, entry.path)),
          size: entry.size, created_at: entry.createdAt, type: getFileType(name), isPrivate }];
      });
      loaded.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      loadedOrganization.current = scope;
      setFiles(loaded); setLoadErrors(result.errors);
    } catch {
      if (request === loadRequest.current && currentOrganization.current === scope) setLoadErrors(["load_failed"]);
    } finally {
      if (request === loadRequest.current && currentOrganization.current === scope) setLoading(false);
    }
  }, [organizationId, externalStorage]);

  useEffect(() => {
    setFiles([]); setPreviewFile(null); setPreviewUrl(null); setDeleteFile(null);
    previewRequest.current++;
    void loadFiles();
    return () => { activeLoad.current?.abort(); loadRequest.current++; previewRequest.current++; };
  }, [loadFiles]);

  const handleDelete = async () => {
    const target = deleteFile;
    if (!target) return;
    const path = managedObjectPath(target);
    const scope = organizationId;
    if (!path || loadedOrganization.current !== scope || !files.some(file => file.bucket === target.bucket && managedObjectPath(file) === path)) {
      toast.error("Файл не принадлежит текущему списку. Обновите хранилище."); return;
    }
    setDeleting(true);
    try {
      let storageClient: any = supabase;
      if (target.bucket === "course-videos") {
        const external = await storageRequestWithDeadline(externalStorage());
        if (!external) throw new Error("external_storage_not_available");
        storageClient = external.client;
      }
      const result: any = await storageRequestWithDeadline(storageClient.storage.from(target.bucket).remove([path]));
      if (result.error || !Array.isArray(result.data) || !result.data.some((item: any) => item?.name === path)) throw new Error("storage_delete_not_confirmed");
      if (currentOrganization.current === scope) {
        setFiles(prev => prev.filter(file => !(file.bucket === target.bucket && managedObjectPath(file) === path)));
        toast.success("Файл удалён");
      }
    } catch { if (currentOrganization.current === scope) toast.error("Удаление файла не подтверждено. Файл сохранён в списке; обновите хранилище."); }
    finally { setDeleting(false); if (currentOrganization.current === scope) setDeleteFile(null); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    const scope = organizationId;
    const bucket = "course-files";
    const path = scope + "/" + file.name;
    if (!scope || file.name.includes("/") || !validManagedStoragePath(path)) {
      toast.error("Недопустимое имя файла"); input.value = ""; return;
    }
    setUploading(true);
    try {
      // A same-name upload must not overwrite a file already referenced by a course.
      const result: any = await storageRequestWithDeadline(supabase.storage.from(bucket).upload(path, file, { upsert: false }));
      if (result.error || result.data?.path !== path) throw new Error("storage_upload_not_confirmed");
      if (currentOrganization.current === scope) {
        setFiles(prev => [{ name: file.name, url: proxiedAssetUrl(managedPublicUrl(import.meta.env.VITE_SUPABASE_URL, bucket, path)),
          bucket, folder: scope, size: file.size, created_at: new Date().toISOString(), type: getFileType(file.name), isPrivate: false },
          ...prev.filter(existing => !(existing.bucket === bucket && managedObjectPath(existing) === path))]);
        toast.success("Файл загружен");
      }
    } catch { if (currentOrganization.current === scope) toast.error("Загрузка файла не подтверждена. Обновите хранилище; если имя уже занято, переименуйте файл."); }
    finally { setUploading(false); input.value = ""; }
  };

  const openPreview = async (file: StorageFile) => {
    const request = ++previewRequest.current; const scope = organizationId;
    setPreviewFile(file); setPreviewUrl(null); setPreviewLoading(true);
    try {
      const url = await getFileUrl(file);
      if (request !== previewRequest.current || currentOrganization.current !== scope) return;
      setPreviewUrl(url);
      if (!url) toast.error("Не удалось открыть файл. Проверьте доступ или обновите хранилище.");
    } finally { if (request === previewRequest.current && currentOrganization.current === scope) setPreviewLoading(false); }
  };
  const openInNewTab = async (file: StorageFile) => {
    const path = managedObjectPath(file);
    if (!path || loadedOrganization.current !== organizationId || !files.some(item => item.bucket === file.bucket && managedObjectPath(item) === path)) return;
    if (MANAGED_PRIVATE_BUCKETS.has(file.bucket) || file.isPrivate) {
      const target = window.open("about:blank", "_blank");
      if (!target) { toast.error("Браузер заблокировал открытие файла"); return; }
      target.opener = null;
      const scope = organizationId;
      try {
        const url = await getFileUrl(file);
        if (!url || currentOrganization.current !== scope) { target.close(); toast.error("Не удалось открыть файл"); return; }
        target.location.replace(url);
      } catch { target.close(); toast.error("Не удалось открыть файл"); }
    } else if (file.url) window.open(file.url, "_blank", "noopener");
  };
  const downloadFile = async (file: StorageFile) => {
    const path = managedObjectPath(file);
    if (!path || loadedOrganization.current !== organizationId || !files.some(item => item.bucket === file.bucket && managedObjectPath(item) === path)) return;
    if (MANAGED_PRIVATE_BUCKETS.has(file.bucket) || file.isPrivate) {
      if (!await downloadPrivateFile(file.bucket, path, file.name)) toast.error("Не удалось скачать файл");
      return;
    }
    if (!file.url) return;
    const link = document.createElement("a"); link.href = file.url; link.download = file.name; link.target = "_blank"; link.rel = "noopener";
    document.body.appendChild(link); link.click(); link.remove();
  };
  const toggleBucket = (bucket: string) => setExpandedBuckets(prev => ({ ...prev, [bucket]: !prev[bucket] }));

  const filtered = useMemo(() => files.filter(f => (bucketFilter === "all" || f.bucket === bucketFilter) && (typeFilter === "all" || f.type === typeFilter) && (!search || f.name.toLowerCase().includes(search.toLowerCase()))), [files, bucketFilter, typeFilter, search]);
  const groupedByBucket = useMemo(() => {
    const groups: Record<string, StorageFile[]> = {};
    for (const f of filtered) { if (!groups[f.bucket]) groups[f.bucket] = []; groups[f.bucket].push(f); }
    const order = Object.keys(BUCKET_LABELS).filter(k => k !== "all");
    const sorted: [string, StorageFile[]][] = [];
    for (const b of order) { if (groups[b]) sorted.push([b, groups[b]]); }
    for (const [b, fs] of Object.entries(groups)) { if (!sorted.find(([k]) => k === b)) sorted.push([b, fs]); }
    return sorted;
  }, [filtered]);

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const bucketCounts = useMemo(() => { const acc: Record<string, number> = {}; for (const f of files) { acc[f.bucket] = (acc[f.bucket] || 0) + 1; } return acc; }, [files]);
  const typeCounts = useMemo(() => { const acc: Record<string, number> = {}; for (const f of files) { acc[f.type] = (acc[f.type] || 0) + 1; } return acc; }, [files]);

  return {
    files, loading, loadErrors, search, setSearch, typeFilter, setTypeFilter, bucketFilter, setBucketFilter,
    expandedBuckets, deleteFile, setDeleteFile, deleting, uploading, previewFile, setPreviewFile,
    previewUrl, setPreviewUrl, previewLoading, loadFiles, handleDelete, handleUpload,
    openPreview, openInNewTab, downloadFile, toggleBucket, filtered, groupedByBucket,
    totalSize, bucketCounts, typeCounts,
  };
}
