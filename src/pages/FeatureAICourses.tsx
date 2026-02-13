import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { ArrowLeft, Sparkles, Volume2, BookOpen, ShieldCheck, Flame, HardHat, Brain, Zap, FileText, Mic } from "lucide-react";
import { motion } from "framer-motion";
import { Footer } from "@/components/landing/Footer";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
};

const courseTemplates = [
  {
    icon: HardHat,
    title: "Промышленная безопасность",
    description: "Полный курс по безопасности на производственных объектах: правила работы с оборудованием, средства защиты, действия при аварии",
    lessons: 12,
    duration: "24 часа",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
    tags: ["Охрана труда", "Производство", "Аттестация"],
  },
  {
    icon: Flame,
    title: "Пожарная безопасность",
    description: "Курс по пожарно-техническому минимуму: профилактика пожаров, средства тушения, планы эвакуации, первая помощь при ожогах",
    lessons: 8,
    duration: "16 часов",
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20",
    tags: ["ПТМ", "Эвакуация", "Огнетушители"],
  },
  {
    icon: ShieldCheck,
    title: "Информационная безопасность",
    description: "Защита данных и цифровая гигиена: работа с персональными данными, предотвращение утечек, кибербезопасность для сотрудников",
    lessons: 10,
    duration: "20 часов",
    color: "text-sigma-cyan",
    bgColor: "bg-sigma-cyan/10",
    borderColor: "border-sigma-cyan/20",
    tags: ["152-ФЗ", "Персональные данные", "Кибербезопасность"],
  },
];

const aiFeatures = [
  {
    icon: Brain,
    title: "ИИ-генерация контента",
    description: "Создавайте структуру курса, уроки и тестовые вопросы с помощью искусственного интеллекта. Просто опишите тему — ИИ сделает остальное.",
    link: "/feature/course-settings",
  },
  {
    icon: Mic,
    title: "ИИ-озвучка уроков",
    description: "Профессиональная озвучка текстов через ElevenLabs — реалистичные голоса на русском и английском языках. Превратите текст в аудио-лекцию.",
    link: "/features",
  },
  {
    icon: FileText,
    title: "Генерация тестов",
    description: "ИИ автоматически создаёт вопросы по содержанию урока. Итеративно наращивайте базу вопросов нажатием одной кнопки.",
    link: "/features",
  },
];

const FeatureAICourses = () => {
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
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="container mx-auto px-6 relative z-10">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="max-w-4xl mx-auto text-center">
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">ИИ-генерация курсов</span>
            </motion.div>
            <motion.h1 variants={fadeUp} className="font-display text-4xl md:text-5xl font-medium mb-6 tracking-tight">
              Создавайте курсы с помощью ИИ
            </motion.h1>
            <motion.p variants={fadeUp} className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Генерируйте структуру, контент и тесты за минуты. Озвучивайте уроки профессиональными голосами. Всё — прямо в конструкторе курсов.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* AI Features */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-5xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-4 text-center">
              Возможности ИИ
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground text-center mb-10 max-w-xl mx-auto">
              Автоматизируйте рутину — сосредоточьтесь на качестве обучения
            </motion.p>
            <motion.div variants={fadeUp} className="grid md:grid-cols-3 gap-5">
              {aiFeatures.map((feature, i) => (
                <Card key={i} className="h-full border-border/50 bg-card/80 backdrop-blur-sm hover:border-primary/30 transition-colors group">
                  <CardContent className="p-6">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                      <feature.icon className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-display text-lg font-medium mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Course Templates */}
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-5xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-4 text-center">
              Примеры курсов для генерации
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground text-center mb-10 max-w-xl mx-auto">
              Опишите тему — ИИ создаст полную структуру с уроками и тестами
            </motion.p>
            <motion.div variants={fadeUp} className="grid md:grid-cols-3 gap-6">
              {courseTemplates.map((course, i) => (
                <motion.div
                  key={i}
                  variants={fadeUp}
                  className={`rounded-2xl border ${course.borderColor} bg-card/80 backdrop-blur-sm p-6 hover:shadow-lg transition-all group`}
                >
                  <div className={`w-12 h-12 rounded-xl ${course.bgColor} flex items-center justify-center mb-4`}>
                    <course.icon className={`w-6 h-6 ${course.color}`} />
                  </div>
                  <h3 className="font-display text-lg font-medium mb-2">{course.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{course.description}</p>
                  
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
                    <span className="flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5" />
                      {course.lessons} уроков
                    </span>
                    <span className="flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5" />
                      {course.duration}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {course.tags.map((tag) => (
                      <span key={tag} className={`text-xs px-2 py-0.5 rounded-full ${course.bgColor} ${course.color}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-3xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-10 text-center">
              Как это работает
            </motion.h2>
            <div className="space-y-6">
              {[
                { step: "1", title: "Опишите тему курса", desc: "Введите название и краткое описание — ИИ предложит структуру с уроками" },
                { step: "2", title: "Сгенерируйте контент", desc: "ИИ наполнит каждый урок текстом, примерами и предупреждениями" },
                { step: "3", title: "Добавьте тесты", desc: "Автоматическая генерация вопросов по содержанию уроков" },
                { step: "4", title: "Озвучьте уроки", desc: "Профессиональная озвучка через ElevenLabs — реалистичные голоса на русском" },
              ].map((item, i) => (
                <motion.div key={i} variants={fadeUp} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-primary">{item.step}</span>
                  </div>
                  <div>
                    <h3 className="font-display font-medium mb-1">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto px-6 text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-4">
              Попробуйте ИИ-генерацию прямо сейчас
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground mb-8 max-w-xl mx-auto">
              ИИ-функции доступны на тарифе Максимальный
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/register-organization">
                <Button size="lg" className="btn-accent px-8 gap-2">
                  <Sparkles className="w-4 h-4" />
                  Попробовать бесплатно
                </Button>
              </Link>
              <Link to="/#pricing">
                <Button size="lg" variant="outline" className="px-8">
                  Сравнить тарифы
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

export default FeatureAICourses;
