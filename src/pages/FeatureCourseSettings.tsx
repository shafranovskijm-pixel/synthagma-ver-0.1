import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { ArrowLeft, Settings, VideoOff, ListOrdered, ScanFace, Bell, ClipboardList, Mail, ToggleRight } from "lucide-react";
import { motion } from "framer-motion";
import { Footer } from "@/components/landing/Footer";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

const features = [
  {
    icon: VideoOff,
    title: "Запрет перемотки видео",
    description: "Слушатели не смогут перематывать видеоуроки — это гарантирует полное освоение материала и исключает формальное прохождение",
  },
  {
    icon: ListOrdered,
    title: "Последовательное прохождение",
    description: "Следующий урок открывается только после завершения предыдущего. Слушатель проходит программу в правильном порядке",
  },
  {
    icon: ScanFace,
    title: "Видеоидентификация",
    description: "Подтверждение личности слушателя перед началом обучения. Вы точно знаете, кто проходит курс",
  },
  {
    icon: Bell,
    title: "Напоминания",
    description: "Автоматические уведомления слушателям о дедлайнах, незавершённых уроках и сроках переобучения. Никто не забудет пройти курс вовремя",
  },
  {
    icon: ClipboardList,
    title: "Сбор информации",
    description: "Запрос дополнительных данных от слушателей при зачислении — паспортные данные, место работы, СНИЛС и другие поля для оформления документов",
  },
  {
    icon: Mail,
    title: "Уведомления о завершении",
    description: "Организация получает email, когда слушатель завершил курс. Можно сразу подготовить документы и сертификаты",
  },
];

const FeatureCourseSettings = () => {
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
              <Settings className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-accent">Настройки курсов</span>
            </motion.div>
            <motion.h1 variants={fadeUp} className="font-display text-4xl md:text-5xl font-medium mb-6 tracking-tight">
              Гибкие настройки курсов
            </motion.h1>
            <motion.p variants={fadeUp} className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Управляйте обучением под свои задачи — от контроля прогресса до автоматических напоминаний и сбора данных слушателей
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Features grid */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-5xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-10 text-center">
              Что входит в настройки курсов
            </motion.h2>
            <motion.div variants={fadeUp} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {features.map((feature, i) => (
                <Card key={i} className="h-full border-border/50 bg-card/80 backdrop-blur-sm hover:border-accent/30 transition-colors">
                  <CardContent className="p-6">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                      <feature.icon className="w-5 h-5 text-accent" />
                    </div>
                    <h3 className="font-display text-base font-medium mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Control section */}
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-3xl mx-auto text-center">
            <motion.div variants={fadeUp} className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-6">
              <ToggleRight className="w-7 h-7 text-accent" />
            </motion.div>
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-4">
              Полный контроль обучения
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground max-w-xl mx-auto">
              Все настройки доступны прямо из карточки курса. Включайте и выключайте функции простыми переключателями — не нужно разбираться в сложных меню или обращаться в поддержку.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto px-6 text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-4">
              Настройте обучение под свои задачи
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Доступно начиная с тарифа Старт
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

export default FeatureCourseSettings;
