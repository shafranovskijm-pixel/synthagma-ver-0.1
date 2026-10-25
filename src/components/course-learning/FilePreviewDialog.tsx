import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, X, FileText} from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { courseDocumentPreview } from "@/lib/courseDocumentPreview";

interface FilePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileUrl: string;
  fileName: string;
  fileType: string | null;
  allowDownload?: boolean;
}

export function FilePreviewDialog({ open, onOpenChange, fileUrl, fileName, fileType, allowDownload = true }: FilePreviewDialogProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [previewFailed, setPreviewFailed] = useState(false);
  useEffect(() => { setIsLoading(true); setPreviewFailed(false); }, [open, fileUrl]);

  const preview = courseDocumentPreview(fileUrl, fileType, [import.meta.env.VITE_SUPABASE_URL, window.location.origin], window.location.origin);
  const canPreview = preview.previewUrl !== null && !previewFailed;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-base font-medium truncate pr-4">{fileName}</DialogTitle>
          {allowDownload && preview.sourceUrl && (
            <div className="flex items-center gap-2 shrink-0">
              <a href={preview.sourceUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-2">
                  <Download className="w-4 h-4" />
                  Скачать
                </Button>
              </a>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 relative overflow-hidden bg-muted/30">
          {canPreview ? (
            <>
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center z-10 bg-background/80">
                  <div className="flex flex-col items-center gap-3">
                    <SigmaSpinner size="lg" />
                    <p className="text-sm text-muted-foreground">Загрузка предпросмотра…</p>
                  </div>
                </div>
              )}
              <iframe
                src={preview.previewUrl ?? undefined}
                referrerPolicy="no-referrer"
                sandbox={preview.mode === "native_pdf" ? "allow-downloads" : undefined}
                className="w-full h-full border-0"
                onLoad={() => setIsLoading(false)}
                onErrorCapture={() => { setIsLoading(false); setPreviewFailed(true); }}
                title={fileName}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
              <FileText className="w-16 h-16 text-muted-foreground/40" />
              <p className="text-muted-foreground text-center">
                {preview.mode === "direct_only" ? "Откройте документ в новой вкладке или скачайте его." : <>Предпросмотр недоступен для файлов типа <strong>{fileType?.toUpperCase() || "—"}</strong></>}
              </p>
              {preview.sourceUrl && <a href={preview.sourceUrl} target="_blank" rel="noopener noreferrer">
                <Button className="gap-2">
                  <ExternalLink className="w-4 h-4" />
                  Открыть файл
                </Button>
              </a>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
