import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { History, RotateCcw, Plus, Trash2, Sparkles, FileUp, Wand2, Save, ShieldCheck } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { type CourseSnapshot, getSnapshotReasonLabel } from "@/hooks/useCourseSnapshots";

const reasonIcon = (reason: string) => {
  switch (reason) {
    case "before_ai_review":
      return <ShieldCheck className="w-4 h-4" />;
    case "before_ai_generate":
      return <Wand2 className="w-4 h-4" />;
    case "before_import":
      return <FileUp className="w-4 h-4" />;
    case "before_restore":
      return <RotateCcw className="w-4 h-4" />;
    case "manual":
    default:
      return <Save className="w-4 h-4" />;
  }
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshots: CourseSnapshot[];
  isLoading: boolean;
  isCreating: boolean;
  isRestoring: boolean;
  onCreate: () => void;
  onRestore: (id: string) => Promise<boolean>;
  onDelete: (id: string) => void;
}

export function CourseSnapshotsDialog({
  open,
  onOpenChange,
  snapshots,
  isLoading,
  isCreating,
  isRestoring,
  onCreate,
  onRestore,
  onDelete,
}: Props) {
  const [confirmRestore, setConfirmRestore] = useState<CourseSnapshot | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CourseSnapshot | null>(null);

  const handleRestore = async () => {
    if (!confirmRestore) return;
    const ok = await onRestore(confirmRestore.id);
    if (ok) {
      setConfirmRestore(null);
      onOpenChange(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              История версий курса
            </DialogTitle>
            <DialogDescription>
              Снимки курса автоматически создаются перед AI-операциями и импортом. Вы также можете сохранить версию вручную в любой момент.
              Хранятся 30 дней.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              Всего версий: <span className="font-medium text-foreground">{snapshots.length}</span>
            </div>
            <Button onClick={onCreate} disabled={isCreating} size="sm" className="gap-2">
              {isCreating ? <SigmaSpinner size="xs" /> : <Plus className="w-4 h-4" />}
              Сохранить текущую версию
            </Button>
          </div>

          <ScrollArea className="flex-1 max-h-[60vh] pr-2">
            {isLoading && snapshots.length === 0 ? (
              <div className="flex justify-center py-12"><SigmaSpinner /></div>
            ) : snapshots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                <Sparkles className="w-10 h-10 text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">
                  Версий пока нет. Они появятся автоматически перед AI-проверкой, AI-генерацией или импортом.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {snapshots.map((snap) => {
                  const date = new Date(snap.created_at);
                  const dateStr = date.toLocaleString("ru-RU", {
                    day: "2-digit",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  return (
                    <div
                      key={snap.id}
                      className="rounded-xl border border-border bg-card hover:bg-accent/30 transition-colors p-3 flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          {reasonIcon(snap.reason)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-sm">
                              {snap.label || getSnapshotReasonLabel(snap.reason)}
                            </span>
                            <Badge variant="outline" className="text-[10px] h-5">
                              {getSnapshotReasonLabel(snap.reason)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{dateStr}</p>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="default"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => setConfirmRestore(snap)}
                          disabled={isRestoring}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Восстановить
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmDelete(snap)}
                          title="Удалить версию"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmRestore} onOpenChange={(v) => !v && setConfirmRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Восстановить версию курса?</AlertDialogTitle>
            <AlertDialogDescription>
              Текущее содержимое курса (уроки, тесты, документы) будет заменено на содержимое выбранной версии.
              Перед заменой автоматически создастся снимок «Перед восстановлением», чтобы можно было откатиться обратно.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring}>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore} disabled={isRestoring}>
              {isRestoring ? "Восстановление..." : "Восстановить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить версию?</AlertDialogTitle>
            <AlertDialogDescription>
              Восстановить эту версию после удаления будет невозможно.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) onDelete(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
