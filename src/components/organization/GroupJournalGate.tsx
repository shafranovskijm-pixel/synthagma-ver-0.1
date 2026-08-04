import { Loader2, ShieldAlert, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type GroupJournalContext,
  groupUnsupportedReason,
  resolveGroupGateState,
} from "@/lib/journals/groupJournalContext";

interface GroupJournalGateProps {
  journalType: string;
  groupContext?: GroupJournalContext | null;
  onClose?: () => void;
  children: React.ReactNode;
}

/**
 * Не даёт журналу отрисовать данные всей организации, пока состав группы не загружен,
 * и явно блокирует журналы, которые нельзя связать с учениками.
 */
export function GroupJournalGate({ journalType, groupContext, onClose, children }: GroupJournalGateProps) {
  const state = resolveGroupGateState(journalType, groupContext);

  if (state === "loading") {
    return (
      <div className="bg-card rounded-2xl border border-border p-10 flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Загружаем состав группы…</p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="bg-card rounded-2xl border border-destructive/40 p-8 flex flex-col items-center gap-3 text-center">
        <ShieldAlert className="w-7 h-7 text-destructive" />
        <div>
          <p className="font-semibold">Не удалось загрузить состав группы</p>
          <p className="text-sm text-muted-foreground mt-1">
            {groupContext?.errorMessage || "Журнал не показан, чтобы не раскрыть данные других учеников."}
          </p>
        </div>
        {onClose && (
          <Button variant="outline" className="rounded-xl" onClick={onClose}>
            Вернуться к списку журналов
          </Button>
        )}
      </div>
    );
  }

  if (state === "unsupported") {
    return (
      <div className="bg-card rounded-2xl border border-amber-500/40 p-8 flex flex-col items-center gap-3 text-center">
        <Lock className="w-7 h-7 text-amber-500" />
        <div>
          <p className="font-semibold">Журнал недоступен в контексте группы</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">{groupUnsupportedReason(journalType)}</p>
          <p className="text-xs text-muted-foreground mt-2">
            Откройте раздел «Журналы» без контекста группы, чтобы работать с ним по организации.
          </p>
        </div>
        {onClose && (
          <Button variant="outline" className="rounded-xl" onClick={onClose}>
            Вернуться к списку журналов
          </Button>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
