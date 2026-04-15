import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, X, FileText} from "lucide-react";

interface FilePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileUrl: string;
  fileName: string;
  fileType: string | null;
  allowDownload?: boolean;
}

const PREVIEWABLE_TYPES = ["pdf"];
const OFFICE_PREVIEWABLE = ["doc", "docx", "xls", "xlsx", "ppt", "pptx"];

function canPreviewInline(fileType: string | null): boolean {
  if (!fileType) return false;
  return PREVIEWABLE_TYPES.includes(fileType.toLowerCase());
}

function canPreviewViaOffice(fileType: string | null): boolean {
  if (!fileType) return false;
  return OFFICE_PREVIEWABLE.includes(fileType.toLowerCase());
}

function getOfficeViewerUrl(fileUrl: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
}

function getGoogleDocsViewerUrl(fileUrl: string): string {
  return `https://docs.google.com/gview?url=${encodeURIComponent(fileUrl)}&embedded=true`;
}

export function FilePreviewDialog({ open, onOpenChange, fileUrl, fileName, fileType, allowDownload = true }: FilePreviewDialogProps) {
  const [isLoading, setIsLoading] = useState(true);

  const isPdf = canPreviewInline(fileType);
  const isOffice = canPreviewViaOffice(fileType);
  const canPreview = isPdf || isOffice;

  // PDF: use Google Docs viewer to avoid X-Frame-Options blocks
  // Office: use Microsoft Office Online viewer
  const previewUrl = isPdf
    ? getGoogleDocsViewerUrl(fileUrl)
    : isOffice
      ? getOfficeViewerUrl(fileUrl)
      : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-base font-medium truncate pr-4">{fileName}</DialogTitle>
          {allowDownload && (
            <div className="flex items-center gap-2 shrink-0">
              <a href={fileUrl} target="_blank" rel="noopener noreferrer">
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
                src={previewUrl}
                className="w-full h-full border-0"
                onLoad={() => setIsLoading(false)}
                title={fileName}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
              <FileText className="w-16 h-16 text-muted-foreground/40" />
              <p className="text-muted-foreground text-center">
                Предпросмотр недоступен для файлов типа <strong>{fileType?.toUpperCase() || "—"}</strong>
              </p>
              <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                <Button className="gap-2">
                  <ExternalLink className="w-4 h-4" />
                  Открыть файл
                </Button>
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
