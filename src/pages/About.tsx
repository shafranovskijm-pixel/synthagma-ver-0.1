import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Mail, Phone, MapPin, FileText, Shield, Users, Target, Lightbulb, Award } from "lucide-react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Footer } from "@/components/landing/Footer";
import { StarfieldCanvas } from "@/components/landing/StarfieldCanvas";
import { TypewriterText } from "@/components/ui/TypewriterText";
import missionImg from "/images/about/mission.png";
import innovationImg from "/images/about/innovation.png";
import complianceImg from "/images/about/compliance.png";
import requisitesBg from "/images/about/requisites-bg.jpg";

const About = () => {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>О платформе СИНТАГМА — СДО нового поколения</title>
        <meta name="description" content="Узнайте больше о платформе СИНТАГМА: история создания, команда разработчиков, преимущества для образовательных организаций." />
        <meta name="keywords" content="о нас, СИНТАГМА, образовательная платформа, команда разработчиков" />
        <link rel="canonical" href="https://sintagma.com.ru/about" />
        <meta property="og:title" content="О платформе СИНТАГМА — СДО нового поколения" />
        <meta property="og:description" content="Узнайте больше о платформе СИНТАГМА: история создания, команда разработчиков, преимущества для образовательных организаций." />
        <meta property="og:url" content="https://sintagma.com.ru/about" />
        <meta property="og:image" content="https://sintagma.com.ru/og-image.png" />
      </Helmet>
      <LandingHeader />

      {/* Hero Section with starfield */}
      <section className="relative py-20 overflow-hidden bg-[#0a0e1a]">
        <StarfieldCanvas />
        {/* Upward-flying stars into header */}
        <div className="absolute top-0 left-0 right-0 h-24 z-10 overflow-hidden pointer-events-none">
          {[...Array(12)].map((_, i) => {
            const left = 6 + (i * 8) % 88;
            const size = 1 + (i % 3) * 0.5;
            const duration = 2 + (i % 4) * 0.6;
            const delay = (i * 0.35) % 2.5;
            return (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  left: `${left}%`,
                  bottom: 0,
                  width: size,
                  height: size,
                  background: `rgba(255,255,255,${0.2 + (i % 3) * 0.1})`,
                  animation: `star-rise ${duration}s ease-out ${delay}s infinite`,
                }}
              />
            );
          })}
        </div>
        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 mb-6">
              <Building2 className="w-4 h-4 text-white/80" />
              <span className="text-sm font-medium text-white/80">О компании</span>
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-bold mb-6 text-white">
              <TypewriterText text="СИНТАГМА — современная платформа для образования" speed={45} delay={300} />
            </h1>
            <p className="text-xl text-white/70 max-w-2xl mx-auto">
              Мы создаём инновационные решения для дистанционного обучения и автоматизации документооборота образовательных организаций
            </p>
          </div>
        </div>
      </section>

      {/* Mission & Values — Comic-style cards */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-0 max-w-5xl mx-auto">
            {/* Card 1 — Наша миссия */}
            <div className="relative border-2 border-foreground/20 rounded-tl-3xl rounded-bl-3xl md:rounded-bl-3xl p-8 bg-gradient-to-br from-primary/5 to-primary/10 overflow-hidden group hover:scale-[1.03] transition-transform duration-300 z-10">
              <div className="absolute -top-1 -right-1 w-8 h-8 border-b-2 border-l-2 border-foreground/20 rounded-bl-xl bg-background" />
              <img src={missionImg} alt="Миссия" className="absolute -bottom-6 -right-6 w-32 h-32 opacity-15 group-hover:opacity-25 transition-opacity duration-500" loading="lazy" width={512} height={512} />
              <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center mb-5 rotate-[-3deg] group-hover:rotate-0 transition-transform">
                <Target className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-display text-xl font-bold mb-3 tracking-tight">Наша миссия</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Сделать качественное образование доступным для каждого, предоставляя современные инструменты для обучения и управления образовательным процессом.
              </p>
              <div className="absolute bottom-3 right-4 flex gap-1 opacity-30">
                {[...Array(4)].map((_, i) => <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary" />)}
              </div>
            </div>

            {/* Card 2 — Инновации */}
            <div className="relative border-2 border-foreground/20 p-8 bg-gradient-to-br from-accent/5 to-accent/10 overflow-hidden group hover:scale-[1.03] transition-transform duration-300 z-20 -mx-px">
              <div className="absolute -top-1 -right-1 w-8 h-8 border-b-2 border-l-2 border-foreground/20 rounded-bl-xl bg-background" />
              <img src={innovationImg} alt="Инновации" className="absolute -bottom-6 -right-6 w-32 h-32 opacity-15 group-hover:opacity-25 transition-opacity duration-500" loading="lazy" width={512} height={512} />
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-3 overflow-hidden">
                <div className="w-4 h-4 bg-accent/10 border-2 border-foreground/20 rotate-45 transform origin-bottom-left translate-y-1 translate-x-1" />
              </div>
              <div className="w-14 h-14 rounded-2xl bg-accent/15 flex items-center justify-center mb-5 rotate-[2deg] group-hover:rotate-0 transition-transform">
                <Lightbulb className="w-7 h-7 text-accent" />
              </div>
              <h3 className="font-display text-xl font-bold mb-3 tracking-tight">Инновации</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Используем передовые технологии, включая искусственный интеллект, для создания интерактивного и эффективного образовательного контента.
              </p>
              <div className="absolute bottom-3 right-4 flex gap-1 opacity-30">
                {[...Array(4)].map((_, i) => <div key={i} className="w-1.5 h-1.5 rounded-full bg-accent" />)}
              </div>
            </div>

            {/* Card 3 — Соответствие */}
            <div className="relative border-2 border-foreground/20 rounded-tr-3xl rounded-br-3xl p-8 bg-gradient-to-br from-sigma-green/5 to-sigma-green/10 overflow-hidden group hover:scale-[1.03] transition-transform duration-300 z-10">
              <div className="absolute -top-1 -right-1 w-8 h-8 border-b-2 border-l-2 border-foreground/20 rounded-bl-xl bg-background" />
              <img src={complianceImg} alt="Соответствие" className="absolute -bottom-6 -right-6 w-32 h-32 opacity-15 group-hover:opacity-25 transition-opacity duration-500" loading="lazy" width={512} height={512} />
              <div className="w-14 h-14 rounded-2xl bg-sigma-green/15 flex items-center justify-center mb-5 rotate-[3deg] group-hover:rotate-0 transition-transform">
                <Shield className="w-7 h-7 text-sigma-green" />
              </div>
              <h3 className="font-display text-xl font-bold mb-3 tracking-tight">Соответствие</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Наша платформа полностью соответствует требованиям 273-ФЗ «Об образовании» и готова к интеграции с ФРДО и государственными системами.
              </p>
              <div className="absolute bottom-3 right-4 flex gap-1 opacity-30">
                {[...Array(4)].map((_, i) => <div key={i} className="w-1.5 h-1.5 rounded-full bg-sigma-green" />)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What We Do */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto">
            <h2 className="font-display text-3xl font-bold text-center mb-12">Что мы делаем</h2>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Система дистанционного обучения</h3>
                    <p className="text-muted-foreground text-sm">
                      Современный редактор курсов с ИИ-ассистентом, автоматическое тестирование и отслеживание прогресса учеников.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Управление учениками</h3>
                    <p className="text-muted-foreground text-sm">
                      Удобный импорт, автоматическая рассылка учётных данных и сбор документов через платформу.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Award className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Документооборот</h3>
                    <p className="text-muted-foreground text-sm">
                      Автоматическое создание договоров, счетов, актов, приказов и журналов учёта.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Работа с компаниями</h3>
                    <p className="text-muted-foreground text-sm">
                      Привязка групп учеников к организациям, хранение договоров, счетов и актов.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Интеграция с ФРДО</h3>
                    <p className="text-muted-foreground text-sm">
                      Автоматическое заполнение данных для передачи в Федеральный реестр документов об образовании.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <Lightbulb className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">ИИ-ассистент</h3>
                    <p className="text-muted-foreground text-sm">
                      Консультирование учеников, озвучивание лекций и помощь в создании учебного контента.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Legal Info */}
      <section className="py-16 relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img src={requisitesBg} alt="" className="w-full h-full object-cover opacity-20 dark:opacity-15" loading="lazy" />
          <div className="absolute inset-0 bg-background/90" />
        </div>
        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-2xl mx-auto">
            <h2 className="font-display text-3xl font-bold text-center mb-12">Реквизиты</h2>
            <Card>
              <CardContent className="p-8">
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Наименование</p>
                      <p className="font-semibold">ИП Шафрановский Максим Михайлович</p>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">ОГРНИП</p>
                      <p className="font-mono">324253600042754</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">ИНН</p>
                      <p className="font-mono">253615392404</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Дата регистрации</p>
                    <p>08 мая 2024 г.</p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Основной вид деятельности</p>
                    <p className="text-sm">63.11 — Деятельность по обработке данных, предоставление услуг по размещению информации и связанная с этим деятельность</p>
                  </div>

                  <div className="pt-4 border-t border-border space-y-4">
                    <div className="flex items-center gap-3">
                      <Mail className="w-5 h-5 text-muted-foreground" />
                      <a href="mailto:shafranovskij.m@gmail.com" className="text-primary hover:underline">
                        shafranovskij.m@gmail.com
                      </a>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="w-5 h-5 text-muted-foreground" />
                      <a href="tel:89147213424" className="text-primary hover:underline">
                        +7 (914) 721-34-24
                      </a>
                    </div>
                    <div className="flex items-center gap-3">
                      <MapPin className="w-5 h-5 text-muted-foreground" />
                      <span className="text-muted-foreground">Приморский край, г. Владивосток</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-gradient-to-br from-primary/10 via-accent/5 to-primary/10">
        <div className="container mx-auto px-6 text-center">
          <h2 className="font-display text-3xl font-bold mb-4">Готовы начать?</h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Присоединяйтесь к СИНТАГМЕ и автоматизируйте образовательный процесс вашей организации
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link to="/register-organization">
              <Button className="btn-gradient rounded-xl px-8 py-6 text-lg">
                Зарегистрировать организацию
              </Button>
            </Link>
            <Link to="/">
              <Button variant="outline" className="rounded-xl px-8 py-6 text-lg">
                Подробнее о платформе
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />

      <style>{`
        @keyframes star-rise {
          0% { transform: translateY(0); opacity: 0.6; }
          100% { transform: translateY(-80px); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default About;
