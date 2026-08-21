import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { ArrowLeft, Database, AlertTriangle, Clock, FileCheck, Upload, Shield, CheckCircle2, Scale, Sparkles, ShieldCheck, FileSpreadsheet, Wrench, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { Footer } from "@/components/landing/Footer";
import { FrdoFileSanitizerDialog } from "@/components/organization/FrdoFileSanitizerDialog";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

const FeatureFRDO = () => {
  const [sanitizerOpen, setSanitizerOpen] = useState(false);
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Подготовка данных для ФИС ФРДО — СИНТАГМА</title>
        <meta name="description" content="Подготовка XLSX-файлов для ФИС ФРДО: реестр документов, проверка поддерживаемых полей и ручной контроль результата перед загрузкой оператором." />
        <meta name="keywords" content="выпуск ФРДО, реестр документов об образовании, ФИС ФРДО, выгрузка ФРДО, шаблон ФРДО 35 столбцов, шаблон ФРДО 41 столбец, автоматизация ФРДО, обрнадзор ФРДО, удостоверения о повышении квалификации, дипломы переподготовки" />
        <link rel="canonical" href="https://xn--80aaiswd0ak.xn--p1ai/feature/frdo" />
        <meta property="og:title" content="Подготовка данных для ФИС ФРДО — СИНТАГМА" />
        <meta property="og:description" content="Формирование XLSX-файла, проверка поддерживаемых полей и обязательный ручной контроль перед загрузкой в официальный кабинет ФИС ФРДО." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://xn--80aaiswd0ak.xn--p1ai/feature/frdo" />
        <meta property="og:image" content="https://xn--80aaiswd0ak.xn--p1ai/og-registration-organization.jpg" />
      </Helmet>
      {/* Header */}
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
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-primary/5" />
        <div className="container mx-auto px-6 relative z-10">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger}
            className="max-w-4xl mx-auto text-center"
          >
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 mb-6">
              <Database className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-accent">ФИС ФРДО</span>
            </motion.div>
            <motion.h1 variants={fadeUp} className="font-display text-4xl md:text-5xl font-medium mb-6 tracking-tight">
              Федеральный реестр сведений о документах об образовании
            </motion.h1>
            <motion.p variants={fadeUp} className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Подготовка XLSX-файла и предварительные проверки перед ручной загрузкой оператором в официальный кабинет ФИС ФРДО
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Что такое ФИС ФРДО */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-4xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-8 text-center">Что такое ФИС ФРДО?</motion.h2>
            <motion.div variants={fadeUp} className="prose prose-lg max-w-none text-muted-foreground space-y-4">
              <p>
                <strong className="text-foreground">ФИС ФРДО</strong> (Федеральная информационная система «Федеральный реестр сведений о документах об образовании и (или) о квалификации, документах об обучении») — единый государственный реестр, в который все образовательные организации обязаны вносить сведения о каждом выданном документе об образовании.
              </p>
              <p>
                Порядок ведения реестра установлен <strong className="text-foreground">частью 10 статьи 98 Федерального закона № 273-ФЗ</strong> и <strong className="text-foreground">постановлением Правительства РФ от 31.05.2021 № 825</strong> с последующими изменениями.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Сроки и штрафы */}
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-4xl mx-auto grid md:grid-cols-2 gap-6">
            <motion.div variants={fadeUp}>
              <Card className="h-full border-accent/20 bg-card/80 backdrop-blur-sm">
                <CardContent className="p-8">
                  <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                    <Clock className="w-6 h-6 text-accent" />
                  </div>
                  <h3 className="font-display text-xl font-medium mb-3">Сроки внесения</h3>
                  <p className="text-muted-foreground">
                    Для документов по дополнительным профессиональным программам срок сокращён до <strong className="text-foreground">30 календарных дней</strong> с 1 сентября 2025 года. Для других видов программ сроки могут отличаться — категорию документа проверяет ответственный сотрудник.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
            <motion.div variants={fadeUp}>
              <Card className="h-full border-destructive/20 bg-card/80 backdrop-blur-sm">
                <CardContent className="p-8">
                  <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center mb-4">
                    <AlertTriangle className="w-6 h-6 text-destructive" />
                  </div>
                  <h3 className="font-display text-xl font-medium mb-3">Штрафы за нарушение</h3>
                  <p className="text-muted-foreground">
                    За нарушение порядка и сроков может наступать ответственность. Конкретное основание и размер определяются по обстоятельствам, поэтому на лендинге не приводится универсальная сумма штрафа.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Типовые ошибки и безопасный контроль перед загрузкой */}
      <section className="py-20 bg-destructive/5 border-y border-destructive/10 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-destructive/[0.03] via-transparent to-accent/[0.03]" />
        <div className="container mx-auto px-6 relative z-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center"
          >
            {/* Левая колонка — текст боли + чек-лист */}
            <motion.div variants={fadeUp}>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-destructive/10 border border-destructive/20 mb-6">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <span className="text-sm font-medium text-destructive">Знакомо?</span>
              </div>

              <h2 className="font-display text-3xl md:text-4xl font-medium mb-5 tracking-tight leading-tight">
                Ошибки формата могут помешать загрузке файла в ФИС ФРДО
              </h2>

              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                Невидимые пробелы, неподдерживаемые форматы дат и лишние табуляции требуют проверки. СИНТАГМА помогает подготовить файл, но итог всегда проверяет ответственный сотрудник.
              </p>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-foreground mb-3">Что платформа проверяет перед формированием:</p>
                {[
                  { icon: Sparkles, text: "Авто-форматирование СНИЛС, дат, ФИО" },
                  { icon: ShieldCheck, text: "Очистка скрытых пробелов и табуляций" },
                  { icon: CheckCircle2, text: "Проверка заполнения поддерживаемых обязательных полей" },
                  { icon: FileSpreadsheet, text: "Формирование XLSX 35/41 столбцов с последующим ручным контролем" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-card/80 backdrop-blur-sm border border-border/50">
                    <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                      <item.icon className="w-4 h-4 text-accent" />
                    </div>
                    <p className="text-sm text-foreground/90 pt-1.5 font-medium">{item.text}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8">
                <Link to="/register-organization">
                  <Button size="lg" className="btn-accent px-7">
                    Попробовать бесплатно
                  </Button>
                </Link>
              </div>
            </motion.div>

            {/* Честный контрольный лист без имитации интерфейса ФИС ФРДО */}
            <motion.div variants={fadeUp} className="relative">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-border/50 bg-card">
                <div className="flex items-center gap-3 px-5 py-4 bg-muted/40 border-b border-border/50">
                  <FileSpreadsheet className="h-5 w-5 text-accent" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Контроль перед загрузкой</p>
                    <p className="text-xs text-muted-foreground">Ответственный сотрудник проверяет результат</p>
                  </div>
                </div>
                <div className="space-y-3 p-6">
                  {[
                    "Сверить тип программы и актуальный шаблон кабинета",
                    "Проверить обязательные поля, даты, СНИЛС и реквизиты документа",
                    "Просмотреть предупреждения после автоматической обработки",
                    "Загрузить файл вручную и проверить ответ официальной системы",
                  ].map((item, index) => (
                    <div key={item} className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/70 p-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-xs font-semibold text-accent">
                        {index + 1}
                      </span>
                      <p className="pt-1 text-sm text-foreground/85">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="absolute -top-4 -right-4 px-3 py-1.5 rounded-full bg-accent text-accent-foreground text-xs font-bold shadow-lg rotate-3">
                Ручная проверка обязательна
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Типы программ */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-4xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-8 text-center">Типы образовательных программ</motion.h2>
            <motion.div variants={fadeUp} className="grid sm:grid-cols-3 gap-4">
              {[
                { title: "Повышение квалификации", icon: CheckCircle2, desc: "Удостоверения о повышении квалификации" },
                { title: "Профессиональная переподготовка", icon: FileCheck, desc: "Дипломы о профессиональной переподготовке" },
                { title: "Профессиональное обучение", icon: Shield, desc: "Свидетельства о профессии рабочего / должности служащего" },
              ].map((item) => (
                <Card key={item.title} className="bg-card/80 backdrop-blur-sm border-border/50">
                  <CardContent className="p-6 text-center">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mx-auto mb-3">
                      <item.icon className="w-5 h-5 text-accent" />
                    </div>
                    <h4 className="font-medium mb-2 text-sm">{item.title}</h4>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Возможности системы */}
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-4xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-4 text-center">Возможности системы</motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground text-center mb-10 max-w-2xl mx-auto">
              Синтагма автоматизирует весь процесс подготовки данных для ФИС ФРДО
            </motion.p>
            <motion.div variants={fadeUp} className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: Upload, text: "Массовая и индивидуальная подготовка XLSX-файлов" },
                { icon: CheckCircle2, text: "Автоматические проверки поддерживаемых полей и форматов" },
                { icon: Shield, text: "Подсказка по заполнению пола с обязательной проверкой оператором" },
                { icon: Database, text: "Генерация номеров документов и регистрационных номеров" },
                { icon: FileCheck, text: "Поддержка форматов 35/41 столбцов; актуальный шаблон сверяет оператор" },
                { icon: Scale, text: "Учёт подтверждённых утрат, обменов и уничтожений документов" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-card/80 backdrop-blur-sm border border-border/50">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                    <item.icon className="w-4 h-4 text-accent" />
                  </div>
                  <p className="text-sm text-foreground/80">{item.text}</p>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Юридическое обоснование */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-4xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-8 text-center">Юридическое обоснование</motion.h2>
            <motion.div variants={fadeUp} className="space-y-3">
              {[
                "Часть 10 статьи 98 Федерального закона № 273-ФЗ «Об образовании в Российской Федерации»",
                "Постановление Правительства РФ от 31.05.2021 № 825 о ФИС ФРДО",
                "Постановление Правительства РФ от 07.06.2025 № 850: срок для соответствующей категории документов — 30 календарных дней с 01.09.2025",
                "Актуальные инструкции и шаблоны в официальном кабинете ФИС ФРДО",
              ].map((text, i) => (
                <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-card/80 border border-border/50">
                  <Scale className="w-4 h-4 text-accent shrink-0 mt-1" />
                  <p className="text-sm text-muted-foreground">{text}</p>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Live-инструмент: очистка чужого файла прямо здесь */}
      <section className="py-20 bg-gradient-to-br from-primary/5 via-background to-accent/5 border-y border-primary/10">
        <div className="container mx-auto px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="max-w-4xl mx-auto"
          >
            <motion.div variants={fadeUp} className="text-center mb-10">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-5">
                <Wrench className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-primary">Бесплатно · без регистрации</span>
              </div>
              <h2 className="font-display text-3xl md:text-4xl font-medium mb-4 tracking-tight">
                Предварительная проверка и очистка XLSX
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Загрузите XLSX-файл: инструмент попробует очистить скрытые символы и нормализовать поддерживаемые поля. Скачанный результат необходимо проверить перед загрузкой в официальный кабинет.
              </p>
            </motion.div>

            <motion.div variants={fadeUp}>
              <Card className="border-primary/20 bg-card/90 shadow-2xl">
                <CardContent className="p-8 md:p-10">
                  <div className="grid md:grid-cols-3 gap-6 mb-8">
                    {[
                      { n: "1", title: "Загрузите XLSX", desc: "Поддерживаемый файл с табличными данными" },
                      { n: "2", title: "Проверьте обработку", desc: "СНИЛС, даты и скрытые символы" },
                      { n: "3", title: "Скачайте и сверьте", desc: "Результат требует ручного контроля" },
                    ].map((s) => (
                      <div key={s.n} className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-display font-medium shrink-0">
                          {s.n}
                        </div>
                        <div>
                          <div className="font-medium text-sm mb-1">{s.title}</div>
                          <div className="text-xs text-muted-foreground">{s.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col items-center gap-4">
                    <Button
                      size="lg"
                      onClick={() => setSanitizerOpen(true)}
                      className="btn-accent px-8 gap-2 shadow-lg"
                    >
                      <Wrench className="w-5 h-5" />
                      Проверить XLSX-файл
                    </Button>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Lock className="w-3.5 h-3.5" />
                      Файл обрабатывается в браузере и не отправляется на сервер
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto px-6 text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-4">
              Подготовьте данные для ФИС ФРДО
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground mb-3 max-w-xl mx-auto">
              СИНТАГМА формирует XLSX-файл и показывает результаты предварительных проверок. Загрузку в официальный кабинет и контроль ответа выполняет ответственный сотрудник организации.
            </motion.p>
            <motion.p variants={fadeUp} className="text-sm text-muted-foreground mb-8 max-w-xl mx-auto">
              Доступность функций и лимиты зависят от выбранного тарифа и отображаются в кабинете организации.
            </motion.p>
            <motion.div variants={fadeUp}>
              <Link to="/register-organization">
                <Button size="lg" className="btn-accent px-8">
                  Зарегистрировать организацию
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <Footer />

      <FrdoFileSanitizerDialog open={sanitizerOpen} onOpenChange={setSanitizerOpen} />
    </div>
  );
};

export default FeatureFRDO;
