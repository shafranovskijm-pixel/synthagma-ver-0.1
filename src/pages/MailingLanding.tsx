import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Footer } from "@/components/landing/Footer";
import { MailingCabinetMockup } from "@/components/mailing/MailingCabinetMockup";
import {
  Globe,
  Upload,
  Braces,
  Send,
  BarChart3,
  Share2,
  ShieldCheck,
  MailCheck,
  CalendarDays,
  GraduationCap,
  Repeat,
} from "lucide-react";

const FEATURES = [
  {
    icon: Globe,
    title: "Почта вашей организации",
    text: "Подключаете свой SMTP и IMAP: письма уходят с вашего адреса, а не с общего домена платформы.",
  },
  {
    icon: Upload,
    title: "Импорт базы из файла",
    text: "CSV, XLS и XLSX с предпросмотром и явным сопоставлением столбцов. Дубликаты отсекаются до создания получателей.",
  },
  {
    icon: Braces,
    title: "Переменные и персонализация",
    text: "{{first_name}}, {{organization}}, {{city}} и свои поля из файла. Неизвестные переменные подсвечиваем до запуска.",
  },
  {
    icon: Send,
    title: "Тест перед запуском",
    text: "Сначала тестовая отправка на ваши seed-адреса. Реальная база открывается только после проверки отправителя.",
  },
  {
    icon: BarChart3,
    title: "Понятный отчёт",
    text: "Отдельно «принято SMTP» и «отправлено приложением», ошибки отправки и выгрузка в CSV.",
  },
  {
    icon: Share2,
    title: "Публичная ссылка клиенту",
    text: "Ссылка со сводными цифрами без email и ФИО получателей. Со сроком действия и возможностью отключить.",
  },
];

const STEPS = [
  {
    title: "Подключаете SMTP и IMAP",
    text: "Вводите данные ящика своего домена. Мастер проверяет соединение и сохраняет пароль в зашифрованном виде.",
  },
  {
    title: "Загружаете CSV или XLSX",
    text: "Предпросмотр файла и сопоставление столбцов. Дубликаты внутри загрузки исключаются автоматически.",
  },
  {
    title: "Собираете письмо и переменные",
    text: "Тема, текст, ссылки и подстановки из файла. Для получателей без значения задаются понятные значения по умолчанию.",
  },
  {
    title: "Тест, запуск, отчёт",
    text: "Обязательная тестовая отправка, затем запуск по базе. Отчёт обновляется по ходу, ссылку можно отдать клиенту.",
  },
];

const SCENARIOS = [
  {
    icon: CalendarDays,
    title: "Мероприятие или вебинар",
    text: "Приглашение, напоминание за день и письмо с записью — одной кампанией с персональным обращением.",
  },
  {
    icon: GraduationCap,
    title: "Набор на обучение",
    text: "Рассылка по организациям и специалистам: программа, сроки и ссылка на заявку в вашем письме.",
  },
  {
    icon: Repeat,
    title: "Повторные продажи и напоминания",
    text: "Письма по действующим клиентам: истечение удостоверений, новые программы, продление обучения.",
  },
];

const REPORT_ITEMS = [
  "Принято SMTP-сервером — сколько писем сервер принял к отправке.",
  "Отправлено приложением и ошибки отправки — что кампания смогла обработать, а что нет.",
  "Открытия и переходы — если такие данные доступны по вашей кампании и ссылкам.",
  "Публичная ссылка на отчёт — сводные цифры без персональных данных получателей.",
];

const CHECKLIST = [
  { t: "SPF", d: "В домене разрешён сервер, с которого уходят письма." },
  { t: "DKIM", d: "Подпись настроена на стороне вашего почтового провайдера." },
  { t: "DMARC", d: "Политика опубликована, отчёты приходят на ваш адрес." },
  { t: "Прогрев", d: "Начинайте с небольших объёмов и увеличивайте постепенно." },
  { t: "Согласие получателей", d: "Отправляйте только тем, кто ожидает от вас писем." },
  { t: "Тестовая отправка", d: "Проверьте письмо на своих адресах до запуска по базе." },
];

const FAQ = [
  {
    q: "Нужен ли отдельный аккаунт?",
    a: "Нет. Рассылки работают внутри вашей организации СИНТАГМА — вход обычной учётной записью.",
  },
  {
    q: "Чей адрес будет у писем?",
    a: "Ваш собственный. Мы не подменяем отправителя и не отправляем с общего домена платформы.",
  },
  {
    q: "Что с отписками?",
    a: "В письмо добавляются корректные заголовки отписки и ссылка, чтобы получатель мог отказаться от рассылки.",
  },
  {
    q: "Гарантируете доставку во «Входящие»?",
    a: "Нет. Попадание в папку «Входящие» определяет почтовый сервис получателя. Мы показываем реальные цифры отправки и подсказываем, что поправить в настройке домена.",
  },
];

