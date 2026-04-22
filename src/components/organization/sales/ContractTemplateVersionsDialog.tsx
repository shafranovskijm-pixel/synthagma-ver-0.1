import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { diffWords } from "diff";
import { History, RotateCcw, GitCompareArrows } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useContractTemplateVersions, type ContractTemplateVersion } from "@/hooks/useContractTemplateVersions";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  templateId: string | null;
  currentBody: string;
}

function stripHtml(html: string) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.innerText.replace(/\s+/g, " ").trim();
}

export function ContractTemplateVersionsDialog({ open, onOpenChange, templateId, currentBody }: Props) {
  const { versions, loading, restore } = useContractTemplateVersions(open ? templateId : null);
  const [compareWith, setCompareWith] = useState<ContractTemplateVersion | null>(null);

  const diff = useMemo(() => {
    if (!compareWith) return null;
    const a = stripHtml(compareWith.body_html);
    const b = stripHtml(currentBody);
    return diffWords(a, b);
  }, [compareWith, currentBody]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            История версий шаблона
          </DialogTitle>
        </DialogHeader>

        {compareWith && diff ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm">
                Сравнение: <Badge variant="outline">v{compareWith.version}</Badge> ↔ текущая
              </p>
              <Button variant="ghost" size="sm" onClick={() => setCompareWith(null)}>
                ← К списку
              </Button>
            </div>
            <ScrollArea className="h-[55vh] rounded-lg border bg-muted/30 p-3">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {diff.map((part, i) => (
                  <span
                    key={i}
                    className={
                      part.added
                        ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-0.5 rounded"
                        : part.removed
                        ? "bg-destructive/20 text-destructive px-0.5 rounded line-through"
                        : ""
                    }
                  >
                    {part.value}
                  </span>
                ))}
              </p>
            </ScrollArea>
            <Button
              variant="outline"
              className="rounded-xl gap-1.5 w-full"
              onClick={async () => {
                const ok = await restore(compareWith);
                if (ok) onOpenChange(false);
              }}
            >
              <RotateCcw className="w-4 h-4" />
              Восстановить версию №{compareWith.version}
            </Button>
          </div>
        ) : loading ? (
          <p className="text-center text-muted-foreground py-8 text-sm">Загрузка...</p>
        ) : versions.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">
            История пуста. Сохраните шаблон, чтобы создать первую версию.
          </p>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 pr-3">
              {versions.map((v) => (
                <div key={v.id} className="rounded-xl border p-3 space-y-2 hover:bg-muted/40 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge>v{v.version}</Badge>
                      <span className="text-sm font-medium truncate">{v.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(v.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
                    </div>
                  </div>
                  {v.created_by_name && (
                    <p className="text-xs text-muted-foreground">Автор: {v.created_by_name}</p>
                  )}
                  <p className="text-xs text-muted-foreground line-clamp-2 font-mono">
                    {stripHtml(v.body_html).slice(0, 180)}
                    {stripHtml(v.body_html).length > 180 ? "..." : ""}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl gap-1.5"
                      onClick={() => setCompareWith(v)}
                    >
                      <GitCompareArrows className="w-3.5 h-3.5" />
                      Сравнить с текущей
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-xl gap-1.5"
                      onClick={async () => {
                        const ok = await restore(v);
                        if (ok) onOpenChange(false);
                      }}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Восстановить
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
