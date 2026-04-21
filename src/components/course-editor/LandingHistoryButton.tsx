import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { History, Undo2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface HistoryRow {
  id: string;
  created_at: string;
  source: string | null;
  snapshot: any;
}

interface Props {
  courseId: string;
  /** Колбэк после успешного отката, чтобы родитель мог обновить превью/состояние. */
  onReverted?: () => void;
}

/**
 * Кнопка «История версий лендинга». Открывает диалог со списком сохранённых
 * снимков `landing_content` (создаются автоматически триггером в БД при каждом
 * изменении). Из списка можно откатиться к любой предыдущей версии.
 *
 * Хранится максимум 10 последних версий на курс — старые удаляются триггером.
 */
export function LandingHistoryButton({ courseId, onReverted }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [reverting, setReverting] = useState<string | null>(null);
  const [confirmRow, setConfirmRow] = useState<HistoryRow | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("course_landing_history")
        .select("id, created_at, source, snapshot")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (cancelled) return;
      if (error) {
        toast.error("Не удалось загрузить историю", { description: error.message });
      } else {
        setRows((data ?? []) as HistoryRow[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, courseId]);

  const handleRevert = async (row: HistoryRow) => {
    setReverting(row.id);
    try {
      const { error } = await supabase
        .from("courses")
        .update({ landing_content: row.snapshot })
        .eq("id", courseId);
      if (error) throw error;
      toast.success("Версия восстановлена", {
        description: "Откройте конструктор страницы, чтобы доработать содержимое.",
      });
      setConfirmRow(null);
      setOpen(false);
      onReverted?.();
    } catch (e: any) {
      toast.error("Не удалось восстановить версию", { description: e?.message });
    } finally {
      setReverting(null);
    }
  };

  const formatSource = (src: string | null): string => {
    if (!src) return "Ручное изменение";
    if (src === "manual") return "Ручное изменение";
    if (src.startsWith("template:")) {
      const id = src.slice(9);
      return `Шаблон: ${id}`;
    }
    return src;
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <History className="w-3.5 h-3.5" />
        История версий
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>История версий лендинга</DialogTitle>
            <DialogDescription>
              Сохраняются последние 10 версий. Откат восстановит содержимое страницы,
              но текущая версия тоже будет сохранена в истории — её можно вернуть обратно.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="py-10 flex justify-center"><SigmaSpinner /></div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground text-center">
              Пока нет сохранённых версий — они появятся после первого изменения лендинга.
            </p>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <ul className="space-y-2 pr-2">
                {rows.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{formatSource(row.source)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(row.created_at), { addSuffix: true, locale: ru })}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 shrink-0"
                      onClick={() => setConfirmRow(row)}
                      disabled={reverting !== null}
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      Восстановить
                    </Button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmRow} onOpenChange={(o) => !o && setConfirmRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Восстановить эту версию?</AlertDialogTitle>
            <AlertDialogDescription>
              Текущее содержимое лендинга будет заменено выбранной версией.
              Текущая версия автоматически сохранится в истории — её можно будет вернуть обратно.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reverting !== null}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmRow && handleRevert(confirmRow)}
              disabled={reverting !== null}
              className="gap-2"
            >
              {reverting && <SigmaSpinner size="sm" />}
              Восстановить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
