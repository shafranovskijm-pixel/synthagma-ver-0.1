import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileCheck,
  FileSignature,
  FolderKanban,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Footer } from "@/components/landing/Footer";
import { getGroupDocumentTypes } from "@/lib/groupDocuments";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const stagger = { visible: { transition: { staggerChildren: 0.08 } } };

const workflow = [
  {
    icon: BookOpen,
    title: "Создайте курс",
    text: "Зафиксируйте программу, часы и формат обучения. Курс можно сохранить черновиком до публикации.",
  },
  {
    icon: Users,
    title: "Зарегистрируйте слушателя",
    text: "Карточка слушателя, зачисление и данные для дальнейшего документооборота остаются в одной системе.",
  },
  {
    icon: FolderKanban,
    title: "Соберите учебную группу",
    text: "Синтагма проверяет участников, обучение, данные документов и готовность к ФИС ФРДО.",
  },
  {
    icon: FileSignature,
    title: "Сформируйте договор",
    text: "Доступны сценарии для физлица и компании-заказчика, нумерация и сохранение версии договора.",
  },
  {
    icon: ClipboardCheck,
    title: "Подготовьте документы группы",
    text: "Журнал, приказы, список обучающихся, итоговая ведомость, расписание и книга регистрации собираются из данных группы.",
  },
  {
    icon: Database,
    title: "Проверьте выпуск",
    text: "Перед завершением видны пропуски данных, статус обучения и готовность записей для ФИС ФРДО.",
  },
];

const readyCapabilities = [
  "Создание и повторное открытие курса",
  "Регистрация слушателя и сохранение карточки",
  "Проверка группы по четырём блокам готовности",
  "Договор с физлицом или компанией-заказчиком",
  "Версии документов: текущая и предыдущая",
  "Источники данных и охват перед формированием",
];

const betaCapabilities = [
  "Пакетная сборка 9 документов — Beta до повторной проверки Word-компилятора",
  "Универсальные 8 документов пока формируются как HTML-макеты с явной Beta-меткой",
  "Точные клиентские Word-шаблоны подключаются по согласованному профилю организации",
  "Классный журнал создаётся в Word; PDF-копия пока недоступна",
  "Расписание становится итоговым после заполнения структурированных занятий",
];

const packageDocuments = getGroupDocumentTypes("docs").map(document => document.title);

