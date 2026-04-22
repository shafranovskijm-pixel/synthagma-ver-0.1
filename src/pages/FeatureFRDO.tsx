import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { ArrowLeft, Database, AlertTriangle, Clock, FileCheck, Upload, Shield, CheckCircle2, Scale, Sparkles, ShieldCheck, FileSpreadsheet } from "lucide-react";
import { motion } from "framer-motion";
import { Footer } from "@/components/landing/Footer";
import frdoErrorsPain from "@/assets/features/frdo-errors-pain.png";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

const FeatureFRDO = () => {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Выпуск ФРДО и реестр документов об образовании — СИНТАГМА</title>
        <meta name="description" content="Автоматизация ФИС ФРДО: подготовка XLSX-шаблонов 35/41, реестр документов об образовании, валидация СНИЛС/дат до выгрузки. Формирование файла — на любом тарифе, выгрузка — на «Профессиональном»." />
        <meta name="keywords" content="выпуск ФРДО, реестр документов об образовании, ФИС ФРДО, выгрузка ФРДО, шаблон ФРДО 35 столбцов, шаблон ФРДО 41 столбец, автоматизация ФРДО, обрнадзор ФРДО, удостоверения о повышении квалификации, дипломы переподготовки" />
        <link rel="canonical" href="https://sintagma.com.ru/feature/frdo" />
        <meta property="og:title" content="Выпуск ФРДО и реестр документов об образовании — СИНТАГМА" />
        <meta property="og:description" content="Готовый реестр документов об образовании и автоматическая выгрузка в ФИС ФРДО без ошибок «недопустимый символ». Формирование — бесплатно, выгрузка — на тарифе «Профессиональный»." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://sintagma.com.ru/feature/frdo" />
        <meta property="og:image" content="https://sintagma.com.ru/og-image.png" />
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
              Автоматизация подготовки и выгрузки данных в ФИС ФРДО — без ошибок, штрафов и ручной работы
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
                Обязанность по внесению данных установлена <strong className="text-foreground">Федеральным законом № 273-ФЗ «Об образовании в Российской Федерации»</strong> (статьи 98, 107) и <strong className="text-foreground">ФЗ-152 «О персональных данных»</strong> (статья 6).
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
                    Сведения о выданных документах об образовании и (или) о квалификации необходимо внести в ФИС ФРДО <strong className="text-foreground">в течение 60 дней</strong> после выдачи документа.
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
                    За невнесение или несвоевременное внесение данных в ФИС ФРДО предусмотрены штрафы <strong className="text-foreground">от 10 000 до 150 000 рублей</strong> за каждый невнесённый документ.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Pain block — реальный скриншот ошибок ФИС ФРДО */}
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
                Десятки строк <span className="text-destructive">«недопустимый символ»</span> перед каждой загрузкой в ФИС ФРДО
              </h2>

              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                Невидимые пробелы в СНИЛС, неправильные форматы дат, лишние табуляции — и так каждый месяц. Часы ручной чистки Excel перед каждой выгрузкой.
              </p>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-foreground mb-3">С Синтагмой — ноль ошибок:</p>
                {[
                  { icon: Sparkles, text: "Авто-форматирование СНИЛС, дат, ФИО" },
                  { icon: ShieldCheck, text: "Очистка скрытых пробелов и табуляций" },
                  { icon: CheckCircle2, text: "Проверка полноты данных ДО выгрузки" },
                  { icon: FileSpreadsheet, text: "Шаблоны 35/41 столбцов под актуальные требования" },
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

            {/* Правая колонка — «скриншот» ошибок в рамке-браузере */}
            <motion.div variants={fadeUp} className="relative">
              <div
                className="relative rounded-xl overflow-hidden shadow-2xl border border-border/50 bg-card"
                style={{ transform: "rotate(1.5deg)" }}
              >
                {/* Псевдо-шапка браузера */}
                <div className="flex items-center gap-1.5 px-4 py-3 bg-muted/60 border-b border-border/50">
                  <div className="w-3 h-3 rounded-full bg-destructive/60" />
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/40" />
                  <div className="w-3 h-3 rounded-full bg-accent/60" />
                  <div className="ml-3 px-3 py-1 rounded-md bg-background/80 text-xs text-muted-foreground font-mono truncate">
                    fis-frdo.obrnadzor.gov.ru — лог ошибок
                  </div>
                </div>
                <img
                  src={frdoErrorsPain}
                  alt="Реальный лог ошибок валидатора ФИС ФРДО — десятки строк «недопустимый символ»"
                  className="w-full h-auto block"
                  loading="lazy"
                />
              </div>

              {/* Декоративный «штамп» сверху */}
              <div className="absolute -top-4 -right-4 px-3 py-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold shadow-lg rotate-6">
                Реальный кейс клиента
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
                { icon: Upload, text: "Массовый и индивидуальный экспорт данных в формате ФИС ФРДО" },
                { icon: CheckCircle2, text: "Автоматическая проверка полноты и корректности данных" },
                { icon: Shield, text: "Автоматическое определение пола по отчеству" },
                { icon: Database, text: "Генерация номеров документов и регистрационных номеров" },
                { icon: FileCheck, text: "Поддержка шаблонов для ДПО (35 столбцов) и ПО (41 столбец)" },
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
                "Федеральный закон № 273-ФЗ «Об образовании в Российской Федерации» (ст. 98, 107)",
                "Федеральный закон № 152-ФЗ «О персональных данных» (ст. 6)",
                "Постановление Правительства РФ № 729 от 26.08.2013",
                "Письма и разъяснения Рособрнадзора о порядке внесения данных",
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

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto px-6 text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-4">
              Автоматизируйте работу с ФИС ФРДО
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Начните бесплатно и откройте доступ к ФРДО на тарифе «Максимальный»
            </motion.p>
            <motion.div variants={fadeUp}>
              <Link to="/register-organization">
                <Button size="lg" className="btn-accent px-8">
                  Попробовать бесплатно
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

export default FeatureFRDO;
