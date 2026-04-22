import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
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
}

export function OrgDocumentVersionsDialog({
  open,
  onOpenChange,
  documentId,
  documentName,
  organizationId,
  onRestored,
}: OrgDocumentVersionsDialogProps) {
  const { versions, loading, uploadVersion, restoreVersion } = useOrgDocumentVersions(documentId);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

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
        </DialogHeader>

        <div className="space-y-3 border-b border-border pb-4">
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
            disabled={uploading}
            className="w-full"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Загрузить новую версию
          </Button>
        </div>

        <ScrollArea className="max-h-[400px]">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Версий пока нет. Первая загрузка будет помечена как v1.
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
                        onClick={() => window.open(v.file_url!, "_blank")}
                        title="Скачать"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={async () => {
                        const ok = await restoreVersion(v);
                        if (ok) onRestored?.();
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
      </DialogContent>
    </Dialog>
  );
}
