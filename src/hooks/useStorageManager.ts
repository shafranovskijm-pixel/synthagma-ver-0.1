import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";

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

  const getSignedUrl = useCallback(async (bucket: string, path: string): Promise<string | null> => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    if (error) { console.error("Error creating signed URL:", error); return null; }
    return data.signedUrl;
  }, []);

  const getFileUrl = useCallback(async (file: StorageFile): Promise<string> => {
    if (file.isPrivate) {
      const path = `${file.folder}/${file.name}`;
      const signed = await getSignedUrl(file.bucket, path);
      return signed || file.url;
    }
    return file.url;
  }, [getSignedUrl]);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const allFiles: StorageFile[] = [];
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const scanPath = async (client: any, bucket: string, prefix: string, urlBase: string, depth = 0, isPrivateBucket = false) => {
        try {
          const { data: items } = await client.storage.from(bucket).list(prefix, { limit: 500 });
          if (!items) return;
          for (const f of items) {
            if (f.id === null && depth < 2) { await scanPath(client, bucket, `${prefix}/${f.name}`, urlBase, depth + 1, isPrivateBucket); }
            else if (f.id !== null) {
              if (isHiddenArtifact(f.name)) continue;
              const fileSize = (f.metadata as any)?.size || 0;
              if (fileSize === 0 || !f.name.includes('.')) continue;
              allFiles.push({ name: f.name, url: isPrivateBucket ? "" : `${urlBase}/storage/v1/object/public/${bucket}/${prefix}/${f.name}`, bucket, folder: prefix, size: fileSize, created_at: (f as any).created_at || "", type: getFileType(f.name), isPrivate: isPrivateBucket });
            }
          }
        } catch { /* path doesn't exist */ }
      };
      const { data: courses } = await supabase.from("courses").select("id").eq("organization_id", organizationId);
      const courseIds = courses?.map(c => c.id) || [];
      const courseScans = courseIds.flatMap(courseId => [scanPath(supabase, "course-files", courseId, baseUrl), scanPath(supabase, "presentations", courseId, baseUrl)]);
      const orgScans = [
        scanPath(supabase, "org-documents", organizationId, baseUrl), scanPath(supabase, "company-documents", organizationId, baseUrl),
        scanPath(supabase, "org-branding", organizationId, baseUrl), scanPath(supabase, "library-files", `library/${organizationId}`, baseUrl),
        scanPath(supabase, "billing-documents", organizationId, baseUrl), scanPath(supabase, "student-documents", organizationId, baseUrl, 0, true),
      ];
      await Promise.all([...courseScans, ...orgScans]);
      try {
        const { data: config } = await safeInvoke<any>("get-external-storage-config");
        if (config?.configured && config?.url && config?.key) {
          const { createClient } = await import("@supabase/supabase-js");
          const extClient = createClient(config.url, config.key);
          await Promise.all(courseIds.map(courseId => scanPath(extClient, "course-videos", courseId, config.url)));
        }
      } catch { /* external not configured */ }
      allFiles.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      setFiles(allFiles);
    } catch (err) { console.error("Error loading storage files:", err); toast.error("Ошибка загрузки файлов"); }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const handleDelete = async () => {
    if (!deleteFile) return;
    setDeleting(true);
    try {
      const path = `${deleteFile.folder}/${deleteFile.name}`;
      if (deleteFile.bucket === "course-videos") {
        const { data: config } = await safeInvoke<any>("get-external-storage-config");
        if (config?.configured && config?.url && config?.key) {
          const { createClient } = await import("@supabase/supabase-js");
          const extClient = createClient(config.url, config.key);
          await extClient.storage.from("course-videos").remove([path]);
        }
      } else { await supabase.storage.from(deleteFile.bucket).remove([path]); }
      setFiles(prev => prev.filter(f => !(f.bucket === deleteFile.bucket && f.folder === deleteFile.folder && f.name === deleteFile.name)));
      toast.success("Файл удалён");
    } catch (err) { console.error("Delete error:", err); toast.error("Ошибка удаления файла"); }
    setDeleting(false); setDeleteFile(null);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const bucket = "course-files"; const path = `${organizationId}/${file.name}`; const baseUrl = import.meta.env.VITE_SUPABASE_URL;
    try {
      const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
      if (error) throw error;
      setFiles(prev => [{ name: file.name, url: `${baseUrl}/storage/v1/object/public/${bucket}/${path}`, bucket, folder: organizationId, size: file.size, created_at: new Date().toISOString(), type: getFileType(file.name) }, ...prev]);
      toast.success("Файл загружен");
    } catch (err) { console.error("Upload error:", err); toast.error("Ошибка загрузки файла"); }
    setUploading(false); e.target.value = "";
  };

  const openPreview = async (file: StorageFile) => { setPreviewFile(file); setPreviewLoading(true); const url = await getFileUrl(file); setPreviewUrl(url); setPreviewLoading(false); };
  const openInNewTab = async (file: StorageFile) => { const url = await getFileUrl(file); window.open(url, "_blank"); };
  const downloadFile = async (file: StorageFile) => { const url = await getFileUrl(file); const a = document.createElement("a"); a.href = url; a.download = file.name; a.target = "_blank"; document.body.appendChild(a); a.click(); document.body.removeChild(a); };
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
    files, loading, search, setSearch, typeFilter, setTypeFilter, bucketFilter, setBucketFilter,
    expandedBuckets, deleteFile, setDeleteFile, deleting, uploading, previewFile, setPreviewFile,
    previewUrl, setPreviewUrl, previewLoading, loadFiles, handleDelete, handleUpload,
    openPreview, openInNewTab, downloadFile, toggleBucket, filtered, groupedByBucket,
    totalSize, bucketCounts, typeCounts,
  };
}
