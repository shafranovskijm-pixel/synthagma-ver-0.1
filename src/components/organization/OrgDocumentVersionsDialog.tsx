import { downloadPrivateFile } from "@/utils/storageHelpers";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrgDocumentWorkflowPanel } from "./documents/OrgDocumentWorkflowPanel";
import { useOrgDocumentVersions } from "@/hooks/useOrgDocumentVersions";
import { Loader2, Upload, Download, RotateCcw, History } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface OrgDocumentVersionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string | null;
  documentName: string;
  organizationId: string;
  onRestored?: () => void;
  canWrite?: boolean;
}

export function OrgDocumentVersionsDialog({
  open,
  onOpenChange,
  documentId,
  documentName,
  organizationId,
  onRestored,
  canWrite = false,
}: OrgDocumentVersionsDialogProps) {
  const { versions, loading, loadError, hasLoaded, refresh, uploadVersion, restoreVersion, currentVersionId, canChange } = useOrgDocumentVersions(open ? documentId : null, canWrite);
  const [uploading, setUploading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [summary, setSummary] = useState("");
  const [activeTab, setActiveTab] = useState("files");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setActiveTab("files"); }, [documentId, open]);

  const handleFile = async (file: File) => {
    setUploading(true);
    const ok = await uploadVersion({ organizationId, file, changeSummary: summary });
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
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {v.file_url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={async () => { if (!await downloadPrivateFile("org-documents", v.file_path || v.file_url!, v.file_name || documentName)) toast.error("Не удалось скачать документ"); }}
                        title="Скачать"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={!canChange || uploading || restoring || !v.file_url || v.id === currentVersionId}
                      onClick={async () => {
                        setRestoring(true);
                        try { const ok = await restoreVersion(v); if (ok) onRestored?.(); }
                        finally { setRestoring(false); }
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
            {documentId && <OrgDocumentWorkflowPanel organizationId={organizationId} documentId={documentId} currentVersionId={currentVersionId} versions={versions} onOpenFiles={() => setActiveTab("files")} />}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
