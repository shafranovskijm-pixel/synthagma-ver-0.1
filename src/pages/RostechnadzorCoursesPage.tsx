import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { ArrowLeft, Shield, Zap, BookOpen, CheckCircle2, Factory, Flame, Droplets, HardHat, Leaf, ArrowRight, Clock, FileCheck, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { Footer } from "@/components/landing/Footer";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

const categories = [
  {
    icon: Factory,
    title: "Промышленная безопасность",
    count: 85,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    courses: [
      "А.1 — Общие требования промышленной безопасности",
      "Б.1.1–Б.1.19 — Химическая, нефтехимическая и нефтеперерабатывающая промышленность",
      "Б.2.1–Б.2.6 — Нефтяная и газовая промышленность",
      "Б.3.1–Б.3.3 — Металлургическая промышленность",
      "Б.4.1–Б.4.5 — Горнорудная промышленность",
      "Б.5.1–Б.5.3 — Угольная промышленность",
      "Б.6.1–Б.6.3 — Маркшейдерское обеспечение",
      "Б.7.1–Б.7.9 — Подъёмные сооружения",
      "Б.8.1–Б.8.26 — Оборудование под давлением",
      "Б.9.1–Б.9.3 — Газоснабжение",
      "Б.10.1–Б.10.2 — Транспортирование опасных веществ",
      "Б.11.1–Б.11.2 — Взрывные работы",
      "Б.12.1 — Объекты хранения и переработки растительного сырья",
    ],
  },
  {
    icon: Zap,
    title: "Электробезопасность",
    count: 30,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    courses: [
      "Группа допуска II — до 1000 В",
      "Группа допуска III — до 1000 В",
      "Группа допуска III — до и выше 1000 В",
      "Группа допуска IV — до 1000 В",
      "Группа допуска IV — до и выше 1000 В",
      "Группа допуска V — до и выше 1000 В",
      "ЭБ 100 — Электробезопасность для потребителей",
      "ЭБ 200 — Электробезопасность для генерации",
      "ЭБ 300 — Электробезопасность для электросетей",
    ],
  },
  {
    icon: Flame,
    title: "Энергетика",
    count: 25,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    courses: [
      "Г.1 — Эксплуатация электроустановок",
      "Г.2 — Эксплуатация тепловых энергоустановок и тепловых сетей",
      "Г.3 — Эксплуатация гидроэлектростанций",
      "Тепловые электрические станции",
      "Электрические станции и сети",
    ],
  },
  {
    icon: Leaf,
    title: "Экологическая безопасность",
    count: 20,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    courses: [
      "Обращение с отходами I–IV класса опасности",
      "Экологическая безопасность для руководителей",
      "Экологическая безопасность для специалистов",
      "Охрана окружающей среды на предприятии",
    ],
  },
  {
    icon: Droplets,
    title: "Гидротехнические сооружения",
    count: 15,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    courses: [
      "Д.1 — Гидротехнические сооружения объектов промышленности и энергетики",
      "Д.2 — Содержание и обслуживание гидротехнических сооружений",
      "Безопасность гидротехнических сооружений",
    ],
  },
  {
    icon: HardHat,
    title: "Строительный контроль",
    count: 25,
    color: "text-accent",
    bgColor: "bg-accent/10",
    courses: [
      "Строительный контроль заказчика и подрядчика",
      "Техническое обследование зданий и сооружений",
      "Промышленная безопасность при строительстве",
      "Авторский надзор в строительстве",
      "Пожарная безопасность объектов строительства",
    ],
  },
];

const advantages = [
  {
    icon: FileCheck,
    title: "Официальные материалы",
    description: "Тесты взяты с официального сайта Ростехнадзора. Полное соответствие требованиям аттестации.",
  },
  {
    icon: RefreshCw,
    title: "Обновлено на 2026 год",
    description: "Все вопросы и ответы актуализированы. Регулярные обновления при изменении нормативной базы.",
  },
  {
    icon: Clock,
    title: "Запуск за 5 минут",
    description: "Подключите готовые курсы к своей организации — не нужно разрабатывать контент с нуля.",
  },
  {
    icon: Shield,
    title: "Подготовка к аттестации",
    description: "Структурированные программы обучения с тестированием. Слушатели готовятся к реальной проверке.",
  },
];

const RostechnadzorCoursesPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Курсы Ростехнадзора 2026 — 200+ программ с актуальными тестами | СИНТАГМА</title>
        <meta name="description" content="Готовые курсы и актуальные тесты Ростехнадзора 2026: промышленная безопасность (А.1, Б.1–Б.12), электробезопасность (II–V группы), энергетика, экология. Быстрое подключение к вашей организации." />
        <meta property="og:title" content="Курсы Ростехнадзора 2026 — 200+ программ | СИНТАГМА" />
        <meta property="og:description" content="Готовые курсы и тесты Ростехнадзора для обучения сотрудников. Промышленная и электробезопасность, энергетика, экология. Актуальные вопросы 2026 года." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://synthagma-bloom.lovable.app/rostechnadzor-courses" />
        <link rel="canonical" href="https://synthagma-bloom.lovable.app/rostechnadzor-courses" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          "name": "Каталог курсов Ростехнадзора",
          "description": "200+ готовых курсов по направлениям аттестации Ростехнадзора",
          "numberOfItems": 200,
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Промышленная безопасность", "description": "А.1, Б.1–Б.12 и другие направления" },
            { "@type": "ListItem", "position": 2, "name": "Электробезопасность", "description": "Группы допуска II–V" },
            { "@type": "ListItem", "position": 3, "name": "Энергетика", "description": "Тепловые установки, электрические станции" },
            { "@type": "ListItem", "position": 4, "name": "Экологическая безопасность", "description": "Обращение с отходами, экологический контроль" },
            { "@type": "ListItem", "position": 5, "name": "Гидротехнические сооружения", "description": "Содержание и обслуживание ГТС" },
            { "@type": "ListItem", "position": 6, "name": "Строительный контроль", "description": "Контроль заказчика и подрядчика" }
          ]
        })}</script>
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

      {/* Hero */}
      <section className="relative py-16 md:py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-primary/5" />
        <div className="absolute inset-0 opacity-[0.015]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: '32px 32px'
        }} />
        <div className="container mx-auto px-6 relative z-10">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="max-w-4xl mx-auto text-center">
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 mb-6">
              <Shield className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-accent">Ростехнадзор · Каталог курсов</span>
            </motion.div>
            <motion.h1 variants={fadeUp} className="font-display text-4xl md:text-5xl font-medium mb-6 tracking-tight">
              200+ курсов по программам{" "}
              <span className="text-accent">Ростехнадзора</span>
            </motion.h1>
            <motion.p variants={fadeUp} className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              Полная база актуальных курсов для аттестации специалистов. Тесты обновлены 
              по материалам официального сайта Ростехнадзора на 2026 год. 
              Подключите готовую библиотеку к своей организации — запустите обучение за 5 минут.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-center gap-4">
              <Link to="/register-organization">
                <Button size="lg" className="btn-gradient rounded-xl px-8 gap-2 group">
                  Подключить курсы
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <a href="#catalog">
                <Button size="lg" variant="outline" className="rounded-xl px-8 gap-2">
                  <BookOpen className="w-4 h-4" />
                  Смотреть каталог
                </Button>
              </a>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Categories catalog */}
      <section id="catalog" className="py-16 md:py-20">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-5xl mx-auto">
            <motion.div variants={fadeUp} className="text-center mb-12">
              <h2 className="font-display text-3xl md:text-4xl font-medium mb-4 tracking-tight">
                Направления обучения
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Курсы охватывают все области аттестации Ростехнадзора — от промышленной безопасности до экологии
              </p>
            </motion.div>

            <div className="grid gap-6">
              {categories.map((cat, i) => (
                <motion.div
                  key={cat.title}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className="border-border/60 bg-card/80 backdrop-blur-sm hover:border-accent/30 transition-colors duration-300 overflow-hidden">
                    <CardContent className="p-6 md:p-8">
                      <div className="flex items-start gap-4 mb-5">
                        <div className={`w-12 h-12 rounded-xl ${cat.bgColor} flex items-center justify-center shrink-0`}>
                          <cat.icon className={`w-6 h-6 ${cat.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="font-display text-xl font-medium">{cat.title}</h3>
                            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-accent/10 text-accent">
                              {cat.count}+ курсов
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 pl-0 md:pl-16">
                        {cat.courses.map((course) => (
                          <div key={course} className="flex items-start gap-2 py-1">
                            <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                            <span className="text-sm text-foreground/75">{course}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Advantages */}
      <section className="py-16 md:py-20 bg-secondary/30">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-5xl mx-auto">
            <motion.div variants={fadeUp} className="text-center mb-12">
              <h2 className="font-display text-3xl md:text-4xl font-medium mb-4 tracking-tight">
                Почему выбирают наши курсы
              </h2>
            </motion.div>

            <motion.div variants={fadeUp} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {advantages.map((adv) => (
                <Card key={adv.title} className="border-border/60 bg-card/80 backdrop-blur-sm h-full">
                  <CardContent className="p-6">
                    <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                      <adv.icon className="w-5 h-5 text-accent" />
                    </div>
                    <h3 className="font-display text-base font-medium mb-2">{adv.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{adv.description}</p>
                  </CardContent>
                </Card>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-6 text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="font-display text-3xl md:text-4xl font-medium mb-4 tracking-tight">
              Подключите курсы к своей организации
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Зарегистрируйте организацию на платформе и получите доступ ко всей библиотеке курсов Ростехнадзора. 
              Запустите обучение сотрудников уже сегодня.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-center gap-4">
              <Link to="/register-organization">
                <Button size="lg" className="btn-gradient rounded-xl px-8 gap-2 group">
                  Начать бесплатно
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
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

export default RostechnadzorCoursesPage;
