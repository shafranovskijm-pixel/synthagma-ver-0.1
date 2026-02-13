import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { ArrowLeft, Camera, Shield, Scale, UserCheck, Clock, CheckCircle2, Eye, MonitorSmartphone } from "lucide-react";
import { motion } from "framer-motion";
import { Footer } from "@/components/landing/Footer";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

const FeatureVideoId = () => {
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
              <Camera className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-accent">Видеоидентификация</span>
            </motion.div>
            <motion.h1 variants={fadeUp} className="font-display text-4xl md:text-5xl font-medium mb-6 tracking-tight">
              Идентификация обучающихся при дистанционной аттестации
            </motion.h1>
            <motion.p variants={fadeUp} className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Соответствие требованиям Постановления Правительства РФ о применении электронного обучения и дистанционных образовательных технологий
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Зачем нужна */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-4xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-8 text-center">Зачем нужна идентификация?</motion.h2>
            <motion.div variants={fadeUp} className="prose prose-lg max-w-none text-muted-foreground space-y-4">
              <p>
                С <strong className="text-foreground">1 марта 2023 года</strong> вступило в силу <strong className="text-foreground">Постановление Правительства РФ от 11.10.2023 № 1678</strong>, утверждающее Правила применения электронного обучения и дистанционных образовательных технологий при реализации образовательных программ.
              </p>
              <p>
                Согласно данному постановлению, образовательные организации обязаны обеспечить <strong className="text-foreground">идентификацию и аутентификацию обучающихся</strong> при проведении промежуточной и итоговой аттестации с использованием дистанционных образовательных технологий.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Требования закона */}
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-4xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-4 text-center">Требования законодательства</motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground text-center mb-10 max-w-2xl mx-auto">
              Ключевые нормы Постановления Правительства РФ № 1678
            </motion.p>
            <motion.div variants={fadeUp} className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: UserCheck, text: "Обязательная идентификация личности обучающегося при проведении промежуточной и итоговой аттестации дистанционно" },
                { icon: Camera, text: "Возможность использования биометрических персональных данных для идентификации и аутентификации" },
                { icon: Eye, text: "Обеспечение фиксации хода проведения аттестации и контроль условий прохождения испытаний" },
                { icon: Shield, text: "Защита персональных данных обучающихся в соответствии с ФЗ-152 при проведении идентификации" },
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

      {/* Как работает в системе */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-4xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-4 text-center">Как работает в Синтагме</motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground text-center mb-10 max-w-2xl mx-auto">
              Простой и удобный процесс идентификации для слушателей и администраторов
            </motion.p>
            <motion.div variants={fadeUp} className="space-y-4">
              {[
                { step: "1", icon: MonitorSmartphone, title: "Фото через камеру устройства", desc: "Слушатель делает фотографию через камеру своего устройства (компьютер, планшет, смартфон) непосредственно в личном кабинете" },
                { step: "2", icon: Scale, title: "Привязка к зачислению", desc: "Фото привязывается к конкретному зачислению и организации для однозначной идентификации" },
                { step: "3", icon: Clock, title: "История проверок", desc: "Полная история проверок со статусами: ожидание, подтверждено, отклонено — с фиксацией даты и времени" },
                { step: "4", icon: UserCheck, title: "Подтверждение администратором", desc: "Администратор организации вручную подтверждает или отклоняет результат идентификации с возможностью запросить повторную" },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-4 p-5 rounded-xl bg-card/80 backdrop-blur-sm border border-border/50">
                  <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0 font-display font-medium text-accent">
                    {item.step}
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">{item.title}</h4>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Ссылки на НПА */}
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-4xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-8 text-center">Нормативно-правовая база</motion.h2>
            <motion.div variants={fadeUp} className="space-y-3">
              {[
                "Постановление Правительства РФ от 11.10.2023 № 1678 «Об утверждении Правил применения электронного обучения, дистанционных образовательных технологий»",
                "Федеральный закон от 29.12.2012 № 273-ФЗ «Об образовании в Российской Федерации» (ст. 16)",
                "Федеральный закон от 27.07.2006 № 152-ФЗ «О персональных данных»",
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
              Обеспечьте соответствие требованиям закона
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Видеоидентификация доступна на тарифах «Профессиональный» и «Максимальный»
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

export default FeatureVideoId;
