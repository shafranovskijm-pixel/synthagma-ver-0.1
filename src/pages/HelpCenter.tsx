import { useState, useRef } from "react";
import { Search, BookOpen, GraduationCap, CreditCard, HelpCircle, Sparkles, FileText, MessageCircle, Mail, ExternalLink, ArrowLeft, Phone, Zap, Shield, Users, ChevronRight, Star, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FloatingParticles } from "@/components/landing/FloatingParticles";

const categories = [
  { icon: BookOpen, label: "Начало работы", description: "Первые шаги на платформе", gradient: "from-teal-500 to-cyan-400", anchor: "getting-started" },
  { icon: GraduationCap, label: "Курсы и обучение", description: "Создание и управление курсами", gradient: "from-emerald-500 to-teal-400", anchor: "getting-started" },
  { icon: CreditCard, label: "Тарифы и оплата", description: "Подписки и платежи", gradient: "from-amber-500 to-orange-400", anchor: "faq" },
  { icon: HelpCircle, label: "Частые вопросы", description: "Ответы на популярные вопросы", gradient: "from-blue-500 to-indigo-400", anchor: "faq" },
  { icon: Sparkles, label: "Что нового", description: "Последние обновления", gradient: "from-purple-500 to-pink-400", href: "/whats-new" },
  { icon: FileText, label: "Документы", description: "Юридическая информация", gradient: "from-rose-500 to-red-400", anchor: "docs" },
];

const orgArticles = [
  "Как зарегистрировать организацию",
  "Как создать курс и добавить уроки",
  "Как записать слушателя на курс",
  "Настройка брендирования (логотип, цвета)",
  "Как выдать документ об обучении",
  "Как работает магазин курсов",
  "Настройка видеоидентификации",
  "Отправка данных во ФРДО",
];

const studentArticles = [
  "Как войти в личный кабинет",
  "Как начать прохождение курса",
  "Как пройти видеоидентификацию",
  "Как получить сертификат",
  "Как связаться с организацией",
  "Как подписать согласие на обработку данных",
];

const faqs: { q: string; a: string }[] = [
  { q: "Как создать курс?", a: "Перейдите в раздел «Курсы» → нажмите «Создать курс». Заполните название, описание, добавьте уроки с материалами. Курс можно опубликовать сразу или сохранить как черновик." },
  { q: "Как записать слушателя на курс?", a: "Откройте нужный курс → вкладка «Слушатели» → «Записать». Можно добавить по email, из списка сотрудников компании или по пригласительной ссылке." },
  { q: "Как работает видеоидентификация?", a: "При входе на курс слушатель делает фото через камеру. Система сравнивает его с эталонным фото. Это подтверждает, что курс проходит именно тот человек, который записан." },
  { q: "Как выдать документ об обучении?", a: "После завершения курса перейдите в карточку слушателя → «Выдать документ». Выберите тип (удостоверение, диплом, сертификат), заполните данные и сформируйте PDF." },
  { q: "Как отправить данные во ФРДО?", a: "Убедитесь, что у курса заполнены ФРДО-поля (тип программы, часы, квалификация). После выдачи документа данные можно отправить в реестр через раздел «ФРДО»." },
  { q: "Сколько стоит платформа?", a: "Платформа работает по подписке. Актуальные тарифы можно узнать в разделе «Тарифы» или связавшись с нами через Telegram." },
  { q: "Как настроить брендирование?", a: "Перейдите в «Настройки» → «Брендирование». Загрузите логотип, выберите основной цвет. Ваши слушатели увидят фирменный стиль на странице входа и в кабинете." },
  { q: "Можно ли импортировать слушателей из Excel?", a: "Да, в разделе «Слушатели» есть кнопка «Импорт». Загрузите файл Excel или CSV с колонками ФИО и email — система создаст учётные записи автоматически." },
  { q: "Как слушатель получает доступ к курсу?", a: "После записи слушатель получает письмо со ссылкой для входа. Также можно отправить пригласительную ссылку напрямую или дать логин/пароль." },
  { q: "Как связаться с поддержкой?", a: "Напишите нам в Telegram (@sintagma_support) или на email support@sintagma.ru. Мы отвечаем в течение нескольких минут в рабочее время." },
  { q: "Что такое магазин курсов?", a: "Магазин курсов — это маркетплейс, где организации могут покупать готовые курсы у других авторов и использовать их на своей платформе." },
  { q: "Как работают промокоды?", a: "В настройках курса можно создать промокод с фиксированной скидкой или процентом. Слушатель вводит код при оплате — цена пересчитывается автоматически." },
];

