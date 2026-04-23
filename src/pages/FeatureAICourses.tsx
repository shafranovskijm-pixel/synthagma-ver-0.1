import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { ArrowLeft, Sparkles, Brain, FileText, Mic } from "lucide-react";
import { motion } from "framer-motion";
import { Footer } from "@/components/landing/Footer";
import { CourseEditorDemo } from "@/components/landing/CourseEditorDemo";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
};

const DEMO_AUDIO_BASE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/demo-assets`;

const courseDemos = [
  {
    title: "Промышленная безопасность",
    fileName: "lesson-01-safety.md",
    audioUrl: `${DEMO_AUDIO_BASE}/demo-safety.mp3`,
    initialBlocks: [
      { id: "s1", type: "heading1" as const, content: "Промышленная безопасность" },
      { id: "s2", type: "paragraph" as const, content: "Работодатель обязан организовать обучение работников безопасным методам и приёмам выполнения работ, а также оказанию первой помощи пострадавшим." },
      { id: "s3", type: "callout" as const, content: "Нарушение требований промышленной безопасности на опасных производственных объектах влечёт штраф до 1 000 000 рублей." },
    ],
    generatedBlock: {
      id: "s4",
      type: "paragraph" as const,
      content: "К опасным производственным факторам относятся: работа на высоте, эксплуатация грузоподъёмного оборудования, работа в замкнутых пространствах и обращение с вредными химическими веществами.",
      isNew: true,
    },
  },
  {
    title: "Пожарная безопасность",
    fileName: "lesson-01-fire.md",
    audioUrl: `${DEMO_AUDIO_BASE}/demo-fire.mp3`,
    initialBlocks: [
      { id: "f1", type: "heading1" as const, content: "Пожарная безопасность" },
      { id: "f2", type: "paragraph" as const, content: "Все сотрудники обязаны пройти инструктаж по пожарной безопасности при приёме на работу и не реже одного раза в год повторно." },
      { id: "f3", type: "callout" as const, content: "При обнаружении пожара немедленно сообщите по телефону 112, оповестите окружающих и приступайте к эвакуации." },
    ],
    generatedBlock: {
      id: "f4",
      type: "paragraph" as const,
      content: "Огнетушители подразделяются на порошковые (ОП), углекислотные (ОУ) и воздушно-пенные (ОВП). Выбор типа зависит от класса пожара и характера горючего материала.",
      isNew: true,
    },
  },
  {
    title: "Информационная безопасность",
    fileName: "lesson-01-infosec.md",
    audioUrl: `${DEMO_AUDIO_BASE}/demo-infosec.mp3`,
    initialBlocks: [
      { id: "i1", type: "heading1" as const, content: "Информационная безопасность" },
      { id: "i2", type: "paragraph" as const, content: "Федеральный закон 152-ФЗ обязывает операторов персональных данных обеспечивать их защиту от несанкционированного доступа и утечек." },
      { id: "i3", type: "callout" as const, content: "Передача персональных данных третьим лицам без согласия субъекта влечёт административную и уголовную ответственность." },
    ],
    generatedBlock: {
      id: "i4",
      type: "paragraph" as const,
      content: "Базовые правила цифровой гигиены: используйте сложные пароли, не открывайте подозрительные вложения, блокируйте экран при отходе от рабочего места и регулярно обновляйте ПО.",
      isNew: true,
    },
  },
];

const aiFeatures = [
  {
    icon: Brain,
    title: "ИИ-генерация контента",
    description: "Создавайте структуру курса, уроки и тестовые вопросы с помощью искусственного интеллекта. Просто опишите тему — ИИ сделает остальное.",
  },
  {
    icon: Mic,
    title: "ИИ-озвучка уроков",
    description: "Профессиональная озвучка текстов через SaluteSpeech — реалистичные русские голоса. Превратите текст в аудио-лекцию.",
  },
  {
    icon: FileText,
    title: "Генерация тестов",
    description: "ИИ автоматически создаёт вопросы по содержанию урока. Итеративно наращивайте базу вопросов нажатием одной кнопки.",
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

      {/* Interactive Course Demos */}
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-6xl mx-auto">
            <motion.h2 variants={fadeUp} className="font-display text-3xl font-medium mb-4 text-center">
              Попробуйте прямо сейчас
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground text-center mb-10 max-w-xl mx-auto">
              Нажмите «Сгенерировать» или «Озвучить» — демонстрация работы ИИ
            </motion.p>
            <motion.div variants={fadeUp} className="grid md:grid-cols-3 gap-6">
              {courseDemos.map((demo, i) => (
                <CourseEditorDemo
                  key={i}
                  title={demo.title}
                  fileName={demo.fileName}
                  initialBlocks={demo.initialBlocks}
                  generatedBlock={demo.generatedBlock}
                  audioUrl={demo.audioUrl}
                />
              ))}
            </motion.div>
            <p className="text-center text-xs text-muted-foreground mt-6">
              В демонстрации используется алгоритм вместо реального ИИ. Полноценный ИИ доступен после регистрации.
            </p>
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
                { step: "4", title: "Озвучьте уроки", desc: "Профессиональная озвучка через SaluteSpeech — реалистичные русские голоса" },
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
