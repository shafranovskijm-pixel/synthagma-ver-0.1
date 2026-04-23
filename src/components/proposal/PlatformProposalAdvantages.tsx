import { Sparkles, Mic, Library, FileSpreadsheet, FileSignature, ShieldCheck, Palette, Mail, Briefcase, Video } from "lucide-react";

const ADVANTAGES = [
  { icon: Sparkles, title: "ИИ-генерация курсов", text: "GigaChat + Gemini создают структуру (до 35 уроков), контент от 700 слов и тесты — за минуты, а не недели." },
  { icon: Mic, title: "ИИ-озвучка SaluteSpeech", text: "3 реалистичных голоса, ротация ключей. Превращайте текстовые уроки в аудио в один клик." },
  { icon: Library, title: "300+ готовых программ", text: "Полная библиотека Ростехнадзора и охраны труда. Запускайте обучение в день регистрации." },
  { icon: FileSpreadsheet, title: "ФИС ФРДО под ключ", text: "Автоэкспорт DPO/PO в официальный шаблон (35/41 колонка). Услуга «ФРДО+» — выгружаем за вас." },
  { icon: FileSignature, title: "Документооборот ЛОО", text: "Приказы, протоколы, удостоверения, журналы — автоматически с подписями и печатями." },
  { icon: ShieldCheck, title: "Видеоидентификация", text: "Чек-лист документов и идентификация ученика по видео — соответствие 273-ФЗ." },
  { icon: Palette, title: "Брендирование", text: "Логотип, цвета, страница входа на собственном домене. Ученики видят вашу платформу." },
  { icon: Mail, title: "Email-рассылки", text: "SMTP, drip-цепочки, A/B-тесты тем, click-tracking, RFC 8058 unsubscribe, проверка SPF/DKIM/DMARC." },
  { icon: Briefcase, title: "CRM продаж", text: "Канбан сделок, КП с публичной ссылкой, договоры с ПЭП, счета с автонапоминаниями, лидерборд менеджеров." },
  { icon: Video, title: "Вебинары и 3D-тренажёры", text: "Kinescope Live, запись трансляций, интерактивные 3D-симуляции для практики." },
];

export function PlatformProposalAdvantages() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {ADVANTAGES.map(({ icon: Icon, title, text }) => (
        <div
          key={title}
          className="rounded-3xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <Icon className="h-5 w-5" />
          </div>
          <h3 className="mb-1 font-display text-base font-semibold tracking-tight">{title}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
        </div>
      ))}
    </div>
  );
}
