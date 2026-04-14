import { useState, useRef } from "react";
import { Search, BookOpen, GraduationCap, CreditCard, HelpCircle, Sparkles, FileText, MessageCircle, Mail, ExternalLink, ArrowLeft, Phone, Zap, Shield, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useNavigate } from "react-router-dom";

const categories = [
  { icon: BookOpen, label: "Начало работы", description: "Первые шаги на платформе", color: "text-primary", bg: "bg-primary/10", anchor: "getting-started" },
  { icon: GraduationCap, label: "Курсы и обучение", description: "Создание и управление курсами", color: "text-emerald-500", bg: "bg-emerald-500/10", anchor: "getting-started" },
  { icon: CreditCard, label: "Тарифы и оплата", description: "Подписки и платежи", color: "text-amber-500", bg: "bg-amber-500/10", anchor: "faq" },
  { icon: HelpCircle, label: "Частые вопросы", description: "Ответы на популярные вопросы", color: "text-blue-500", bg: "bg-blue-500/10", anchor: "faq" },
  { icon: Sparkles, label: "Что нового", description: "Последние обновления", color: "text-purple-500", bg: "bg-purple-500/10", href: "/whats-new" },
  { icon: FileText, label: "Документы", description: "Юридическая информация", color: "text-rose-500", bg: "bg-rose-500/10", anchor: "docs" },
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
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-primary/70 text-primary-foreground">
        {/* Decorative elements */}
        <div className="absolute top-[-60px] right-[-60px] w-[200px] h-[200px] rounded-full bg-primary-foreground/5 blur-sm" />
        <div className="absolute bottom-[-40px] left-[-40px] w-[160px] h-[160px] rounded-full bg-primary-foreground/5 blur-sm" />
        <div className="absolute top-[30%] left-[15%] w-[80px] h-[80px] rounded-full bg-primary-foreground/[0.03]" />
        <div className="absolute bottom-[20%] right-[10%] w-[120px] h-[120px] rounded-full bg-primary-foreground/[0.04]" />
        {/* Dot pattern */}
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)", backgroundSize: "24px 24px" }} />

        <div className="relative max-w-4xl mx-auto px-4 py-14 sm:py-20 text-center">
          {!isModal && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-4 left-4 text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 rounded-xl"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Назад
            </Button>
          )}

          <div className="animate-fade-in">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-foreground/15 backdrop-blur-sm mb-5 shadow-lg">
              <HelpCircle className="w-8 h-8" />
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-3 tracking-tight">Справочный центр</h1>
            <p className="text-primary-foreground/80 mb-8 text-lg max-w-lg mx-auto">Найдите ответы на вопросы или свяжитесь с нашей командой поддержки</p>

            <div className="max-w-md mx-auto relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <Input
                placeholder="Поиск по вопросам..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-12 h-13 rounded-2xl bg-background text-foreground border-0 shadow-xl text-base focus-visible:ring-2 focus-visible:ring-primary-foreground/30"
              />
            </div>
          </div>

          {/* Stats */}
          {!isModal && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-10 animate-fade-in" style={{ animationDelay: "0.15s" }}>
              {stats.map(s => (
                <div key={s.label} className="bg-primary-foreground/10 backdrop-blur-sm rounded-xl px-3 py-3 border border-primary-foreground/10">
                  <s.icon className="w-5 h-5 mx-auto mb-1.5 opacity-80" />
                  <div className="text-xl font-bold">{s.value}</div>
                  <div className="text-xs opacity-70">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-10 space-y-14">
        {/* Categories */}
        {!search && (
          <div className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {categories.map(c => {
                const Icon = c.icon;
                return (
                  <Card
                    key={c.label}
                    className="cursor-pointer group rounded-2xl border-border/50 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
                    onClick={() => c.href ? navigate(c.href) : c.anchor && scrollTo(c.anchor)}
                  >
                    <CardContent className="p-5 flex flex-col items-center text-center gap-3">
                      <div className={`w-14 h-14 rounded-2xl ${c.bg} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                        <Icon className={`w-7 h-7 ${c.color}`} />
                      </div>
                      <div>
                        <span className="font-semibold text-sm block">{c.label}</span>
                        <span className="text-xs text-muted-foreground mt-0.5 block">{c.description}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Getting started */}
        {!search && (
          <section ref={startRef} className="animate-fade-in" style={{ animationDelay: "0.2s" }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Начало работы</h2>
                <p className="text-sm text-muted-foreground">Пошаговые инструкции для быстрого старта</p>
              </div>
            </div>
            <Tabs defaultValue="org">
              <TabsList className="mb-4 rounded-xl bg-muted/50 p-1">
                <TabsTrigger value="org" className="rounded-lg">Для организаций</TabsTrigger>
                <TabsTrigger value="student" className="rounded-lg">Для учеников</TabsTrigger>
              </TabsList>
              <TabsContent value="org">
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {orgArticles.map((a, i) => (
                    <Card key={a} className="rounded-xl border-border/50 hover:bg-primary/5 hover:border-primary/20 transition-all duration-200 cursor-pointer group">
                      <CardContent className="p-4 flex items-center gap-3">
                        <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary text-xs font-bold shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-200">{i + 1}</span>
                        <span className="text-sm">{a}</span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="student">
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {studentArticles.map((a, i) => (
                    <Card key={a} className="rounded-xl border-border/50 hover:bg-primary/5 hover:border-primary/20 transition-all duration-200 cursor-pointer group">
                      <CardContent className="p-4 flex items-center gap-3">
                        <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary text-xs font-bold shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-200">{i + 1}</span>
                        <span className="text-sm">{a}</span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </section>
        )}

        {/* FAQ */}
        <section ref={faqRef} className="animate-fade-in" style={{ animationDelay: "0.3s" }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <HelpCircle className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Часто задаваемые вопросы</h2>
              <p className="text-sm text-muted-foreground">{filteredFaqs.length} {filteredFaqs.length === 1 ? "вопрос" : "вопросов"}</p>
            </div>
          </div>
          {filteredFaqs.length === 0 ? (
            <Card className="rounded-2xl border-dashed">
              <CardContent className="p-8 text-center">
                <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Ничего не найдено. Попробуйте изменить запрос или свяжитесь с поддержкой.</p>
              </CardContent>
            </Card>
          ) : (
            <Accordion type="multiple" className="space-y-2">
              {filteredFaqs.map((f, i) => (
                <AccordionItem key={i} value={`faq-${i}`} className="border rounded-xl px-4 bg-card/50 hover:bg-card transition-colors duration-200 data-[state=open]:shadow-md data-[state=open]:border-primary/20">
                  <AccordionTrigger className="text-sm font-medium text-left hover:no-underline py-4">{f.q}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </section>

        {/* Contacts */}
        <section className="animate-fade-in" style={{ animationDelay: "0.4s" }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Phone className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Связаться с нами</h2>
              <p className="text-sm text-muted-foreground">Мы на связи в рабочее время</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Card className="rounded-2xl group hover:shadow-lg hover:shadow-blue-500/5 hover:-translate-y-0.5 transition-all duration-300 border-border/50 hover:border-blue-500/30">
              <CardContent className="p-6 flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
                  <MessageCircle className="w-7 h-7 text-blue-500" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Telegram</h3>
                  <p className="text-muted-foreground text-sm mb-3">Самый быстрый способ связи. Ответим в течение нескольких минут.</p>
                  <Button variant="outline" size="sm" className="rounded-xl gap-2 hover:bg-blue-500/10 hover:text-blue-600 hover:border-blue-500/30 transition-all" onClick={() => window.open("https://t.me/sintagma_support", "_blank")}>
                    <ExternalLink className="w-3.5 h-3.5" /> Написать в Telegram
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl group hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 transition-all duration-300 border-border/50 hover:border-primary/30">
              <CardContent className="p-6 flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
                  <Mail className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Email</h3>
                  <p className="text-muted-foreground text-sm mb-3">support@sintagma.ru — ответим в течение рабочего дня.</p>
                  <Button variant="outline" size="sm" className="rounded-xl gap-2 hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all" onClick={() => window.open("mailto:support@sintagma.ru")}>
                    <ExternalLink className="w-3.5 h-3.5" /> Написать на почту
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Legal docs */}
        <section ref={docsRef} className="animate-fade-in" style={{ animationDelay: "0.5s" }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-rose-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Документы</h2>
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
              <Button key={d.href} variant="outline" size="sm" className="rounded-xl gap-2 hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all" onClick={() => navigate(d.href)}>
                <FileText className="w-3.5 h-3.5" /> {d.label}
              </Button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
