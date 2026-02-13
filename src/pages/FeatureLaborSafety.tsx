import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { ArrowLeft, HardHat, Users, FileText, ShieldCheck, ClipboardList, UserCheck, RefreshCw, BookOpen } from "lucide-react";
import { motion } from "framer-motion";
import { Footer } from "@/components/landing/Footer";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

const FeatureLaborSafety = () => {
  return (
    <div className="min-h-screen bg-background">
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
          <motion.div initial="hidden" animate="visible" variants={stagger} className="max-w-4xl mx-auto text-center">
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 mb-6">
              <HardHat className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-accent">Охрана труда</span>
            </motion.div>
            <motion.h1 variants={fadeUp} className="font-display text-4xl md:text-5xl font-medium mb-6 tracking-tight">
              Модуль обучения по охране труда
            </motion.h1>
            <motion.p variants={fadeUp} className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Изолированная система управления обучением сотрудников по охране труда — от зачисления до протокола проверки знаний
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Возможности */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-4xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-4 text-center">Ключевые возможности</motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground text-center mb-10 max-w-2xl mx-auto">
              Всё необходимое для организации обучения по охране труда в одном модуле
            </motion.p>
            <motion.div variants={fadeUp} className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: Users, text: "Массовое зачисление группы слушателей на несколько курсов одновременно" },
                { icon: RefreshCw, text: "Автоматическая синхронизация профилей между модулем охраны труда и основной системой" },
                { icon: FileText, text: "Генерация протоколов проверки знаний с полями для подписей комиссии (Word)" },
                { icon: ClipboardList, text: "Сокращённый чек-лист документов: Договор, Паспорт и СНИЛС" },
                { icon: BookOpen, text: "Список курсов ограничен программами категории «Охрана труда»" },
                { icon: UserCheck, text: "Динамический статус обучения: «Сдано», «Обучение: X%», «Завершено», «Не начато»" },
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

      {/* Как это работает */}
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-4xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-8 text-center">Как это работает</motion.h2>
            <motion.div variants={fadeUp} className="grid sm:grid-cols-3 gap-4">
              {[
                { step: "1", title: "Создайте группу", desc: "Добавьте слушателей и назначьте курсы по охране труда" },
                { step: "2", title: "Обучение", desc: "Слушатели проходят курсы и сдают тесты в личном кабинете" },
                { step: "3", title: "Протокол", desc: "Сформируйте протокол проверки знаний одним кликом" },
              ].map((item) => (
                <Card key={item.step} className="bg-card/80 backdrop-blur-sm border-border/50">
                  <CardContent className="p-6 text-center">
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-3">
                      <span className="text-lg font-bold text-accent">{item.step}</span>
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

      {/* Синхронизация */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-4xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-8 text-center">Интеграция с основной системой</motion.h2>
            <motion.div variants={fadeUp} className="grid md:grid-cols-2 gap-6">
              <Card className="h-full border-accent/20 bg-card/80 backdrop-blur-sm">
                <CardContent className="p-8">
                  <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                    <RefreshCw className="w-6 h-6 text-accent" />
                  </div>
                  <h3 className="font-display text-xl font-medium mb-3">Синхронизация профилей</h3>
                  <p className="text-muted-foreground text-sm">
                    Профили слушателей и статус экзамена автоматически синхронизируются между модулем охраны труда и основной таблицей. При разрешении данных приоритет отдаётся версии ФИО из модуля охраны труда.
                  </p>
                </CardContent>
              </Card>
              <Card className="h-full border-accent/20 bg-card/80 backdrop-blur-sm">
                <CardContent className="p-8">
                  <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                    <ShieldCheck className="w-6 h-6 text-accent" />
                  </div>
                  <h3 className="font-display text-xl font-medium mb-3">Доступ в личный кабинет</h3>
                  <p className="text-muted-foreground text-sm">
                    Слушатели получают доступ к личному кабинету для прохождения курсов. Результаты обучения отображаются в модуле охраны труда в реальном времени.
                  </p>
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
              Организуйте обучение по охране труда
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Доступно на тарифах «Профессиональный» и «Максимальный»
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

export default FeatureLaborSafety;
