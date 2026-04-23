import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  recordingUrl: string | null;
}

/**
 * Модальное окно быстрого превью MP4-записи вебинара.
 * Не загружает LiveKit — просто <video src=…>, что гораздо быстрее «Войти в эфир».
 */
export const RecordingPreviewDialog = ({ open, onOpenChange, title, recordingUrl }: Props) => {
  const copyLink = () => {
    if (!recordingUrl) return;
    navigator.clipboard.writeText(recordingUrl);
    toast.success("Ссылка на запись скопирована");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{title}</DialogTitle>
        </DialogHeader>
        {recordingUrl ? (
          <>
            <div className="aspect-video w-full bg-black rounded-md overflow-hidden">
              <video
                key={recordingUrl}
                src={recordingUrl}
                controls
                playsInline
                preload="metadata"
                className="w-full h-full"
              />
            </div>
            <div className="flex flex-wrap gap-2 justify-end pt-2">
              <Button variant="outline" size="sm" onClick={copyLink}>
                <Copy className="w-4 h-4 mr-1.5" />
                Скопировать ссылку
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={recordingUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-1.5" />В новой вкладке
                </a>
              </Button>
              <Button variant="default" size="sm" asChild>
                <a href={recordingUrl} download>
                  <Download className="w-4 h-4 mr-1.5" />Скачать MP4
                </a>
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">Запись недоступна</p>
        )}
      </DialogContent>
    </Dialog>
  );
};
