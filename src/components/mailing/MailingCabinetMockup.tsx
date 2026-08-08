import { Braces, Send, Share2 } from "lucide-react";

/**
 * Pure HTML/CSS mockup of the mailing cabinet (sender / campaign / public report).
 * Decorative only: hidden from assistive tech, no external images, no fake statistics.
 */
export function MailingCabinetMockup() {
  return (
    <div
      aria-hidden="true"
      role="presentation"
      className="w-full max-w-full min-w-0 overflow-hidden rounded-3xl border border-border/60 bg-card p-4 shadow-sm sm:p-5"
    >
      {/* window chrome */}
      <div className="mb-4 flex min-w-0 items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/30" />
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/20" />
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/20" />
        <span className="ml-2 min-w-0 truncate text-xs text-muted-foreground">Рассылки — кабинет организации</span>
      </div>

      <div className="min-w-0 space-y-3">
        {/* Sender */}
        <div className="min-w-0 rounded-2xl bg-muted/40 p-4">
          <div className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Send className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0">Отправитель</span>
          </div>
          <div className="mt-3 min-w-0 space-y-2 text-sm">
            {[
              { l: "SMTP", v: "подключён" },
              { l: "IMAP", v: "подключён" },
              { l: "Тестовая отправка", v: "выполнена" },
            ].map((r) => (
              <div key={r.l} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg bg-background/70 px-3 py-2">
                <span className="min-w-0 break-words text-muted-foreground">{r.l}</span>
                <span className="shrink-0 font-medium text-primary">{r.v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Campaign */}
        <div className="min-w-0 rounded-2xl bg-muted/40 p-4">
          <div className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Braces className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0">Кампания</span>
          </div>
          <div className="mt-3 min-w-0 rounded-lg bg-background/70 p-3 text-sm leading-relaxed">
            <div className="min-w-0 font-medium break-words">Здравствуйте, {"{{first_name}}"}!</div>
            <p className="mt-1 min-w-0 break-words text-muted-foreground">
              Приглашаем {"{{organization}}"} на обучение по программе…
            </p>
            <div className="mt-3 inline-flex w-full justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground sm:w-auto sm:justify-start">
              Смотреть программу
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {["Получатели из файла", "Переменные проверены", "Тест на seed-адрес"].map((t) => (
              <span key={t} className="rounded-full border border-border/60 bg-background/70 px-2.5 py-1 break-words text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Public report */}
        <div className="min-w-0 rounded-2xl bg-muted/40 p-4">
          <div className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Share2 className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0">Публичный отчёт</span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {["Принято SMTP", "Отправлено", "Ошибки приложения", "Переходы"].map((l) => (
              <div key={l} className="min-w-0 rounded-lg bg-background/70 px-3 py-2">
                <div className="h-3 w-10 rounded bg-muted-foreground/25" />
                <div className="mt-1.5 min-w-0 break-words text-xs text-muted-foreground">{l}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg bg-background/70 px-3 py-2 text-xs text-muted-foreground">
            <span className="min-w-0 break-words">Ссылка на отчёт для клиента</span>
            <span className="shrink-0 font-medium text-primary">копировать</span>
          </div>
        </div>
      </div>
    </div>
  );
}
