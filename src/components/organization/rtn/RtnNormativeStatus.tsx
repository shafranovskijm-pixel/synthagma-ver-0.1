import { useMutation } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkRtnNormativeBasis, type RtnNormativeQueueReceipt } from "@/api/rtn-npa-staff";
import type { RtnBank } from "@/types/rostechnadzor";

export function normativeCheckLabel(status: RtnBank["latest_check_status"]): string {
  switch (status) {
    case "queued": return "Проверка нормативных оснований в очереди";
    case "running": return "Проверяем нормативные основания…";
    case "unchanged": return "Последняя проверка: подтверждённых изменений нет";
    case "needs_subject_review": return "Найдены изменения — нужна предметная проверка";
    case "partial_coverage": return "Проверена часть оснований — полная актуальность не подтверждена";
    case "unknown": return "Актуальность не удалось подтвердить";
    case "error": return "Ошибка проверки нормативных оснований";
    default: return "Нормативные основания автоматически ещё не проверены";
  }
}

export function RtnNormativeStatus({ organizationId, bank, canManage, pending, timedOut = false, onQueued, refresh }: {
  organizationId: string; bank: RtnBank; canManage: boolean; pending: boolean; timedOut?: boolean;
  onQueued: (receipt: RtnNormativeQueueReceipt) => void; refresh: () => void;
}) {
  const mutation = useMutation({
    mutationFn: () => checkRtnNormativeBasis(organizationId, bank.id),
    onSuccess: onQueued,
  });
  const installed = bank.admission_basis !== undefined;
  const serverBusy = bank.latest_check_status === "queued" || bank.latest_check_status === "running";
  const busy = pending || mutation.isPending || (serverBusy && !timedOut);
  const cutoff = bank.normative_cutoff_at && Number.isFinite(Date.parse(bank.normative_cutoff_at))
    ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Moscow" }).format(new Date(bank.normative_cutoff_at))
    : null;
  return <section aria-label={`Нормативные основания ${bank.code}`} className="min-w-0 space-y-2 rounded-xl border border-border p-3">
    <h5 className="text-sm font-medium">Нормативные основания · {bank.code}</h5>
    <p role="status" className="break-words text-sm text-muted-foreground">{!installed ? "Автоматическая проверка нормативных оснований подключается" : pending ? "Ожидаем результат запрошенной проверки нормативных оснований" : timedOut ? "Результат запрошенной проверки ещё не получен" : normativeCheckLabel(bank.latest_check_status)}</p>
    <p className="break-words text-xs text-muted-foreground">{bank.admission_basis === "automatic_attestation"
      ? "Допуск подтверждён автоматической сверкой официальных источников."
      : bank.admission_basis === "manual_review"
        ? "Действует срок предметной проверки. Неуспешная автоматическая сверка его не продлевает."
        : "Новый допуск пока не подтверждён. Начатые попытки и прежние результаты сохраняются."}
      {cutoff && ` Срок допуска: до ${cutoff} МСК (не включительно).`}</p>
    {mutation.isError && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
    {pending && <p className="text-xs text-muted-foreground">Запрос принят. Результат загружается с сервера; актуальность ещё не подтверждена этим запросом.</p>}
    {timedOut && <p className="text-xs text-muted-foreground">Время ожидания истекло. Проверка могла продолжиться на сервере; обновите результат. Повторный запрос автоматически не отправляется.</p>}
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" className="h-auto min-h-9 gap-2 whitespace-normal" disabled={!installed || !canManage || busy || serverBusy || !bank.release_id} onClick={() => mutation.mutate()}>
        {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <RefreshCw className="h-4 w-4 shrink-0" />}Проверить нормативные основания
      </Button>
      <Button size="sm" variant="ghost" onClick={refresh}>Обновить результат проверки</Button>
    </div>
  </section>;
}
