import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import {
  ArrowLeft, Mail, Sparkles, FileText, Calendar, MousePointerClick,
  GitBranch, Upload, ShieldCheck, Check, X,
} from "lucide-react";
import { motion } from "framer-motion";
import { Footer } from "@/components/landing/Footer";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/constants/subscriptionPlans";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
};

const painPoints = [
  {
    title: "Менеджеры пишут письма вручную",
    description: "Каждое письмо клиенту — копипаст из черновика. Лиды теряются, ответы запаздывают, рабочий день уходит в рутину.",
  },
  {
    title: "Нет видимости открытий и кликов",
    description: "Отправили предложение — и тишина. Открыл клиент письмо или нет, кликнул ли по ссылке — узнать невозможно.",
  },
  {
    title: "Жалобы на спам и нет отписки",
    description: "Без RFC 8058 unsubscribe письма уходят в спам, домен теряет репутацию, а ФЗ-152 нарушается.",
  },
];

const emailFeatures = [
  {
    icon: FileText,
    title: "7 готовых шаблонов и редактор",
    description: "Welcome, cold-outreach, КП, реактивация, follow-up. Визуальный редактор с переменными {{name}}, {{company}}.",
  },
  {
    icon: Calendar,
    title: "Планировщик и A/B-тест тем",
    description: "Запланируйте отправку на оптимальное время. Тестируйте две темы письма — система сама выберет победителя.",
  },
  {
    icon: MousePointerClick,
    title: "Click-tracking + UTM",
    description: "Отслеживайте каждое открытие и клик. Автоматическая разметка UTM-меток для Яндекс.Метрики и Google Analytics.",
  },
  {
    icon: GitBranch,
    title: "Drip-цепочки",
    description: "Настройте серию писем с задержкой и условиями. Если клиент не открыл — отправляем напоминание через 3 дня.",
  },
  {
    icon: Upload,
    title: "Импорт CSV/Excel + suppression",
    description: "Загружайте базы контактов одним файлом. Автоматический suppression-лист отписавшихся и жалоб.",
  },
  {
    icon: ShieldCheck,
    title: "SPF/DKIM/DMARC + inbox-превью",
    description: "Проверка домена и DNS-записей. Превью письма в Gmail, Mail.ru, Outlook — узнайте, как видит клиент.",
  },
];

const faqs = [
  {
    q: "Можно подключить свой SMTP-сервер?",
    a: "Да. Подключите любой SMTP (Timeweb, Yandex.Cloud, Mail.ru, корпоративный сервер) — рассылка пойдёт с вашего домена и репутации.",
  },
  {
    q: "Как соблюдается ФЗ-152 о персональных данных?",
    a: "Все согласия на рассылку фиксируются с датой и IP. RFC 8058 unsubscribe-заголовок обязателен в каждом письме. Suppression-лист хранится бессрочно.",
  },
  {
    q: "Сколько писем можно отправлять в месяц?",
    a: "Лимит зависит от вашего SMTP-провайдера. Платформа не вводит дополнительных ограничений на тарифах от Старта и выше.",
  },
  {
    q: "Что происходит при отписке клиента?",
    a: "Контакт автоматически добавляется в suppression-лист и больше не получит рассылок никогда. Это глобальная блокировка по email.",
  },
  {
    q: "Можно использовать домен моей организации?",
    a: "Да и это правильно. Подключите SMTP с вашего домена + настройте SPF, DKIM, DMARC — мы покажем, как именно.",
  },
];

const planOrder: SubscriptionPlan[] = ['free', 'start', 'standard', 'professional', 'maximum'];

