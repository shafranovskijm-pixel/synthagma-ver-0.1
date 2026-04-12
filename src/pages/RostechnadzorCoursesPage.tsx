import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { FloatingParticles } from "@/components/landing/FloatingParticles";
import { Footer } from "@/components/landing/Footer";
import {
  ArrowLeft, Shield, Zap, BookOpen, CheckCircle2, Factory, Flame,
  HardHat, Leaf, ArrowRight, Clock, FileCheck, RefreshCw,
  Heart, Wrench, Car, Layers, GraduationCap, Briefcase, Settings, Building2
} from "lucide-react";
import { motion } from "framer-motion";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
};

const categories = [
  {
    icon: Zap,
    title: "Электробезопасность",
    count: 121,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    courses: [
      "Группы допуска II–V до и выше 1000 В",
      "ЭБ 100 — Электробезопасность для потребителей",
      "ЭБ 200 — Электробезопасность для генерации",
      "ЭБ 300 — Электробезопасность для электросетей",
      "Допуск к обслуживанию электроустановок",
    ],
  },
  {
    icon: Flame,
    title: "Энергетика",
    count: 64,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    courses: [
      "Г.1 — Эксплуатация электроустановок",
      "Г.2 — Тепловые энергоустановки и тепловые сети",
      "Г.3 — Эксплуатация гидроэлектростанций",
      "Тепловые электрические станции",
      "Электрические станции и сети",
    ],
  },
  {
    icon: HardHat,
    title: "Рабочие профессии",
    count: 21,
    color: "text-amber-600",
    bgColor: "bg-amber-600/10",
    courses: [
      "Стропальщик",
      "Электрогазосварщик",
      "Оператор котельной",
      "Лифтёр",
      "Крановщик",
    ],
  },
  {
    icon: Heart,
    title: "Медицина",
    count: 20,
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
    courses: [
      "Оказание первой помощи",
      "Медицинская подготовка персонала",
      "Охрана здоровья работников",
      "Санитарно-гигиенические требования",
    ],
  },
  {
    icon: Shield,
    title: "Охрана труда",
    count: 18,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    courses: [
      "Общие вопросы охраны труда",
      "Охрана труда для руководителей",
      "Охрана труда для специалистов",
      "Специальная оценка условий труда (СОУТ)",
    ],
  },
  {
    icon: Flame,
    title: "Пожарная безопасность",
    count: 14,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    courses: [
      "Пожарно-технический минимум",
      "Пожарная безопасность для руководителей",
      "Пожарная безопасность объектов",
      "Обучение мерам пожарной безопасности",
    ],
  },
  {
    icon: Building2,
    title: "Строительные специальности",
    count: 10,
    color: "text-sky-500",
    bgColor: "bg-sky-500/10",
    courses: [
      "Строительные машины и механизмы",
      "Монтажные и демонтажные работы",
      "Промышленная безопасность при строительстве",
    ],
  },
  {
    icon: Wrench,
    title: "Слесари",
    count: 8,
    color: "text-zinc-500",
    bgColor: "bg-zinc-500/10",
    courses: [
      "Слесарь-ремонтник",
      "Слесарь по КИПиА",
      "Слесарь-сантехник",
    ],
  },
  {
    icon: Factory,
    title: "Промышленная безопасность",
    count: 8,
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
    courses: [
      "А.1 — Общие требования промышленной безопасности",
      "Б.1–Б.12 — Отраслевые направления",
      "Опасные производственные объекты",
    ],
  },
  {
    icon: Layers,
    title: "Разное",
    count: 7,
    color: "text-slate-500",
    bgColor: "bg-slate-500/10",
    courses: [
      "Работа на высоте",
      "Работа в ограниченных пространствах",
      "Безопасность при работе с инструментом",
    ],
  },
  {
    icon: Car,
    title: "Машинист",
    count: 5,
    color: "text-indigo-500",
    bgColor: "bg-indigo-500/10",
    courses: [
      "Машинист крана",
      "Машинист компрессорных установок",
      "Машинист буровых установок",
    ],
  },
  {
    icon: Leaf,
    title: "Экологическая безопасность",
    count: 3,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    courses: [
      "Обращение с отходами I–IV класса",
      "Экологическая безопасность для руководителей",
      "Экологическая безопасность для специалистов",
    ],
  },
  {
    icon: Settings,
    title: "Строительный контроль",
    count: 2,
    color: "text-accent",
    bgColor: "bg-accent/10",
    courses: [
      "Строительный контроль заказчика и подрядчика",
      "Техническое обследование зданий и сооружений",
    ],
  },
  {
    icon: GraduationCap,
    title: "Профессиональная переподготовка",
    count: 2,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    courses: [
      "Программы профессиональной переподготовки",
      "Повышение квалификации специалистов",
    ],
  },
];

