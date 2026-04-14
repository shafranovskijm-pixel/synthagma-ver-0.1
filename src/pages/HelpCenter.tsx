import { useState, useRef } from "react";
import { Search, BookOpen, GraduationCap, CreditCard, HelpCircle, Sparkles, FileText, MessageCircle, Mail, ExternalLink, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useNavigate } from "react-router-dom";

const categories = [
  { icon: BookOpen, label: "Начало работы", color: "text-primary", bg: "bg-primary/10", anchor: "getting-started" },
  { icon: GraduationCap, label: "Курсы и обучение", color: "text-emerald-500", bg: "bg-emerald-500/10", anchor: "getting-started" },
  { icon: CreditCard, label: "Тарифы и оплата", color: "text-amber-500", bg: "bg-amber-500/10", anchor: "faq" },
  { icon: HelpCircle, label: "Частые вопросы", color: "text-blue-500", bg: "bg-blue-500/10", anchor: "faq" },
  { icon: Sparkles, label: "Что нового", color: "text-purple-500", bg: "bg-purple-500/10", href: "/whats-new" },
  { icon: FileText, label: "Документы", color: "text-rose-500", bg: "bg-rose-500/10", anchor: "docs" },
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

export default function HelpCenter() {
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
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="bg-gradient-to-br from-primary via-primary/90 to-primary/70 text-primary-foreground">
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <Button variant="ghost" size="sm" className="absolute top-4 left-4 text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Назад
          </Button>
          <HelpCircle className="w-12 h-12 mx-auto mb-4 opacity-80" />
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">Справочный центр</h1>
          <p className="text-primary-foreground/80 mb-6 text-lg">Найдите ответы на вопросы по работе с платформой</p>
          <div className="max-w-md mx-auto relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Поиск по вопросам..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 h-12 rounded-xl bg-background text-foreground border-0 shadow-lg"
            />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-10 space-y-12">
        {/* Categories */}
        {!search && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {categories.map(c => {
              const Icon = c.icon;
              return (
                <Card
                  key={c.label}
                  className="cursor-pointer hover:shadow-md transition-shadow rounded-2xl"
                  onClick={() => c.href ? navigate(c.href) : c.anchor && scrollTo(c.anchor)}
                >
                  <CardContent className="p-5 flex flex-col items-center text-center gap-3">
                    <div className={`w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center`}>
                      <Icon className={`w-6 h-6 ${c.color}`} />
                    </div>
                    <span className="font-medium text-sm">{c.label}</span>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Getting started */}
        {!search && (
          <section ref={startRef}>
            <h2 className="text-xl font-bold mb-4">Начало работы</h2>
            <Tabs defaultValue="org">
              <TabsList className="mb-4">
                <TabsTrigger value="org">Для организаций</TabsTrigger>
                <TabsTrigger value="student">Для учеников</TabsTrigger>
              </TabsList>
              <TabsContent value="org">
                <div className="grid sm:grid-cols-2 gap-2">
                  {orgArticles.map(a => (
                    <Card key={a} className="rounded-xl hover:bg-muted/50 transition-colors cursor-pointer">
                      <CardContent className="p-4 flex items-center gap-3">
                        <BookOpen className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-sm">{a}</span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="student">
                <div className="grid sm:grid-cols-2 gap-2">
                  {studentArticles.map(a => (
                    <Card key={a} className="rounded-xl hover:bg-muted/50 transition-colors cursor-pointer">
                      <CardContent className="p-4 flex items-center gap-3">
                        <GraduationCap className="w-4 h-4 text-primary shrink-0" />
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
        <section ref={faqRef}>
          <h2 className="text-xl font-bold mb-4">Часто задаваемые вопросы</h2>
          {filteredFaqs.length === 0 ? (
            <p className="text-muted-foreground text-sm">Ничего не найдено. Попробуйте изменить запрос или свяжитесь с поддержкой.</p>
          ) : (
            <Accordion type="multiple" className="space-y-2">
              {filteredFaqs.map((f, i) => (
                <AccordionItem key={i} value={`faq-${i}`} className="border rounded-xl px-4">
                  <AccordionTrigger className="text-sm font-medium text-left">{f.q}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </section>

        {/* Contacts */}
        <section className="grid sm:grid-cols-2 gap-4">
          <Card className="rounded-2xl">
            <CardContent className="p-5 flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                <MessageCircle className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Telegram</h3>
                <p className="text-muted-foreground text-sm mb-3">Ответим в течение нескольких минут</p>
                <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={() => window.open("https://t.me/sintagma_support", "_blank")}>
                  <ExternalLink className="w-3.5 h-3.5" /> Написать
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-5 flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Email</h3>
                <p className="text-muted-foreground text-sm mb-3">support@sintagma.ru</p>
                <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={() => window.open("mailto:support@sintagma.ru")}>
                  <ExternalLink className="w-3.5 h-3.5" /> Написать
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Legal docs */}
        <section ref={docsRef}>
          <h2 className="text-xl font-bold mb-4">Документы</h2>
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Публичная оферта", href: "/public-offer" },
              { label: "Политика конфиденциальности", href: "/privacy" },
              { label: "Пользовательское соглашение", href: "/student-agreement" },
              { label: "Политика обработки персональных данных", href: "/personal-data" },
            ].map(d => (
              <Button key={d.href} variant="outline" size="sm" className="rounded-xl gap-2" onClick={() => navigate(d.href)}>
                <FileText className="w-3.5 h-3.5" /> {d.label}
              </Button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