const FeatureEmailCampaigns = () => {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Email-рассылки и SMTP — Синтагма</title>
        <meta name="description" content="Шаблоны, drip-цепочки, A/B-тест тем, click-tracking и UTM. Свой SMTP, проверка SPF/DKIM/DMARC, RFC 8058 unsubscribe и ФЗ-152." />
        <link rel="canonical" href="https://sintagma.com.ru/feature/email-campaigns" />
        <meta property="og:title" content="Email-рассылки — Синтагма" />
        <meta property="og:description" content="Профессиональные email-рассылки со своего SMTP. Шаблоны, A/B-тесты, drip-цепочки и трекинг открытий." />
      </Helmet>

      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <SigmaLogo size="sm" />
          </Link>
          <Link to="/#pricing">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              К тарифам
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="container mx-auto px-6 relative z-10">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="max-w-4xl mx-auto text-center">
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
              <Mail className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">Включено в тариф «Старт» и выше</span>
            </motion.div>
            <motion.h1 variants={fadeUp} className="font-display text-4xl md:text-5xl font-medium mb-6 tracking-tight">
              Email-рассылки со своего домена
            </motion.h1>
            <motion.p variants={fadeUp} className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              Шаблоны, drip-цепочки, A/B-тесты тем, click-tracking и UTM-разметка. Свой SMTP, RFC 8058 unsubscribe и проверка SPF/DKIM/DMARC.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/register-organization">
                <Button size="lg" className="btn-accent px-8 gap-2">
                  <Sparkles className="w-4 h-4" />
                  Попробовать бесплатно
                </Button>
              </Link>
              <Link to="/#pricing">
                <Button size="lg" variant="outline" className="px-8">
                  Сравнить тарифы
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Pain Points */}
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-5xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-4 text-center">
              Что было до Синтагмы
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground text-center mb-10 max-w-xl mx-auto">
              Знакомые проблемы, которые мы решили
            </motion.p>
            <motion.div variants={fadeUp} className="grid md:grid-cols-3 gap-5">
              {painPoints.map((p, i) => (
                <Card key={i} className="h-full border-destructive/20 bg-card/80">
                  <CardContent className="p-6">
                    <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center mb-4">
                      <X className="w-5 h-5 text-destructive" />
                    </div>
                    <h3 className="font-display text-lg font-medium mb-2">{p.title}</h3>
                    <p className="text-sm text-muted-foreground">{p.description}</p>
                  </CardContent>
                </Card>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Features grid */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-6xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-4 text-center">
              Всё, что нужно для рассылок
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground text-center mb-10 max-w-xl mx-auto">
              От шаблонов до контроля доставляемости
            </motion.p>
            <motion.div variants={fadeUp} className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {emailFeatures.map((feature, i) => (
                <Card key={i} className="h-full border-border/50 bg-card/80 hover:border-primary/30 transition-colors group">
                  <CardContent className="p-6">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                      <feature.icon className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-display text-lg font-medium mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-3xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-10 text-center">
              Как это работает
            </motion.h2>
            <div className="space-y-6">
              {[
                { step: "1", title: "Подключите SMTP и проверьте домен", desc: "Вводите данные SMTP, проверяете SPF/DKIM/DMARC прямо в интерфейсе" },
                { step: "2", title: "Загрузите контакты", desc: "Импорт CSV/Excel в один клик. Автоматическая дедупликация и suppression" },
                { step: "3", title: "Соберите письмо или цепочку", desc: "Готовый шаблон или drip-цепочка с условиями «открыл / не открыл»" },
                { step: "4", title: "Отправьте и следите за метриками", desc: "Открытия, клики, отписки и конверсия по UTM — в реальном времени" },
              ].map((item, i) => (
                <motion.div key={i} variants={fadeUp} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-primary">{item.step}</span>
                  </div>
                  <div>
                    <h3 className="font-display font-medium mb-1">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* UI mockup */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-5xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-10 text-center">
              Интерфейс рассылок
            </motion.h2>
            <motion.div variants={fadeUp} className="rounded-2xl border border-border/60 bg-card/80 overflow-hidden shadow-xl">
              <div className="bg-secondary/40 px-4 py-3 border-b border-border/60 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-destructive/40" />
                <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
                <div className="w-3 h-3 rounded-full bg-accent/40" />
                <span className="ml-3 text-xs text-muted-foreground">sintagma.com.ru / Рассылки</span>
              </div>
              <div className="p-6 grid md:grid-cols-3 gap-4">
                {[
                  { name: "Welcome-цепочка", status: "Активна", sent: 1240, open: "62%", click: "18%" },
                  { name: "Реактивация B2B", status: "A/B-тест", sent: 480, open: "47%", click: "9%" },
                  { name: "КП — Q4 2025", status: "Запланирована", sent: 0, open: "—", click: "—" },
                ].map((c, i) => (
                  <div key={i} className="rounded-xl border border-border/60 bg-background/60 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <Mail className="w-5 h-5 text-primary" />
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{c.status}</span>
                    </div>
                    <h4 className="font-medium mb-3 text-sm">{c.name}</h4>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div className="flex justify-between"><span>Отправлено:</span><span className="text-foreground font-medium">{c.sent}</span></div>
                      <div className="flex justify-between"><span>Открытия:</span><span className="text-accent font-medium">{c.open}</span></div>
                      <div className="flex justify-between"><span>Клики:</span><span className="text-accent font-medium">{c.click}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Plan availability */}
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-3xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-4 text-center">
              Доступность по тарифам
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground text-center mb-8">
              Email-рассылки доступны начиная с тарифа «Старт»
            </motion.p>
            <motion.div variants={fadeUp} className="rounded-2xl border border-border/60 bg-card/80 overflow-hidden">
              <div className="grid grid-cols-5 divide-x divide-border/60">
                {planOrder.map((p) => {
                  const plan = SUBSCRIPTION_PLANS[p];
                  const enabled = plan.limits.emailCampaignsEnabled;
                  return (
                    <div key={p} className="p-5 text-center">
                      <div className="text-xs text-muted-foreground mb-2">{plan.name}</div>
                      {enabled ? (
                        <Check className="w-6 h-6 text-accent mx-auto" />
                      ) : (
                        <X className="w-6 h-6 text-muted-foreground/40 mx-auto" />
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
            <motion.div variants={fadeUp} className="text-center mt-6">
              <Link to="/#pricing">
                <Button variant="outline">Посмотреть полный прайс</Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-3xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-10 text-center">
              Частые вопросы
            </motion.h2>
            <motion.div variants={fadeUp}>
              <Accordion type="single" collapsible className="space-y-3">
                {faqs.map((f, i) => (
                  <AccordionItem key={i} value={`item-${i}`} className="border border-border/60 rounded-xl px-5 bg-card/60">
                    <AccordionTrigger className="text-left font-medium">{f.q}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto px-6 text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-4">
              Запустите первую рассылку за 15 минут
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Подключите SMTP, импортируйте контакты и отправьте первое письмо
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/register-organization">
                <Button size="lg" className="btn-accent px-8 gap-2">
                  <Sparkles className="w-4 h-4" />
                  Попробовать бесплатно
                </Button>
              </Link>
              <Link to="/#pricing">
                <Button size="lg" variant="outline" className="px-8">
                  Сравнить тарифы
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default FeatureEmailCampaigns;
