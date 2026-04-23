import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import {
  ArrowLeft, TrendingUp, Sparkles, Kanban, FileSignature,
  Receipt, Trophy, History, FileText, Check, X,
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
    title: "Сделки в Excel — теряются",
    description: "Файл у одного менеджера на ноутбуке. Кто звонил клиенту, на каком этапе сделка, сколько забыли выставить — никто не помнит.",
  },
  {
    title: "КП в Word — без истории",
    description: "Каждое предложение собирается заново. История правок, статус прочтения и подписания — нигде не хранятся.",
  },
  {
    title: "Нет контроля менеджеров",
    description: "Сколько сделок в работе, кто перевыполняет план, у кого зависшие счета — без CRM это вслепую.",
  },
];

const crmFeatures = [
  {
    icon: Kanban,
    title: "Канбан со сделками + DnD",
    description: "Перетаскивайте сделки между этапами. Лиды, квалификация, КП, договор, оплата — всё на одной доске.",
  },
  {
    icon: FileText,
    title: "КП с PDF и публичной ссылкой",
    description: "Соберите коммерческое предложение из услуг, отправьте по email или ссылке. Видите, когда клиент его открыл.",
  },
  {
    icon: FileSignature,
    title: "Договоры и ПЭП-подписание",
    description: "Шаблоны договоров с автозаполнением реквизитов. Подписание простой электронной подписью прямо со страницы.",
  },
  {
    icon: Receipt,
    title: "Счета и автонапоминания",
    description: "Генерация счетов по шаблону, отслеживание оплат, автоматические email-напоминания об оплате на 3, 7 и 14 день.",
  },
  {
    icon: Trophy,
    title: "План месяца + лидерборд",
    description: "Установите план каждому менеджеру. Лидерборд по выручке, конверсии и количеству закрытых сделок.",
  },
  {
    icon: History,
    title: "Тайм-лайн «Сделки 360°»",
    description: "Полная хронология по компании: КП, договоры, подписания, оплаты, переписка. Один экран — вся история.",
  },
];

const faqs = [
  {
    q: "Подходит ли CRM для не-образовательных компаний?",
    a: "Да. CRM универсальная — работает для любого B2B-бизнеса с длинным циклом сделки: услуги, оптовая торговля, IT-проекты, консалтинг.",
  },
  {
    q: "Можно ли импортировать существующих лидов?",
    a: "Конечно. Импорт из Excel/CSV с маппингом полей в один клик. Также есть формы на сайте, лидогенерация из чата и API.",
  },
  {
    q: "Как с ЭЦП и юридической силой подписания?",
    a: "Используется Простая электронная подпись (ПЭП) по 63-ФЗ. С клиентом подписывается соглашение об ЭДО, фиксируется IP и время. Для УКЭП — интеграция с Контур.Диадок (по запросу).",
  },
  {
    q: "Есть интеграция с банком для оплат?",
    a: "Да: T-Bank (Тинькофф) встроен — клиент платит по ссылке, оплата автоматически закрывается в счёте. Робокасса и ЮKassa — на подходе.",
  },
  {
    q: "Сколько менеджеров можно завести?",
    a: "На тарифе «Стандарт» — без ограничений по пользователям. Каждый менеджер видит только свои сделки, руководитель — все.",
  },
];

const planOrder: SubscriptionPlan[] = ['free', 'start', 'standard', 'professional', 'maximum'];

