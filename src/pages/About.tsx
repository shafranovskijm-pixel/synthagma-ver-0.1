import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { ArrowLeft, Building2, Mail, Phone, MapPin, FileText, Shield, Users, Target, Lightbulb, Award } from "lucide-react";

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
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <SigmaLogo size="sm" />
          </Link>
          <Link to="/">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              На главную
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
              <Building2 className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">О компании</span>
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent">
              СИНТАГМА — современная платформа для образования
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Мы создаём инновационные решения для дистанционного обучения и автоматизации документооборота образовательных организаций
            </p>
          </div>
        </div>
      </section>

      {/* Mission & Values */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-4">
                  <Target className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Наша миссия</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Сделать качественное образование доступным для каждого, предоставляя современные инструменты для обучения и управления образовательным процессом.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-accent/5 to-accent/10 border-accent/20">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center mb-4">
                  <Lightbulb className="w-6 h-6 text-accent" />
                </div>
                <CardTitle>Инновации</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Используем передовые технологии, включая искусственный интеллект, для создания интерактивного и эффективного образовательного контента.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-sigma-green/5 to-sigma-green/10 border-sigma-green/20">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-sigma-green/20 flex items-center justify-center mb-4">
                  <Shield className="w-6 h-6 text-sigma-green" />
                </div>
                <CardTitle>Соответствие</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Наша платформа полностью соответствует требованиям 273-ФЗ «Об образовании» и готова к интеграции с ФРДО и государственными системами.
                </p>
              </CardContent>
            </Card>
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
      <section className="py-16">
        <div className="container mx-auto px-6">
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

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container mx-auto px-6 text-center">
          <p className="text-muted-foreground text-sm">
            © 2026 СИНТАГМА. Все права защищены.
          </p>
          <a href="https://24zxc.ru" target="_blank" rel="noopener noreferrer" className="text-muted-foreground/60 text-xs hover:text-muted-foreground transition-colors">
            Создание сайтов и рекламы — 24zxc.ru
          </a>
        </div>
      </footer>
    </div>
  );
};

export default About;
