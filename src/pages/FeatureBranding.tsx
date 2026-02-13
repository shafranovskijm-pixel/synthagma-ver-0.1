import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { ArrowLeft, Palette, Image, LogIn, Type, Monitor, Sparkles, Layout } from "lucide-react";
import { motion } from "framer-motion";
import { Footer } from "@/components/landing/Footer";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

const FeatureBranding = () => {
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
              <Palette className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-accent">Брендирование</span>
            </motion.div>
            <motion.h1 variants={fadeUp} className="font-display text-4xl md:text-5xl font-medium mb-6 tracking-tight">
              Ваш бренд — на каждом экране
            </motion.h1>
            <motion.p variants={fadeUp} className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Настройте внешний вид личного кабинета и страницы входа с вашим фирменным стилем — логотип, обложка, цвета и персональная ссылка
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Возможности */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-4xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-4 text-center">Что входит в брендирование</motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground text-center mb-10 max-w-2xl mx-auto">
              Полный контроль над визуальным восприятием вашей образовательной платформы
            </motion.p>
            <motion.div variants={fadeUp} className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: Image, title: "Обложка и логотип", desc: "Загрузите обложку организации и логотип, которые будут отображаться в шапке личного кабинета" },
                { icon: Palette, title: "Фирменные цвета", desc: "Настройте основной и дополнительный цвета интерфейса в соответствии с вашим брендбуком" },
                { icon: Type, title: "Название и подзаголовок", desc: "Укажите кастомное название и подзаголовок организации для боковой панели и шапки" },
                { icon: LogIn, title: "Брендированная страница входа", desc: "Создайте уникальную страницу авторизации с вашим логотипом, обложкой и персональной ссылкой" },
                { icon: Layout, title: "Настройки кабинета ученика", desc: "Управляйте отображением разделов: библиотека, достижения, ИИ-чат — в личном кабинете слушателей" },
                { icon: Monitor, title: "Персональная ссылка", desc: "Получите уникальный URL вида login/ваша-организация для входа слушателей под вашим брендом" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-5 rounded-xl bg-card/80 backdrop-blur-sm border border-border/50">
                  <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                    <item.icon className="w-4 h-4 text-accent" />
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

      {/* Как работает */}
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-4xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-4 text-center">Как это работает</motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground text-center mb-10 max-w-2xl mx-auto">
              Настройка занимает несколько минут — результат виден сразу
            </motion.p>
            <motion.div variants={fadeUp} className="space-y-4">
              {[
                { step: "1", icon: Image, title: "Загрузите логотип и обложку", desc: "Загрузите изображения в настройках организации. Рекомендуемый размер обложки — 1920×400 px" },
                { step: "2", icon: Palette, title: "Выберите фирменные цвета", desc: "Укажите основной и дополнительный цвета — они будут применены ко всему интерфейсу кабинета" },
                { step: "3", icon: LogIn, title: "Настройте страницу входа", desc: "Активируйте брендированный вход, загрузите фон и получите персональную ссылку для слушателей" },
                { step: "4", icon: Sparkles, title: "Готово!", desc: "Слушатели увидят ваш бренд на странице входа, в шапке кабинета и боковой панели" },
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

      {/* Преимущества */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-4xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-8 text-center">Почему это важно</motion.h2>
            <motion.div variants={fadeUp} className="grid sm:grid-cols-3 gap-4">
              {[
                { title: "Узнаваемость", desc: "Слушатели видят ваш бренд, а не платформу — это повышает доверие и лояльность" },
                { title: "Профессионализм", desc: "Брендированный кабинет подчёркивает серьёзный подход к обучению" },
                { title: "Единый стиль", desc: "Все точки контакта — от входа до сертификата — в вашем фирменном стиле" },
              ].map((item, i) => (
                <div key={i} className="p-5 rounded-xl bg-card/80 backdrop-blur-sm border border-border/50 text-center">
                  <h4 className="font-medium mb-2">{item.title}</h4>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
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
              Покажите свой бренд слушателям
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Брендирование доступно на тарифах «Стандарт», «Профессиональный» и «Максимальный»
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

export default FeatureBranding;