const FeatureSalesCRM = () => {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>CRM и Продажи — Синтагма</title>
        <meta name="description" content="Канбан сделок, КП с PDF, договоры и ПЭП, счета и автонапоминания об оплате, лидерборд менеджеров и тайм-лайн «Сделки 360°»." />
        <link rel="canonical" href="https://sintagma.com.ru/feature/sales-crm" />
        <meta property="og:title" content="CRM и Продажи — Синтагма" />
        <meta property="og:description" content="Полноценная CRM для B2B: сделки, КП, договоры, счета и контроль менеджеров — в одной системе." />
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
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">Включено в тариф «Стандарт» и выше</span>
            </motion.div>
            <motion.h1 variants={fadeUp} className="font-display text-4xl md:text-5xl font-medium mb-6 tracking-tight">
              CRM и продажи без хаоса
            </motion.h1>
            <motion.p variants={fadeUp} className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              Канбан сделок, КП с PDF и публичной ссылкой, договоры с ПЭП, счета с автонапоминаниями, план месяца и лидерборд — всё в одной системе.
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
              Полноценная CRM для B2B
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground text-center mb-10 max-w-xl mx-auto">
              От первого касания до закрытия сделки и оплаты
            </motion.p>
            <motion.div variants={fadeUp} className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {crmFeatures.map((feature, i) => (
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
                { step: "1", title: "Заведите лид или импортируйте базу", desc: "Карточка компании автоматически подтягивается по ИНН (Checko)" },
                { step: "2", title: "Соберите КП и отправьте клиенту", desc: "Готовый шаблон, PDF-экспорт, публичная ссылка с трекингом просмотров" },
                { step: "3", title: "Подпишите договор по ПЭП", desc: "Договор с автозаполнением реквизитов, подписание простой ЭП за 1 клик" },
                { step: "4", title: "Выставите счёт и контролируйте оплату", desc: "Автонапоминания на 3/7/14 день, акт сверки и закрытие сделки в один клик" },
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

      {/* Kanban mockup */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-6xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-10 text-center">
              Канбан сделок
            </motion.h2>
            <motion.div variants={fadeUp} className="rounded-2xl border border-border/60 bg-card/80 overflow-hidden shadow-xl">
              <div className="bg-secondary/40 px-4 py-3 border-b border-border/60 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-destructive/40" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/40" />
                <div className="w-3 h-3 rounded-full bg-accent/40" />
                <span className="ml-3 text-xs text-muted-foreground">sintagma.com.ru / CRM / Сделки</span>
              </div>
              <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3 overflow-x-auto">
                {[
                  { stage: "Лид", count: 12, sum: "1.2 млн", color: "bg-blue-500/10 text-blue-500" },
                  { stage: "КП отправлено", count: 8, sum: "2.4 млн", color: "bg-purple-500/10 text-purple-500" },
                  { stage: "Договор", count: 5, sum: "1.8 млн", color: "bg-yellow-500/10 text-yellow-500" },
                  { stage: "Оплачено", count: 3, sum: "950 тыс", color: "bg-accent/10 text-accent" },
                ].map((col, i) => (
                  <div key={i} className="rounded-xl bg-background/60 border border-border/60 p-3 min-w-[180px]">
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${col.color}`}>{col.stage}</span>
                      <span className="text-xs text-muted-foreground">{col.count}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mb-2">{col.sum} ₽</div>
                    <div className="space-y-2">
                      {[1, 2].map((d) => (
                        <div key={d} className="rounded-lg bg-card border border-border/40 p-2">
                          <div className="text-xs font-medium truncate">ООО «Пример {col.stage[0]}{d}»</div>
                          <div className="text-[10px] text-muted-foreground mt-1">{(150 * d).toLocaleString()} ₽</div>
                        </div>
                      ))}
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
              CRM доступна начиная с тарифа «Стандарт»
            </motion.p>
            <motion.div variants={fadeUp} className="rounded-2xl border border-border/60 bg-card/80 overflow-hidden">
              <div className="grid grid-cols-5 divide-x divide-border/60">
                {planOrder.map((p) => {
                  const plan = SUBSCRIPTION_PLANS[p];
                  const enabled = plan.limits.salesCrmEnabled;
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
              Превратите хаос продаж в систему
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Канбан, КП, договоры, счета, ПЭП и контроль менеджеров — за 30 минут
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

export default FeatureSalesCRM;