const FeatureDocuments = () => (
  <div className="min-h-screen bg-background">
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-xl">
      <div className="container mx-auto flex items-center justify-between px-6 py-4">
        <Link to="/" aria-label="На главную Синтагмы"><SigmaLogo size="sm" /></Link>
        <div className="flex items-center gap-2">
          <Link to="/help"><Button variant="ghost">Справка</Button></Link>
          <Link to="/register-organization"><Button className="btn-accent">Попробовать</Button></Link>
        </div>
      </div>
    </header>

    <main>
      <section className="relative overflow-hidden py-20 md:py-28">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-background to-primary/10" />
        <div className="absolute -right-24 top-8 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="container relative z-10 mx-auto px-6">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="mx-auto max-w-5xl text-center">
            <motion.div variants={fadeUp} className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-4 py-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <span className="text-sm font-medium text-accent">Документооборот учебной группы</span>
            </motion.div>
            <motion.h1 variants={fadeUp} className="font-display text-4xl font-medium tracking-tight md:text-6xl">
              От регистрации слушателя до готового комплекта документов
            </motion.h1>
            <motion.p variants={fadeUp} className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground md:text-xl">
              Курс, слушатели, учебная группа, договоры, документы и контроль данных для ФИС ФРДО — в одном сквозном процессе с понятными статусами готовности.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/register-organization">
                <Button size="lg" className="btn-accent gap-2 px-7">Запустить демо-цикл <ArrowRight className="h-4 w-4" /></Button>
              </Link>
              <Link to="/help">
                <Button size="lg" variant="outline" className="gap-2 px-7"><FileCheck className="h-4 w-4" /> Открыть инструкцию</Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section className="border-y border-border bg-secondary/30 py-16">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mx-auto max-w-6xl">
            <motion.div variants={fadeUp} className="mb-10 text-center">
              <Badge variant="secondary" className="mb-3 rounded-full">6 шагов</Badge>
              <h2 className="font-display text-3xl font-medium">Один рабочий цикл без разрозненных таблиц</h2>
            </motion.div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {workflow.map((step, index) => (
                <motion.div key={step.title} variants={fadeUp}>
                  <Card className="h-full border-border/60 bg-card/85">
                    <CardContent className="p-6">
                      <div className="mb-5 flex items-center justify-between">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent"><step.icon className="h-5 w-5" /></div>
                        <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
                      </div>
                      <h3 className="font-display text-lg font-medium">{step.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="container mx-auto px-6">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.05fr_0.95fr]">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
              <motion.div variants={fadeUp} className="mb-6">
                <Badge className="mb-3 rounded-full bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Проверено</Badge>
                <h2 className="font-display text-3xl font-medium">Что готово к показу</h2>
                <p className="mt-3 text-muted-foreground">Функции, которые можно последовательно открыть, выполнить и проверить повторной загрузкой данных.</p>
              </motion.div>
              <motion.div variants={fadeUp} className="space-y-3">
                {readyCapabilities.map(item => (
                  <div key={item} className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {item}
                  </div>
                ))}
              </motion.div>
            </motion.div>

            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
              <motion.div variants={fadeUp} className="mb-6">
                <Badge variant="outline" className="mb-3 rounded-full border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"><AlertTriangle className="mr-1 h-3.5 w-3.5" /> Beta</Badge>
                <h2 className="font-display text-3xl font-medium">Что помечено честно</h2>
                <p className="mt-3 text-muted-foreground">Beta не скрывает функцию: она показывает границу, которую нужно проверить перед промышленным выпуском.</p>
              </motion.div>
              <motion.div variants={fadeUp} className="space-y-3">
                {betaCapabilities.map(item => (
                  <div key={item} className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> {item}
                  </div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="bg-secondary/30 py-16 md:py-20">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mx-auto max-w-6xl">
            <motion.div variants={fadeUp} className="mx-auto mb-10 max-w-3xl text-center">
              <GraduationCap className="mx-auto mb-4 h-9 w-9 text-accent" />
              <h2 className="font-display text-3xl font-medium">Комплект документов учебной группы</h2>
              <p className="mt-3 text-muted-foreground">Договор формируется по выбранному сценарию, а документы группы собираются отдельной версией с фиксированным составом.</p>
            </motion.div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {packageDocuments.map((item, index) => (
                <motion.div key={item} variants={fadeUp} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 font-mono text-xs text-accent">{index + 1}</span>
                  <span>{item}</span>
                </motion.div>
              ))}
            </div>
            <motion.div variants={fadeUp} className="mt-6 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-5 text-sm">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <p><strong>Контроль перед выпуском.</strong> Система показывает источник, количество записей и охват, а документ без достаточных данных остаётся черновиком.</p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-6">
          <Card className="relative mx-auto max-w-5xl overflow-hidden border-0 bg-gradient-to-br from-teal-950 via-teal-900 to-cyan-900 text-white shadow-2xl shadow-teal-950/20">
            <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
            <CardContent className="relative p-8 text-center sm:p-12">
              <h2 className="font-display text-3xl font-medium sm:text-4xl">Покажите полный цикл на одной учебной группе</h2>
              <p className="mx-auto mt-4 max-w-2xl text-teal-100/75">Создайте курс и слушателя, откройте готовность группы, проверьте документы и отдельно увидьте функции со статусом Beta.</p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link to="/register-organization"><Button size="lg" className="bg-white text-teal-950 hover:bg-teal-50">Попробовать бесплатно</Button></Link>
                <Link to="/"><Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10"><ArrowLeft className="mr-2 h-4 w-4" /> На главную</Button></Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>

    <Footer />
  </div>
);

export default FeatureDocuments;
