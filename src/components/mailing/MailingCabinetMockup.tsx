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
      className="w-full max-w-full overflow-hidden rounded-3xl border border-border/60 bg-card p-4 shadow-sm sm:p-5"
    >
      {/* window chrome */}
      <div className="mb-4 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/20" />
        <span className="ml-2 truncate text-xs text-muted-foreground">Рассылки — кабинет организации</span>
      </div>

      <div className="space-y-3">
        {/* Sender */}
        <div className="rounded-2xl bg-muted/40 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Send className="h-3.5 w-3.5" />
            Отправитель
          </div>
          <div className="mt-3 space-y-2 text-sm">
            {[
              { l: "SMTP", v: "подключён" },
              { l: "IMAP", v: "подключён" },
              { l: "Тестовая отправка", v: "выполнена" },
            ].map((r) => (
              <div key={r.l} className="flex items-center justify-between gap-3 rounded-lg bg-background/70 px-3 py-2">
                <span className="truncate text-muted-foreground">{r.l}</span>
                <span className="shrink-0 font-medium text-primary">{r.v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Campaign */}
        <div className="rounded-2xl bg-muted/40 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Braces className="h-3.5 w-3.5" />
            Кампания
          </div>
          <div className="mt-3 rounded-lg bg-background/70 p-3 text-sm leading-relaxed">
            <div className="font-medium">Здравствуйте, {"{{first_name}}"}!</div>
            <p className="mt-1 text-muted-foreground">
              Приглашаем {"{{organization}}"} на обучение по программе…
            </p>
            <div className="mt-3 inline-flex rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
              Смотреть программу
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {["Получатели из файла", "Переменные проверены", "Тест на seed-адрес"].map((t) => (
              <span key={t} className="rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Public report */}
        <div className="rounded-2xl bg-muted/40 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Share2 className="h-3.5 w-3.5" />
            Публичный отчёт
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {["Принято SMTP", "Отправлено", "Ошибки приложения", "Переходы"].map((l) => (
              <div key={l} className="rounded-lg bg-background/70 px-3 py-2">
                <div className="h-3 w-10 rounded bg-muted-foreground/25" />
                <div className="mt-1.5 truncate text-xs text-muted-foreground">{l}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-background/70 px-3 py-2 text-xs text-muted-foreground">
            <span className="truncate">Ссылка на отчёт для клиента</span>
            <span className="shrink-0 font-medium text-primary">копировать</span>
          </div>
        </div>
      </div>
    </div>
  );
}
