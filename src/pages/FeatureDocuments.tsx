import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { ArrowLeft, FileCheck, ScrollText, BookOpen, GraduationCap, ClipboardList, ShieldCheck, Sparkles, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { Footer } from "@/components/landing/Footer";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

const documentCategories = [
  {
    title: "Учредительные документы",
    icon: ScrollText,
    items: [
      "Устав организации",
      "Лицензия на осуществление образовательной деятельности",
      "Свидетельство о государственной регистрации",
      "Свидетельство о постановке на учёт в налоговом органе",
    ],
  },
  {
    title: "Локальные нормативные акты",
    icon: FileCheck,
    items: [
      "Правила приёма обучающихся",
      "Порядок и основания перевода, отчисления и восстановления",
      "Порядок осуществления образовательной деятельности",
      "Положение о текущем контроле и промежуточной аттестации",
      "Положение об итоговой аттестации",
      "Положение о внутренней системе оценки качества образования (ВСОКО)",
      "Положение об электронном обучении и ДОТ",
      "Положение о применении сетевой формы обучения",
    ],
  },
  {
    title: "Документы о квалификации",
    icon: GraduationCap,
    items: [
      "Порядок оформления, выдачи и учёта документов о квалификации",
      "Положение о зачёте результатов обучения",
      "Формы документов об образовании и квалификации",
    ],
  },
  {
    title: "Дополнительные ЛНА",
    icon: ClipboardList,
    items: [
      "Положение об оплате труда",
      "Положение о педагогическом совете",
      "Положение о платных образовательных услугах",
      "Политика в отношении обработки персональных данных",
      "Положение о порядке доступа педагогов к информационным сетям",
      "Правила внутреннего трудового распорядка",
    ],
  },
  {
    title: "Основные приказы",
    icon: BookOpen,
    items: [
      "Приказ об утверждении образовательных программ",
      "Приказ об утверждении учебных графиков",
      "Приказ о создании аттестационной комиссии",
      "Приказ об утверждении форм документов о квалификации",
      "Приказ о назначении ответственного за работу с ФИС ФРДО",
    ],
  },
  {
    title: "Отчётность",
    icon: ShieldCheck,
    items: [
      "Отчёт о результатах самообследования",
      "Статистические формы 1-ПК и 1-ПО",
    ],
  },
];

const FeatureDocuments = () => {
  return (
    <div className="min-h-screen bg-background">
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
          <motion.div initial="hidden" animate="visible" variants={stagger} className="max-w-4xl mx-auto text-center">
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 mb-6">
              <FileCheck className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-accent">Документы ЛОО</span>
            </motion.div>
            <motion.h1 variants={fadeUp} className="font-display text-4xl md:text-5xl font-medium mb-6 tracking-tight">
              Документы для лицензированной образовательной организации
            </motion.h1>
            <motion.p variants={fadeUp} className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Полный чек-лист обязательных документов с автоматическим контролем готовности и генерацией отчётов
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* System capabilities */}
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-4xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-4 text-center">Как помогает Синтагма</motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground text-center mb-10 max-w-2xl mx-auto">
              Система ведёт интерактивный чек-лист готовности документов и автоматизирует контроль
            </motion.p>
            <motion.div variants={fadeUp} className="grid sm:grid-cols-3 gap-4">
              {[
                { icon: CheckCircle2, title: "Чек-лист готовности", desc: "Интерактивный список всех обязательных документов с отметками о наличии" },
                { icon: ClipboardList, title: "Контроль по категориям", desc: "Процент заполненности по каждой категории документов" },
                { icon: Sparkles, title: "ИИ-отчёт самообследования", desc: "Автоматическая генерация отчёта о самообследовании с помощью ИИ" },
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

      {/* Document categories */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-4xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-10 text-center">Перечень документов</motion.h2>
            <div className="space-y-6">
              {documentCategories.map((cat) => (
                <motion.div key={cat.title} variants={fadeUp}>
                  <Card className="bg-card/80 backdrop-blur-sm border-border/50 overflow-hidden">
                    <CardContent className="p-0">
                      <div className="flex items-center gap-3 p-5 border-b border-border/50 bg-secondary/20">
                        <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                          <cat.icon className="w-4.5 h-4.5 text-accent" />
                        </div>
                        <h3 className="font-display text-lg font-medium">{cat.title}</h3>
                      </div>
                      <ul className="divide-y divide-border/30">
                        {cat.items.map((item) => (
                          <li key={item} className="flex items-center gap-3 px-5 py-3 text-sm text-muted-foreground">
                            <CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-secondary/30">
        <div className="container mx-auto px-6 text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-4">
              Готовый чек-лист документов для вашей организации
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Начните бесплатно и откройте документооборот на тарифе «Профессиональный»
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

export default FeatureDocuments;
