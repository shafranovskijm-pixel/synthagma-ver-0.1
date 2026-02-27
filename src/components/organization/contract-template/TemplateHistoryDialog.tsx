import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface TemplateHistoryEntry {
  text: string;
  savedAt: string;
  templateName: string;
}

interface TemplateHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  history: TemplateHistoryEntry[];
  onRestore: (text: string) => void;
}

export function TemplateHistoryDialog({ open, onOpenChange, history, onRestore }: TemplateHistoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            История версий шаблона
          </DialogTitle>
        </DialogHeader>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            История пуста. Версии сохраняются автоматически при каждом сохранении.
          </p>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-3">
              {history.map((entry, i) => (
                <div key={i} className="rounded-xl border p-3 space-y-2 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">
                      {entry.templateName || "Без имени"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(entry.savedAt), "d MMM yyyy, HH:mm", { locale: ru })}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 font-mono">
                    {entry.text.slice(0, 150)}...
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl gap-1.5"
                    onClick={() => {
                      onRestore(entry.text);
                      onOpenChange(false);
                    }}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Восстановить
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
