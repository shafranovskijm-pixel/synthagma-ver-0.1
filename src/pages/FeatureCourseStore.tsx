import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { ArrowLeft, Store, Search, ShoppingCart, Users, BookOpen, Send, Star, BarChart3 } from "lucide-react";
import { motion } from "framer-motion";
import { Footer } from "@/components/landing/Footer";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

const FeatureCourseStore = () => {
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
              <Store className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-accent">Магазин курсов</span>
            </motion.div>
            <motion.h1 variants={fadeUp} className="font-display text-4xl md:text-5xl font-medium mb-6 tracking-tight">
              Дополнительный канал продаж ваших курсов
            </motion.h1>
            <motion.p variants={fadeUp} className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Выложите курс в маркетплейс — его увидят все ученики Синтагмы. Готовая аудитория без затрат на рекламу. Доступно на всех тарифах, включая бесплатный.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Для кого */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-4xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-8 text-center">Выгодно для всех участников</motion.h2>
            <motion.div variants={fadeUp} className="grid md:grid-cols-2 gap-6">
              <Card className="h-full border-accent/20 bg-card/80 backdrop-blur-sm">
                <CardContent className="p-8">
                  <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                    <BookOpen className="w-6 h-6 text-accent" />
                  </div>
                  <h3 className="font-display text-xl font-medium mb-3">Для организаций</h3>
                  <p className="text-muted-foreground text-sm">
                    Выложите курс в маркетплейс — его увидят все ученики Синтагмы. Это дополнительный канал продаж без затрат на рекламу. Устанавливайте свои цены, получайте заявки и расширяйте аудиторию.
                  </p>
                </CardContent>
              </Card>
              <Card className="h-full border-accent/20 bg-card/80 backdrop-blur-sm">
                <CardContent className="p-8">
                  <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                    <Users className="w-6 h-6 text-accent" />
                  </div>
                  <h3 className="font-display text-xl font-medium mb-3">Для слушателей</h3>
                  <p className="text-muted-foreground text-sm">
                    Откройте для себя курсы на разные темы от проверенных учебных организаций. Больше вариантов обучения — больше возможностей для профессионального роста.
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
              Простой путь от публикации до продажи
            </motion.p>
            <motion.div variants={fadeUp} className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: BookOpen, text: "Организация публикует курс — он сразу виден всей аудитории платформы" },
                { icon: Search, text: "Слушатели находят курс по нужной теме и отправляют заявку" },
                { icon: Send, text: "Организация получает уведомление и обрабатывает заявку" },
                { icon: Star, text: "Гибкие цены — разные тарифы для организаций и частных слушателей" },
                { icon: BarChart3, text: "Аналитика продаж — отслеживайте спрос и доход" },
                { icon: Store, text: "Полный контроль — публикуйте, редактируйте, снимайте с продажи в любой момент" },
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

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto px-6 text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-4">
              Расширьте аудиторию ваших курсов
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Выложите свой первый курс в маркетплейс — это бесплатно
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

export default FeatureCourseStore;
