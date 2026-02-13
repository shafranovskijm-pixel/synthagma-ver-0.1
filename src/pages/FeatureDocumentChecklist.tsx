import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { ArrowLeft, ClipboardCheck, Upload, Bell, ShieldCheck, FileSearch, FolderOpen, CheckCircle2, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { Footer } from "@/components/landing/Footer";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

const FeatureDocumentChecklist = () => {
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
              <ClipboardCheck className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-accent">Чек-лист документов</span>
            </motion.div>
            <motion.h1 variants={fadeUp} className="font-display text-4xl md:text-5xl font-medium mb-6 tracking-tight">
              Сбор и хранение документов слушателей
            </motion.h1>
            <motion.p variants={fadeUp} className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Упростите проверки Рособрнадзора — автоматизируйте контроль полноты документов каждого слушателя
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Проблема */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-4xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-8 text-center">Зачем это нужно?</motion.h2>
            <motion.div variants={fadeUp} className="grid md:grid-cols-2 gap-6">
              <Card className="h-full border-destructive/20 bg-card/80 backdrop-blur-sm">
                <CardContent className="p-8">
                  <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center mb-4">
                    <AlertTriangle className="w-6 h-6 text-destructive" />
                  </div>
                  <h3 className="font-display text-xl font-medium mb-3">Без чек-листа</h3>
                  <p className="text-muted-foreground text-sm">
                    Документы теряются, сотрудники тратят часы на поиск, а при проверке Рособрнадзора выясняется, что у слушателей не хватает паспортов, СНИЛС или дипломов.
                  </p>
                </CardContent>
              </Card>
              <Card className="h-full border-accent/20 bg-card/80 backdrop-blur-sm">
                <CardContent className="p-8">
                  <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                    <ShieldCheck className="w-6 h-6 text-accent" />
                  </div>
                  <h3 className="font-display text-xl font-medium mb-3">С чек-листом</h3>
                  <p className="text-muted-foreground text-sm">
                    Вы видите, какие документы есть у каждого слушателя, какие отсутствуют, и можете запросить недостающие до начала проверки. Всё хранится в одном месте.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Возможности */}
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-4xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-4 text-center">Как это работает</motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground text-center mb-10 max-w-2xl mx-auto">
              Простой и наглядный контроль документов каждого слушателя
            </motion.p>
            <motion.div variants={fadeUp} className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: ClipboardCheck, text: "Настраиваемый список обязательных документов для каждого курса или организации" },
                { icon: Upload, text: "Слушатели загружают документы через личный кабинет самостоятельно" },
                { icon: FileSearch, text: "Наглядный статус: какие документы есть, каких не хватает — на одном экране" },
                { icon: Bell, text: "Автоматические напоминания слушателям о недостающих документах" },
                { icon: FolderOpen, text: "Централизованное хранение всех документов с возможностью скачивания и просмотра" },
                { icon: CheckCircle2, text: "Готовность к проверке: мгновенный отчёт о полноте документов по всем слушателям" },
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

      {/* Рособрнадзор */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-4xl mx-auto text-center">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-4">Готовьтесь к проверкам заранее</motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground max-w-2xl mx-auto mb-8">
              При плановых и внеплановых проверках Рособрнадзора организация должна предоставить полный комплект документов по каждому слушателю. Чек-лист документов помогает убедиться, что все документы собраны и хранятся в надёжном месте — ещё до начала проверки.
            </motion.p>
            <motion.div variants={fadeUp} className="grid sm:grid-cols-3 gap-4">
              {[
                { title: "Паспорт", desc: "Копия документа, удостоверяющего личность" },
                { title: "СНИЛС", desc: "Страховой номер индивидуального лицевого счёта" },
                { title: "Диплом", desc: "Документ об образовании и квалификации" },
              ].map((item) => (
                <Card key={item.title} className="bg-card/80 backdrop-blur-sm border-border/50">
                  <CardContent className="p-6 text-center">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mx-auto mb-3">
                      <CheckCircle2 className="w-5 h-5 text-accent" />
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

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto px-6 text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-4">
              Контролируйте документы слушателей
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Доступно с тарифа «Стандарт» — начните собирать документы уже сегодня
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

export default FeatureDocumentChecklist;
