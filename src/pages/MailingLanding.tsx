import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Footer } from "@/components/landing/Footer";
import {
  Globe,
  Upload,
  Braces,
  Send,
  BarChart3,
  Share2,
  ShieldCheck,
  MailCheck,
} from "lucide-react";

const FEATURES = [
  {
    icon: Globe,
    title: "Собственный домен и ящик",
    text: "Подключаете свой SMTP и IMAP: письма уходят с вашего адреса, а не с общего. Домен проверяем по SPF, DKIM, DMARC и MX.",
  },
  {
    icon: Upload,
    title: "Импорт базы за минуту",
    text: "CSV, XLS и XLSX с предпросмотром и явным сопоставлением столбцов. Дубликаты отсекаются до создания получателей.",
  },
  {
    icon: Braces,
    title: "Переменные и персонализация",
    text: "{{first_name}}, {{organization}}, {{city}} и свои поля из файла. Неизвестные переменные подсвечиваем до запуска.",
  },
  {
    icon: Send,
    title: "Кампании с безопасным запуском",
    text: "Сначала тестовая отправка на ваши seed-адреса. Реальная база открывается только после проверки отправителя.",
  },
  {
    icon: BarChart3,
    title: "Честная статистика",
    text: "Отдельно «SMTP принял» и «прочитано». Bounce, ошибки, отписки, конверсии по ссылкам и выгрузка в CSV.",
  },
  {
    icon: Share2,
    title: "Публичный отчёт клиенту",
    text: "Ссылка со сводными цифрами без email и ФИО получателей. Со сроком действия и возможностью отключить.",
  },
];

const STEPS = [
  {
    title: "Подключаете ящик",
    text: "Вводите данные SMTP и IMAP своего домена. Мастер проверяет соединение и записи SPF, DKIM, DMARC.",
  },
  {
    title: "Загружаете базу",
    text: "CSV или Excel с предпросмотром и сопоставлением столбцов. Дубликаты и отписавшиеся исключаются автоматически.",
  },
  {
    title: "Собираете письмо",
    text: "Тема, текст, ссылки и переменные. Перед запуском обязательная тестовая отправка на ваши seed-адреса.",
  },
  {
    title: "Запускаете и смотрите отчёт",
    text: "Отправка идёт с вашего адреса, статистика обновляется по ходу. Клиенту можно отдать публичную ссылку на отчёт.",
  },
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
    a: "В каждом письме корректные заголовки отписки и ссылка. Отписавшиеся попадают в suppression-список навсегда.",
  },
  {
    q: "Гарантируете доставку в inbox?",
    a: "Нет, и никто не может. Мы показываем реальные цифры и подсказываем, что поправить в настройке домена.",
  },
];


export default function MailingLanding() {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Email-рассылки СИНТАГМА — свой домен, база и отчёты</title>
        <meta
          name="description"
          content="Сервис email-рассылок СИНТАГМА: свой SMTP-домен, импорт базы из CSV и Excel, переменные, кампании, честная статистика и публичный отчёт клиенту."
        />
        <link rel="canonical" href="https://sintagma.com.ru/mailing" />
        <meta property="og:title" content="Email-рассылки СИНТАГМА" />
        <meta
          property="og:description"
          content="Свой домен, импорт базы, переменные, кампании и публичный отчёт клиенту."
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>

      <LandingHeader showStars={false} />

      <main>
        <section className="container mx-auto px-6 pt-16 pb-12">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <MailCheck className="h-3.5 w-3.5" />
              Новый сервис СИНТАГМЫ
            </span>
            <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              Email-рассылки, которым можно доверить свою базу
            </h1>
            <p className="mt-5 text-lg text-muted-foreground">
              Отправляйте письма со своего домена, ведите базу контактов с переменными,
              запускайте кампании и показывайте клиенту прозрачный отчёт — в одном кабинете
              вашей организации СИНТАГМА.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/login?next=/mailing/app">Войти в кабинет</Link>
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
        </section>

        <section className="container mx-auto px-6 pb-16">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title} className="h-full border-border/60 shadow-sm">
                <CardContent className="p-6">
                  <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h2 className="text-base font-semibold">{f.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Как запустить рассылку за 4 шага */}
        <section className="container mx-auto px-6 pb-16">
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Как запустить рассылку за 4 шага
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Путь от подключения ящика до отчёта клиенту — без технических настроек на вашей стороне.
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

        {/* Как это выглядит */}
        <section className="container mx-auto px-6 pb-16">
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Как это выглядит в кабинете
          </h2>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Отправитель
              </div>
              <div className="mt-4 space-y-2 text-sm">
                {[
                  { l: "SPF", v: "пройдено" },
                  { l: "DKIM", v: "пройдено" },
                  { l: "DMARC", v: "пройдено" },
                  { l: "SMTP-тест", v: "1 / 1 / 0" },
                ].map((r) => (
                  <div key={r.l} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                    <span className="text-muted-foreground">{r.l}</span>
                    <span className="font-medium text-primary">{r.v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Письмо с переменными
              </div>
              <div className="mt-4 rounded-lg bg-muted/40 p-4 text-sm leading-relaxed">
                <div className="font-medium">Здравствуйте, {"{{first_name}}"}!</div>
                <p className="mt-2 text-muted-foreground">
                  Приглашаем {"{{organization}}"} на обучение по программе…
                </p>
                <div className="mt-3 inline-flex rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                  Смотреть программу
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Отчёт кампании
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                {[
                  { l: "SMTP принял", v: "482" },
                  { l: "Прочитано", v: "191" },
                  { l: "Переходы", v: "54" },
                  { l: "Отписки", v: "3" },
                ].map((m) => (
                  <div key={m.l} className="rounded-lg bg-muted/40 px-3 py-2">
                    <div className="font-display text-lg font-semibold">{m.v}</div>
                    <div className="text-xs text-muted-foreground">{m.l}</div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Пример оформления отчёта. Цифры в вашем кабинете — только ваши реальные.
              </p>
            </div>
          </div>
        </section>

        {/* Частые вопросы */}
        <section className="container mx-auto px-6 pb-16">
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Частые вопросы</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {FAQ.map((f) => (
              <div key={f.q} className="rounded-2xl border border-border/60 bg-card p-5">
                <h3 className="text-base font-semibold">{f.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </div>
            ))}
          </div>
        </section>


        <section className="container mx-auto px-6 pb-20">
          <div className="rounded-3xl border border-border/60 bg-muted/30 p-8 sm:p-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-xl">
                <h2 className="flex items-center gap-2 font-display text-2xl font-semibold">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  Аккуратно к базе и к репутации
                </h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  Пароли ящиков хранятся зашифрованными и никогда не возвращаются в интерфейс.
                  Отписки и bounce-адреса попадают в suppression-список и больше не получают писем.
                  Мы не обещаем 100% доставку — показываем реальные цифры и подсказываем, что
                  улучшить в настройке домена.
                </p>
              </div>
              <Button asChild size="lg" className="shrink-0">
                <Link to="/login?next=/mailing/app">Войти в кабинет</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
