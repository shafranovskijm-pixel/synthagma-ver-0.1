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
