import { downloadPrivateFile, type PrivateDownloadProgress } from "@/utils/storageHelpers";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrgDocumentWorkflowPanel } from "./documents/OrgDocumentWorkflowPanel";
import { useOrgDocumentVersions, type OrgDocumentVersion } from "@/hooks/useOrgDocumentVersions";
import { Loader2, Upload, Download, RotateCcw, History } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import type { ScopedOrgDocumentTransport } from "@/lib/programFiles";

interface OrgDocumentVersionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string | null;
  documentName: string;
  organizationId: string;
  onRestored?: () => void;
  canWrite?: boolean;
  transport?: ScopedOrgDocumentTransport;
  accept?: string;
  sourceOpenMode?: "default" | "download";
  sourceDownloadSignal?: AbortSignal;
  sourceDownloadAssertCurrent?: () => void;
}

export function OrgDocumentVersionsDialog({
  open,
  onOpenChange,
  documentId,
  documentName,
  organizationId,
  onRestored,
  canWrite = false,
  transport,
  accept,
  sourceOpenMode = "default",
  sourceDownloadSignal,
  sourceDownloadAssertCurrent,
}: OrgDocumentVersionsDialogProps) {
  const { versions, loading, loadError, hasLoaded, refresh, uploadVersion, restoreVersion, currentVersionId, canChange } = useOrgDocumentVersions(open ? documentId : null, canWrite, transport);
  const [uploading, setUploading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [summary, setSummary] = useState("");
  const [activeTab, setActiveTab] = useState("files");
  const [download, setDownload] = useState<{ versionId: string; progress: PrivateDownloadProgress } | null>(null);
  const downloadTask = useRef<{ controller: AbortController } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setActiveTab("files"); }, [documentId, open]);
  useEffect(() => {
    setDownload(null);
    return () => {
      const pending = downloadTask.current;
      downloadTask.current = null;
      pending?.controller.abort();
    };
  }, [documentId, open, transport?.key]);
  const assertDownloadCurrent = sourceDownloadAssertCurrent && transport
    ? () => { sourceDownloadAssertCurrent(); transport.assertCurrent(); }
    : sourceDownloadAssertCurrent || transport?.assertCurrent;
  const scopeCurrent = () => { try { assertDownloadCurrent?.(); return true; } catch { return false; } };
  const downloading = download?.progress === "preparing" || download?.progress === "downloading";
  const handleDownload = async (version: OrgDocumentVersion) => {
    if (downloadTask.current || !version.file_url || !open) return;
    const task = { controller: new AbortController() };
    downloadTask.current = task;
    const cancelScopedDownload = () => task.controller.abort();
    sourceDownloadSignal?.addEventListener("abort", cancelScopedDownload, { once: true });
    if (sourceDownloadSignal?.aborted) task.controller.abort();
    const latestProgress: { value: PrivateDownloadProgress } = { value: "failed" };
    setDownload({ versionId: version.id, progress: "preparing" });
    try {
      assertDownloadCurrent?.();
      const ok = await downloadPrivateFile("org-documents", version.file_path || version.file_url, version.file_name || documentName, {
        signal: task.controller.signal,
        assertCurrent: assertDownloadCurrent,
        signUrl: transport?.signUrl,
        onProgress: progress => {
          if (!scopeCurrent()) return;
          latestProgress.value = progress;
          if (downloadTask.current === task) setDownload({ versionId: version.id, progress });
        },
      });
      if (!scopeCurrent()) return;
      if (downloadTask.current === task) setDownload({ versionId: version.id,
        progress: ok ? "handed_to_browser" : latestProgress.value === "timed_out" ? "timed_out" : "failed" });
    } catch {
      if (!scopeCurrent()) return;
      if (downloadTask.current === task) setDownload({ versionId: version.id, progress: "failed" });
    } finally {
      sourceDownloadSignal?.removeEventListener("abort", cancelScopedDownload);
      if (downloadTask.current === task) downloadTask.current = null;
    }
  };

  const handleFile = async (file: File) => {
    if (!scopeCurrent()) return;
    setUploading(true);
    const ok = await uploadVersion({ organizationId, file, changeSummary: summary });
    if (!scopeCurrent()) return;
    setUploading(false);
    if (ok) {
      setSummary("");
      onRestored?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            История версий: {documentName}
          </DialogTitle>
          <DialogDescription className="sr-only">Просмотр сохранённых файлов. Замена и восстановление создают новую запись истории.</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} key={documentId}>
          <TabsList className="w-full h-auto"><TabsTrigger value="files" className="flex-1 min-w-0 whitespace-normal">Файлы и версии</TabsTrigger><TabsTrigger value="review" className="flex-1 min-w-0 whitespace-normal">Внутреннее согласование</TabsTrigger></TabsList>
          <TabsContent value="files" className="space-y-4">
        {canWrite && <div className="space-y-3 border-b border-border pb-4">
          <Textarea
            placeholder="Краткое описание изменений (необязательно)"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
          />
          <Input
            ref={fileRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={uploading || restoring || !canChange}
            className="w-full"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Загрузить новую версию
          </Button>
        </div>}

        <ScrollArea className="max-h-[400px]">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : loadError ? (
            <div role="alert" className="rounded-lg border p-3 space-y-2 text-sm">
              <p>{loadError}</p>
              <Button variant="outline" size="sm" onClick={() => void refresh()}>Повторить загрузку истории</Button>
            </div>
          ) : hasLoaded && versions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              История пока не велась. При следующей замене прежний файл сохранится снимком на дату операции.
            </div>
          ) : (
            <div className="space-y-2">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="flex items-start justify-between p-3 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="font-mono">v{v.version_number}</Badge>
                      {v.id === currentVersionId && <Badge variant="secondary">Текущая</Badge>}
                      {v.event_kind === "baseline" && <span className="text-xs text-muted-foreground">Снимок на дату операции</span>}
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(v.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
                      </span>
                      {v.uploaded_by_name && (
                        <span className="text-xs text-muted-foreground">· {v.uploaded_by_name}</span>
                      )}
                    </div>
                    {v.file_name && (
                      <div className="text-sm font-medium truncate">{v.file_name}</div>
                    )}
                    {v.change_summary && (
                      <div className="text-xs text-muted-foreground mt-1">{v.change_summary}</div>
                    )}
                    {download?.versionId === v.id && <div className="text-xs mt-1 space-y-1" role={download.progress === "failed" || download.progress === "timed_out" ? "alert" : "status"}>
                      <p className="text-muted-foreground">{{
                        preparing: "Подготавливаем файл…",
                        downloading: "Загружаем файл…",
                        handed_to_browser: "Файл передан браузеру для сохранения.",
                        failed: "Не удалось подготовить файл для скачивания. Повторите попытку.",
                        timed_out: "Не удалось получить файл за 45 секунд. Повторите попытку.",
                        cancelled: "Скачивание отменено.",
                      }[download.progress]}</p>
                      {(download.progress === "failed" || download.progress === "timed_out") && <Button variant="outline" size="sm" className="max-w-full h-auto whitespace-normal" onClick={() => void handleDownload(v)}>Повторить скачивание</Button>}
                    </div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {v.file_url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={downloading}
                        onClick={() => void handleDownload(v)}
                        title="Скачать"
                        aria-label="Скачать"
                      >
                        {downloading && download?.versionId === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={!canChange || uploading || restoring || !v.file_url || v.id === currentVersionId}
                      onClick={async () => {
                        if (!scopeCurrent()) return;
                        setRestoring(true);
                        try { const ok = await restoreVersion(v); if (scopeCurrent() && ok) onRestored?.(); }
                        finally { if (scopeCurrent()) setRestoring(false); }
                      }}
                      title="Сделать актуальной"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
          </TabsContent>
          <TabsContent value="review" className="max-h-[65vh] overflow-auto">
            {documentId && <OrgDocumentWorkflowPanel transport={transport} sourceOpenMode={sourceOpenMode} sourceDownloadSignal={sourceDownloadSignal} sourceDownloadAssertCurrent={sourceDownloadAssertCurrent} organizationId={organizationId} documentId={documentId} currentVersionId={currentVersionId} versions={versions} onOpenFiles={() => setActiveTab("files")} />}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
