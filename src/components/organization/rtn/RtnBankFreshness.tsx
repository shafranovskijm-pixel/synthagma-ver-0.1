import { ExternalLink } from "lucide-react";
import type { RtnBank, RtnCheckResult } from "@/types/rostechnadzor";

function confirmedDate(value: string | null | undefined, time = false): string {
  if (!value) return "Не подтверждено";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Не подтверждено";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Moscow", ...(time ? { hour: "2-digit", minute: "2-digit" } as const : {}) }).format(date);
}

function effectiveDate(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Не подтверждена";
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "Не подтверждена";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(date);
}

/** Source observation, actual release and application dates are different facts. */
export function RtnBankFreshness({ bank, checkResult, verificationFailed = false, officialUrl, details = false }: {
  bank: RtnBank; checkResult?: RtnCheckResult; verificationFailed?: boolean; officialUrl: string | null; details?: boolean;
}) {
  const published = bank.release_id && (!bank.active_release || bank.active_release.release_id === bank.release_id)
    ? bank.published_at ?? bank.active_release?.published_at : null;
  const sourceFailed = verificationFailed || (checkResult?.status ?? bank.check_status) === "error";
  const sourceSuccess = [bank.last_success_at, checkResult?.last_success_at].filter((value): value is string => !!value && Number.isFinite(Date.parse(value)))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  const routineDue = bank.approval_policy === "source-tracked-v2" && bank.editorial_status === "due";
  return <div className="min-w-0 space-y-3" role="group" aria-label="Актуальность редакции">
    <dl className="grid min-w-0 grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
      <div><dt>Источник проверен</dt><dd className="font-medium text-foreground">{confirmedDate(sourceSuccess)}</dd></div>
      <div><dt>Курс обновлён</dt><dd className="font-medium text-foreground">{confirmedDate(published)}</dd></div>
      <div><dt>Применяется с</dt><dd className="font-medium text-foreground">{effectiveDate(bank.effective_from)}</dd></div>
    </dl>
    {officialUrl && <a href={officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm text-primary underline underline-offset-4">Официальный источник<ExternalLink className="h-3.5 w-3.5 shrink-0" /></a>}
    {sourceFailed && <p role="status" className="text-xs text-amber-800 dark:text-amber-300">Не удалось сверить официальный источник. {bank.release_id ? "Последняя выпущенная редакция сохранена; её даты показаны выше." : "Актуальность вопросов пока не подтверждена."}</p>}
    {routineDue && <p className="text-xs text-muted-foreground">Наступил срок плановой сверки. {bank.normative_status === "current" ? "Обучение по проверенной редакции доступно." : "Доступ к новым попыткам определяется состоянием редакции."}</p>}
    {details && bank.approval_policy === "source-tracked-v2" && <div className="space-y-1 text-xs text-muted-foreground">
      <p>Плановая сверка: {effectiveDate(bank.editorial_review_before)}. Её срок сам по себе не приостанавливает обучение.</p>
      {bank.legal_validity === "bounded" ? <p>Новые попытки доступны до {confirmedDate(bank.legal_cutoff_at, true)} МСК, не включая этот момент. После этого нужна новая проверенная редакция.</p>
        : bank.legal_validity === "no_declared_cutoff_reviewed" ? <p>При предметной проверке предельная дата нормативных оснований не установлена. Изменения источника требуют новой проверки.</p>
          : <p>Нормативный срок не подтверждён.</p>}
    </div>}
  </div>;
}