export default function MailingLanding() {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Email-рассылки СИНТАГМА — почта вашей организации</title>
        <meta
          name="description"
          content="Рассылки из СИНТАГМЫ через почту вашей организации: SMTP и IMAP, импорт базы из CSV и XLSX, переменные, тестовая отправка, отчёт и публичная ссылка."
        />
        <link rel="canonical" href="https://sintagma.com.ru/mailing" />
        <meta property="og:title" content="Email-рассылки СИНТАГМА" />
        <meta
          property="og:description"
          content="Почта вашей организации, импорт базы, переменные, тест и отчёт с публичной ссылкой."
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>

      <LandingHeader showStars={false} />

      <main>
        {/* Hero */}
        <section className="container mx-auto px-6 pt-16 pb-12">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                <MailCheck className="h-3.5 w-3.5" />
                Сервис СИНТАГМЫ
              </span>
              <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
                Рассылки из СИНТАГМЫ через почту вашей организации
              </h1>
              <p className="mt-5 text-lg text-muted-foreground">
                Подключите свой SMTP и IMAP, загрузите базу из файла, соберите письмо с переменными,
                проверьте его тестовой отправкой и покажите клиенту отчёт по публичной ссылке.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to="/login?next=/mailing/app">Войти в рассылки</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/register-organization">Создать организацию</Link>
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Уже работаете в СИНТАГМЕ? Вход выполняется вашей обычной учётной записью
                организации — отдельная регистрация не нужна.
              </p>
            </div>

            <div className="min-w-0">
              <MailingCabinetMockup />
            </div>
          </div>
        </section>

        {/* Возможности */}
        <section className="container mx-auto px-6 pb-16" aria-labelledby="mailing-features">
          <h2 id="mailing-features" className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Что входит в рассылки
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title} className="h-full border-border/60 shadow-sm">
                <CardContent className="p-6">
                  <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Как работает */}
        <section className="container mx-auto px-6 pb-16" aria-labelledby="mailing-how">
          <h2 id="mailing-how" className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Как работает
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Четыре шага от подключения ящика до отчёта клиенту.
          </p>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-border/60 bg-card p-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 font-display text-base font-semibold text-primary">
                  {i + 1}
                </div>
                <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Сценарии */}
        <section className="container mx-auto px-6 pb-16" aria-labelledby="mailing-scenarios">
          <h2 id="mailing-scenarios" className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Для каких задач
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SCENARIOS.map((s) => (
              <div key={s.title} className="rounded-2xl border border-border/60 bg-card p-5">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <s.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Что видно в отчёте */}
        <section className="container mx-auto px-6 pb-16" aria-labelledby="mailing-report">
          <h2 id="mailing-report" className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Что видно в отчёте
          </h2>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {REPORT_ITEMS.map((item) => (
              <li key={item} className="rounded-2xl border border-border/60 bg-card p-5 text-sm leading-relaxed text-muted-foreground">
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            SMTP 250 означает принятие письма сервером, но не гарантирует попадание во Входящие.
          </p>
        </section>

        {/* Перед запуском */}
        <section className="container mx-auto px-6 pb-16" aria-labelledby="mailing-checklist">
          <h2 id="mailing-checklist" className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Перед запуском
          </h2>
          <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CHECKLIST.map((c) => (
              <div key={c.t} className="rounded-2xl border border-border/60 bg-card p-5">
                <dt className="text-base font-semibold">{c.t}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.d}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* FAQ */}
        <section className="container mx-auto px-6 pb-16" aria-labelledby="mailing-faq">
          <h2 id="mailing-faq" className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Частые вопросы
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {FAQ.map((f) => (
              <div key={f.q} className="rounded-2xl border border-border/60 bg-card p-5">
                <h3 className="text-base font-semibold">{f.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Финальная CTA */}
        <section className="container mx-auto px-6 pb-20" aria-labelledby="mailing-cta">
          <div className="rounded-3xl border border-border/60 bg-muted/30 p-8 sm:p-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-xl min-w-0">
                <h2 id="mailing-cta" className="flex items-center gap-2 font-display text-2xl font-semibold">
                  <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
                  Начните с подключения своего ящика
                </h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  Пароли ящиков хранятся зашифрованными и не возвращаются в интерфейс. Мы не обещаем
                  попадание во «Входящие» — показываем реальные цифры отправки и подсказываем, что
                  улучшить в настройке домена.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to="/login?next=/mailing/app">Войти в рассылки</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/register-organization">Создать организацию</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