const advantages = [
  {
    icon: FileCheck,
    title: "Готовые программы",
    description: "Курсы уже разработаны и готовы к использованию. Экономьте месяцы на разработку контента.",
  },
  {
    icon: RefreshCw,
    title: "Актуальные на 2026 год",
    description: "Тесты и материалы регулярно обновляются при изменении нормативной базы.",
  },
  {
    icon: Clock,
    title: "Запуск за 5 минут",
    description: "Подключите курсы к своей организации — обучение сотрудников начнётся моментально.",
  },
  {
    icon: Shield,
    title: "14 направлений",
    description: "От электробезопасности и охраны труда до медицины и рабочих профессий.",
  },
];

const jsonLdItems = categories.map((cat, i) => ({
  "@type": "ListItem",
  position: i + 1,
  name: cat.title,
  description: `${cat.count} курсов`,
}));

const RostechnadzorCoursesPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>300+ готовых курсов для обучения сотрудников — 14 направлений | СИНТАГМА</title>
        <meta name="description" content="300+ готовых курсов по 14 направлениям: электробезопасность, энергетика, охрана труда, пожарная безопасность, медицина, рабочие профессии. Подключите к организации за 5 минут." />
        <meta property="og:title" content="300+ готовых курсов для обучения — СИНТАГМА" />
        <meta property="og:description" content="Библиотека готовых курсов по 14 направлениям. Подключите к организации — не нужно разрабатывать контент с нуля." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://sintagma.com.ru/rostechnadzor-courses" />
        <link rel="canonical" href="https://sintagma.com.ru/rostechnadzor-courses" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          "name": "Каталог готовых курсов СИНТАГМА",
          "description": "300+ готовых курсов по 14 направлениям обучения",
          "numberOfItems": 303,
          "itemListElement": jsonLdItems
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

      {/* Hero — dark style */}
      <section className="relative py-20 md:py-28 overflow-hidden bg-gradient-to-b from-background via-background to-secondary/20">
        <FloatingParticles mode="mixed" count={10} />
        <div className="absolute inset-0 opacity-[0.012]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: '32px 32px'
        }} />

        {/* Decorative glows */}
        <div className="absolute top-[10%] right-[8%] w-80 h-80 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-[5%] left-[5%] w-64 h-64 bg-accent/4 rounded-full blur-3xl pointer-events-none" />

        {/* Decorative corners */}
        <motion.div
          className="absolute top-12 left-8 w-14 h-14 border-l border-t border-accent/15 rounded-tl-2xl"
          initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 1, delay: 0.5 }}
        />
        <motion.div
          className="absolute bottom-12 right-8 w-14 h-14 border-r border-b border-accent/15 rounded-br-2xl"
          initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 1, delay: 0.6 }}
        />

        <div className="container mx-auto px-6 relative z-10">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="max-w-4xl mx-auto text-center">
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 mb-6">
              <BookOpen className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-accent">Библиотека · 303 курса · 14 направлений</span>
            </motion.div>
            <motion.h1 variants={fadeUp} className="font-display text-4xl md:text-5xl lg:text-6xl font-medium mb-6 tracking-tight">
              300+ готовых курсов{" "}
              <br className="hidden sm:block" />
              <span className="text-accent">для вашей организации</span>
            </motion.h1>
            <motion.p variants={fadeUp} className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              Ваши клиенты хотят обучение, но разработка программ занимает месяцы? 
              У нас уже всё готово — подключите библиотеку курсов по 14 направлениям 
              и начните обучение прямо сейчас.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-center gap-4">
              <Link to="/register-organization">
                <Button size="lg" className="btn-gradient rounded-xl px-8 h-12 gap-2 group">
                  Подключить курсы бесплатно
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <a href="#catalog">
                <Button size="lg" variant="outline" className="rounded-xl px-8 h-12 gap-2">
                  <BookOpen className="w-4 h-4" />
                  Смотреть каталог
                </Button>
              </a>
            </motion.div>

            {/* Stats row */}
            <motion.div variants={fadeUp} className="grid grid-cols-3 gap-4 max-w-lg mx-auto mt-14">
              {[
                { value: "303", label: "курса" },
                { value: "14", label: "направлений" },
                { value: "5 мин", label: "на подключение" },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="font-display text-2xl md:text-3xl font-medium text-accent">{stat.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Categories catalog */}
      <section id="catalog" className="py-16 md:py-20 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-secondary/20 via-background to-background" />
        <div className="container mx-auto px-6 relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-5xl mx-auto">
            <motion.div variants={fadeUp} className="text-center mb-12">
              <h2 className="font-display text-3xl md:text-4xl font-medium mb-4 tracking-tight">
                14 направлений обучения
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Электробезопасность, энергетика, охрана труда, медицина, пожарная безопасность и многое другое
              </p>
            </motion.div>

            <div className="grid gap-5">
              {categories.map((cat, i) => (
                <motion.div
                  key={cat.title}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.04 }}
                >
                  <Card className="relative border-border/60 bg-card/80 backdrop-blur-sm hover:border-accent/30 transition-all duration-300 overflow-hidden group">
                    {/* Hover glow */}
                    <div className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                      <div className="absolute top-0 left-1/4 w-1/2 h-20 bg-accent/5 blur-2xl" />
                    </div>
                    <CardContent className="p-6 md:p-8 relative z-10">
                      <div className="flex items-start gap-4 mb-4">
                        <div className={`w-12 h-12 rounded-xl ${cat.bgColor} flex items-center justify-center shrink-0`}>
                          <cat.icon className={`w-6 h-6 ${cat.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="font-display text-xl font-medium">{cat.title}</h3>
                            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-accent/10 text-accent">
                              {cat.count} {cat.count >= 5 ? "курсов" : cat.count >= 2 ? "курса" : "курс"}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 pl-0 md:pl-16">
                        {cat.courses.map((course) => (
                          <div key={course} className="flex items-start gap-2 py-1">
                            <CheckCircle2 className="w-4 h-4 text-accent/60 shrink-0 mt-0.5" />
                            <span className="text-sm text-foreground/70">{course}</span>
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
      <section className="py-16 md:py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-background to-secondary/20" />
        <div className="absolute inset-0 opacity-[0.012]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: '32px 32px'
        }} />
        <div className="container mx-auto px-6 relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-5xl mx-auto">
            <motion.div variants={fadeUp} className="text-center mb-12">
              <h2 className="font-display text-3xl md:text-4xl font-medium mb-4 tracking-tight">
                Почему выбирают наши курсы
              </h2>
            </motion.div>

            <motion.div variants={fadeUp} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {advantages.map((adv) => (
                <Card key={adv.title} className="relative border-border/60 bg-card/80 backdrop-blur-sm h-full group overflow-hidden">
                  <div className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-16 bg-accent/10 blur-2xl" />
                  </div>
                  <CardContent className="p-6 relative z-10">
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
      <section className="py-16 md:py-20 relative overflow-hidden">
        <FloatingParticles mode="mixed" count={6} />
        <div className="absolute top-[15%] left-[10%] w-72 h-72 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-[10%] right-[8%] w-64 h-64 bg-accent/4 rounded-full blur-3xl pointer-events-none" />
        <div className="container mx-auto px-6 text-center relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="font-display text-3xl md:text-4xl font-medium mb-4 tracking-tight">
              Подключите 300+ курсов <span className="text-accent">бесплатно</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Зарегистрируйте организацию и получите доступ ко всей библиотеке курсов. 
              Ваши клиенты получат обучение, которого ждут — без месяцев разработки.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-center gap-4">
              <Link to="/register-organization">
                <Button size="lg" className="btn-gradient rounded-xl px-8 h-12 gap-2 group">
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