const stats = [
  { icon: Users, label: "Организаций", value: "500+" },
  { icon: GraduationCap, label: "Курсов создано", value: "2 000+" },
  { icon: Zap, label: "Время ответа", value: "< 5 мин" },
  { icon: Shield, label: "Uptime", value: "99.9%" },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: "spring" as const, damping: 20, stiffness: 200 } },
};

interface HelpCenterProps {
  isModal?: boolean;
}

export default function HelpCenter({ isModal = false }: HelpCenterProps) {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const faqRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLDivElement>(null);
  const docsRef = useRef<HTMLDivElement>(null);

  const filteredFaqs = search.trim()
    ? faqs.filter(f => f.q.toLowerCase().includes(search.toLowerCase()) || f.a.toLowerCase().includes(search.toLowerCase()))
    : faqs;

  const scrollTo = (anchor: string) => {
    const ref = anchor === "faq" ? faqRef : anchor === "getting-started" ? startRef : docsRef;
    ref.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className={isModal ? "" : "min-h-screen bg-background"}>
      {/* ═══ HERO ═══ */}
      <div className="relative overflow-hidden bg-gradient-to-br from-teal-900 via-teal-800 to-cyan-900">
        {/* Floating particles */}
        <FloatingParticles />
        
        {/* Decorative glows */}
        <div className="absolute top-[-100px] right-[-80px] w-[350px] h-[350px] rounded-full bg-teal-400/10 blur-3xl" />
        <div className="absolute bottom-[-80px] left-[-60px] w-[280px] h-[280px] rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute top-[40%] left-[60%] w-[200px] h-[200px] rounded-full bg-teal-300/5 blur-2xl" />
        
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        
        {/* Dot pattern */}
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.3) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          {!isModal && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-4 left-4 text-white/70 hover:text-white hover:bg-white/10 rounded-xl backdrop-blur-sm"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="w-4 h-4 mr-1" /> Назад
              </Button>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, type: "spring", damping: 20 }}
            className="mb-6"
          >
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-teal-400/20 to-cyan-400/20 backdrop-blur-sm border border-teal-300/20 mb-6 shadow-2xl shadow-teal-500/20">
              <HelpCircle className="w-10 h-10 text-teal-200" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <Badge className="bg-teal-400/15 text-teal-200 border-teal-400/30 mb-5 px-4 py-1.5 text-sm font-medium backdrop-blur-sm">
              <Star className="w-3.5 h-3.5 mr-1.5" /> Поддержка 24/7
            </Badge>
          </motion.div>

          <motion.h1
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-4 tracking-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, type: "spring", damping: 20 }}
          >
            Справочный центр
          </motion.h1>

          <motion.p
            className="text-teal-100/70 text-lg sm:text-xl max-w-xl mx-auto mb-10 leading-relaxed"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            Найдите ответы на вопросы или свяжитесь с нашей командой поддержки
          </motion.p>

          <motion.div
            className="max-w-lg mx-auto relative group"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-teal-400/20 via-cyan-400/20 to-teal-400/20 blur-lg opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground transition-colors group-focus-within:text-teal-500" />
              <Input
                placeholder="Поиск по вопросам..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-12 h-14 rounded-2xl bg-white/95 text-foreground border-0 shadow-2xl shadow-black/10 text-base focus-visible:ring-2 focus-visible:ring-teal-400/50 backdrop-blur-sm"
              />
            </div>
          </motion.div>

          {/* Stats */}
          {!isModal && (
            <motion.div
              className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-12"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              {stats.map(s => (
                <motion.div
                  key={s.label}
                  variants={itemVariants}
                  className="bg-white/[0.07] backdrop-blur-md rounded-2xl px-4 py-5 border border-white/10 hover:bg-white/[0.12] hover:border-teal-400/20 transition-all duration-300 group"
                >
                  <s.icon className="w-6 h-6 mx-auto mb-2 text-teal-300 group-hover:text-teal-200 transition-colors" />
                  <div className="text-2xl font-bold text-white">{s.value}</div>
                  <div className="text-xs text-teal-200/60">{s.label}</div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>

        {/* Bottom wave */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
            <path d="M0 60V20C240 40 480 0 720 20C960 40 1200 0 1440 20V60H0Z" className="fill-background" />
          </svg>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-16">
        {/* ═══ CATEGORIES ═══ */}
        {!search && (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-5">
              {categories.map(c => {
                const Icon = c.icon;
                return (
                  <motion.div key={c.label} variants={itemVariants}>
                    <Card
                      className="cursor-pointer group rounded-2xl border-border/50 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-teal-500/5 transition-all duration-300 bg-card/80 backdrop-blur-sm overflow-hidden relative"
                      onClick={() => c.href ? navigate(c.href) : c.anchor && scrollTo(c.anchor)}
                    >
                      {/* Subtle top gradient bar */}
                      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${c.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                      <CardContent className="p-6 flex flex-col items-center text-center gap-4">
                        <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${c.gradient} flex items-center justify-center group-hover:scale-110 group-hover:shadow-lg transition-all duration-300`}>
                          <Icon className="w-8 h-8 text-white" />
                        </div>
                        <div>
                          <span className="font-semibold text-sm sm:text-base block">{c.label}</span>
                          <span className="text-xs text-muted-foreground mt-1 block">{c.description}</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-teal-500 group-hover:translate-x-1 transition-all duration-300" />
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ═══ GETTING STARTED ═══ */}
        {!search && (
          <motion.section
            ref={startRef}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ type: "spring", damping: 20 }}
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-teal-500/20">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Начало работы</h2>
                <p className="text-sm text-muted-foreground">Пошаговые инструкции для быстрого старта</p>
              </div>
            </div>
            <Tabs defaultValue="org">
              <TabsList className="mb-5 rounded-xl bg-muted/50 p-1">
                <TabsTrigger value="org" className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white">Для организаций</TabsTrigger>
                <TabsTrigger value="student" className="rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white">Для учеников</TabsTrigger>
              </TabsList>
              <TabsContent value="org">
                <motion.div className="grid sm:grid-cols-2 gap-3" variants={containerVariants} initial="hidden" animate="visible">
                  {orgArticles.map((a, i) => (
                    <motion.div key={a} variants={itemVariants}>
                      <Card className="rounded-xl border-border/50 hover:bg-gradient-to-r hover:from-teal-500/5 hover:to-cyan-500/5 hover:border-teal-500/20 transition-all duration-300 cursor-pointer group">
                        <CardContent className="p-4 flex items-center gap-3">
                          <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-400 text-white text-xs font-bold shrink-0 shadow-md shadow-teal-500/20 group-hover:shadow-lg group-hover:shadow-teal-500/30 transition-shadow duration-300">{i + 1}</span>
                          <span className="text-sm flex-1">{a}</span>
                          <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-teal-500 group-hover:translate-x-0.5 transition-all duration-300" />
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </motion.div>
              </TabsContent>
              <TabsContent value="student">
                <motion.div className="grid sm:grid-cols-2 gap-3" variants={containerVariants} initial="hidden" animate="visible">
                  {studentArticles.map((a, i) => (
                    <motion.div key={a} variants={itemVariants}>
                      <Card className="rounded-xl border-border/50 hover:bg-gradient-to-r hover:from-teal-500/5 hover:to-cyan-500/5 hover:border-teal-500/20 transition-all duration-300 cursor-pointer group">
                        <CardContent className="p-4 flex items-center gap-3">
                          <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-400 text-white text-xs font-bold shrink-0 shadow-md shadow-teal-500/20">{i + 1}</span>
                          <span className="text-sm flex-1">{a}</span>
                          <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-teal-500 group-hover:translate-x-0.5 transition-all duration-300" />
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </motion.div>
              </TabsContent>
            </Tabs>
          </motion.section>
        )}

        {/* ═══ FAQ ═══ */}
        <motion.section
          ref={faqRef}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ type: "spring", damping: 20 }}
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <HelpCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Часто задаваемые вопросы</h2>
              <p className="text-sm text-muted-foreground">{filteredFaqs.length} {filteredFaqs.length === 1 ? "вопрос" : "вопросов"}</p>
            </div>
          </div>
          {filteredFaqs.length === 0 ? (
            <Card className="rounded-2xl border-dashed border-2">
              <CardContent className="p-10 text-center">
                <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-muted-foreground/30" />
                </div>
                <p className="text-muted-foreground">Ничего не найдено. Попробуйте изменить запрос или свяжитесь с поддержкой.</p>
              </CardContent>
            </Card>
          ) : (
            <Accordion type="multiple" className="space-y-2.5">
              {filteredFaqs.map((f, i) => (
                <AccordionItem key={i} value={`faq-${i}`} className="border rounded-2xl px-5 bg-card/50 hover:bg-card transition-all duration-200 data-[state=open]:shadow-lg data-[state=open]:shadow-teal-500/5 data-[state=open]:border-teal-500/20 data-[state=open]:bg-gradient-to-r data-[state=open]:from-teal-500/[0.02] data-[state=open]:to-cyan-500/[0.02]">
                  <AccordionTrigger className="text-sm font-medium text-left hover:no-underline py-5">{f.q}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-5">{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </motion.section>

        {/* ═══ CONTACTS ═══ */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ type: "spring", damping: 20 }}
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Phone className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Связаться с нами</h2>
              <p className="text-sm text-muted-foreground">Мы на связи в рабочее время</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            <Card className="rounded-2xl group hover:shadow-xl hover:shadow-blue-500/5 hover:-translate-y-1 transition-all duration-300 border-border/50 hover:border-blue-500/30 overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <CardContent className="p-6 flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-400 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-blue-500/20 transition-all duration-300">
                  <MessageCircle className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-1">Telegram</h3>
                  <p className="text-muted-foreground text-sm mb-4">Самый быстрый способ связи. Ответим в течение нескольких минут.</p>
                  <Button size="sm" className="rounded-xl gap-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 transition-all" onClick={() => window.open("https://t.me/sintagma_support", "_blank")}>
                    <ExternalLink className="w-3.5 h-3.5" /> Написать в Telegram
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl group hover:shadow-xl hover:shadow-teal-500/5 hover:-translate-y-1 transition-all duration-300 border-border/50 hover:border-teal-500/30 overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 to-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <CardContent className="p-6 flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-400 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-teal-500/20 transition-all duration-300">
                  <Mail className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-1">Email</h3>
                  <p className="text-muted-foreground text-sm mb-4">support@sintagma.ru — ответим в течение рабочего дня.</p>
                  <Button size="sm" className="rounded-xl gap-2 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white shadow-md shadow-teal-500/20 hover:shadow-lg hover:shadow-teal-500/30 transition-all" onClick={() => window.open("mailto:support@sintagma.ru")}>
                    <ExternalLink className="w-3.5 h-3.5" /> Написать на почту
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.section>

        {/* ═══ LEGAL DOCS ═══ */}
        <motion.section
          ref={docsRef}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ type: "spring", damping: 20 }}
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500 to-red-400 flex items-center justify-center shadow-lg shadow-rose-500/20">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Документы</h2>
              <p className="text-sm text-muted-foreground">Юридическая информация и соглашения</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Публичная оферта", href: "/public-offer" },
              { label: "Политика конфиденциальности", href: "/privacy" },
              { label: "Пользовательское соглашение", href: "/student-agreement" },
              { label: "Политика обработки персональных данных", href: "/personal-data" },
            ].map(d => (
              <Button key={d.href} variant="outline" size="sm" className="rounded-xl gap-2 hover:bg-gradient-to-r hover:from-teal-500/10 hover:to-cyan-500/10 hover:text-teal-600 hover:border-teal-500/30 transition-all duration-300" onClick={() => navigate(d.href)}>
                <FileText className="w-3.5 h-3.5" /> {d.label}
              </Button>
            ))}
          </div>
        </motion.section>

        {/* ═══ CTA ═══ */}
        {!isModal && (
          <motion.section
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ type: "spring", damping: 20 }}
          >
            <Card className="rounded-3xl overflow-hidden relative border-0 shadow-2xl shadow-teal-500/10">
              <div className="absolute inset-0 bg-gradient-to-br from-teal-900 via-teal-800 to-cyan-900" />
              <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.3) 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
              <div className="absolute top-[-50px] right-[-50px] w-[200px] h-[200px] rounded-full bg-teal-400/10 blur-3xl" />
              <div className="absolute bottom-[-30px] left-[-30px] w-[150px] h-[150px] rounded-full bg-cyan-400/10 blur-3xl" />
              <CardContent className="relative p-8 sm:p-12 text-center">
                <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">Не нашли ответ?</h3>
                <p className="text-teal-100/70 mb-6 max-w-md mx-auto">Наша команда поддержки поможет решить любой вопрос. Напишите нам — ответим максимально быстро.</p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button className="rounded-xl gap-2 bg-white text-teal-900 hover:bg-teal-50 shadow-lg" onClick={() => window.open("https://t.me/sintagma_support", "_blank")}>
                    <MessageCircle className="w-4 h-4" /> Telegram
                  </Button>
                  <Button variant="outline" className="rounded-xl gap-2 border-white/20 text-white hover:bg-white/10 backdrop-blur-sm" onClick={() => window.open("mailto:support@sintagma.ru")}>
                    <Mail className="w-4 h-4" /> Email
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.section>
        )}
      </div>
    </div>
  );
}
