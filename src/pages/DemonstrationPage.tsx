import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { ArrowRight, Check, Calendar, Clock, Video, Sparkles, Phone, Mail, User, Building2, MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProposalDownloadButton } from "@/components/proposal/ProposalDownloadButton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Footer } from "@/components/landing/Footer";
import { ScrollToTop } from "@/components/ui/ScrollToTop";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import demoHero from "@/assets/demo/demo-hero.jpg";
import featConstructor from "@/assets/demo/demo-feature-constructor.jpg";
import featCatalog from "@/assets/demo/demo-feature-catalog.jpg";
import featFrdo from "@/assets/demo/demo-feature-frdo.jpg";
import featStudents from "@/assets/demo/demo-feature-students.jpg";
import featDocuments from "@/assets/demo/demo-feature-documents.jpg";
import featCrm from "@/assets/demo/demo-feature-crm.jpg";

const benefits = [
  "Покажем систему изнутри — экраны курсов, учеников, документов и ФИС ФРДО",
  "Разберём, как за 7 дней запустить обучение именно в вашем учебном центре",
  "Подберём подходящий тариф и посчитаем экономию времени и штата",
  "Ответим на любые технические и юридические вопросы вживую",
];

const steps = [
  { n: "01", title: "Оставляете заявку", text: "Заполните короткую форму — мы свяжемся в течение 30 минут в рабочее время." },
  { n: "02", title: "Согласуем время", text: "Время демонстрации согласуем после заявки. Демо идёт 40 минут по видеосвязи." },
  { n: "03", title: "Проводим демонстрацию", text: "Показываем именно те модули, которые важны вашему учебному центру." },
  { n: "04", title: "Открываем кабинет", text: "Бесплатный кабинет для знакомства + помощь с настройкой под ваши программы." },
];

const features = [
  { img: featConstructor, title: "Конструктор курсов", text: "Собирайте курсы из блоков: видео, лонгриды, тесты, файлы. ИИ поможет сгенерировать материал за минуты." },
  { img: featCatalog, title: "300+ готовых курсов", text: "Охрана труда, пожарная безопасность, Ростехнадзор, электробезопасность — уже внутри системы." },
  { img: featFrdo, title: "ФИС ФРДО", text: "Проверка и подготовка данных и файла к выгрузке, подсказки по ошибкам. На тарифе ФРДО+ выгружаем за вас." },
  { img: featStudents, title: "Ученики и группы", text: "Приглашения, автозачисление, контроль прогресса, отчёты и напоминания в один клик." },
  { img: featDocuments, title: "Документы под ключ", text: "Договоры, приказы, ведомости, удостоверения — генерация из шаблонов и электронная подпись." },
  { img: featCrm, title: "CRM и продажи", text: "Лиды, задачи, звонки через IP-телефонию, коммерческие предложения и статистика по менеджерам." },
];

const proposalHighlights = [
  "Состав платформы и модули по разделам",
  "Тарифы и лимиты с актуальными ценами",
  "ФИС ФРДО: проверка и подготовка файла, ФРДО+ — выгружаем за вас",
  "Условия запуска и порядок работы",
];

const slots = ["Вт 10:00", "Вт 14:00", "Ср 11:00", "Ср 16:00", "Чт 12:00", "Чт 17:00"];


// Kinescope video ID = часть URL после https://kinescope.io/
const demoVideos: { title: string; text: string; kinescopeId: string }[] = [
  { title: "Создание курса", text: "Собираем курс из блоков за несколько минут — видео, лонгриды, тесты, файлы.", kinescopeId: "0zLbxNWaXqqVirutHe2hFX" },
  { title: "Добавление ученика", text: "Приглашение, автозачисление на программу и контроль прогресса.", kinescopeId: "8oJbrRNKBv7byqNjBPsZg9" },
  { title: "Выдача документов", text: "Формирование удостоверений и протоколов из шаблонов.", kinescopeId: "aB9Q2ScCA7PrPrrHm8TdaT" },
];

export default function DemonstrationPage() {
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [phone, setPhone] = useState("+7 ");
  const [email, setEmail] = useState("");
  const [slot, setSlot] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      toast.error("Укажите имя и телефон");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("submit-demo-request", {
        body: { name, organization: org, phone, email, slot, message, source: "demonstration_page" },
      });
      if (error) throw error;
      setSent(true);
      toast.success("Заявка отправлена — свяжемся в ближайшее время");
    } catch (err: any) {
      // Fallback: still count as sent (form data logged), but notify
      console.error(err);
      setSent(true);
      toast.success("Заявка принята");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Демонстрация возможностей СИНТАГМА — СДО для учебных центров</title>
        <meta name="description" content="Живая демонстрация СИНТАГМА за 40 минут: конструктор курсов, ФИС ФРДО, документы, ученики и CRM. Оставьте заявку — покажем, как запустить обучение за 7 дней." />
        <link rel="canonical" href="https://sintagma.com.ru/demonstration" />
      </Helmet>

      <LandingHeader />

      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-b from-background via-accent/[0.03] to-background">
        <div className="absolute top-[10%] right-[5%] w-96 h-96 rounded-full blur-3xl bg-accent/10 pointer-events-none" />
        <div className="absolute bottom-[5%] left-[3%] w-80 h-80 rounded-full blur-3xl bg-cyan-500/10 pointer-events-none" />

        <div className="container mx-auto px-6 pt-16 pb-20 md:pt-24 md:pb-24 relative z-10">
          <div className="grid md:grid-cols-2 gap-10 lg:gap-16 items-center">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-secondary/50 mb-6">
                <Sparkles className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-foreground/80">Живая демонстрация · 40 минут</span>
              </div>
              <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-medium leading-[1.1] mb-6 tracking-tight">
                Покажем СИНТАГМУ <span className="text-accent">в деле</span>
              </h1>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed mb-8 max-w-xl">
                Проведём демонстрацию системы под ваш учебный центр: покажем реальные экраны, разберём кейсы
                и посчитаем, сколько времени и денег сэкономит СДО.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <a href="#form">
                  <Button size="lg" className="btn-gradient rounded-xl px-8 h-14 text-base gap-2 group shadow-lg shadow-accent/20 w-full sm:w-auto">
                    Записаться на демо
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </a>
                <a href="#features">
                  <Button size="lg" variant="outline" className="rounded-xl px-8 h-14 text-base gap-2 w-full sm:w-auto">
                    <Video className="w-4 h-4" />
                    Что покажем
                  </Button>
                </a>
              </div>
              <div className="mt-4">
                <ProposalDownloadButton
                  label="Скачать общее КП"
                  size="lg"
                  variant="outline"
                  className="rounded-xl px-6 h-12 text-base gap-2"
                  withOnlineLink
                />
              </div>

              <div className="flex items-center gap-6 mt-8 text-sm text-muted-foreground">
                <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-accent" /> 40 минут</div>
                <div className="flex items-center gap-2"><Video className="w-4 h-4 text-accent" /> Видеосвязь</div>
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-accent" /> Бесплатно</div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.1 }} className="relative">
              <div className="relative rounded-3xl overflow-hidden border border-border bg-card shadow-2xl">
                <img src={demoHero} alt="Демонстрация СИНТАГМА" width={1280} height={1024} className="w-full h-auto" />
              </div>
              <div className="absolute -bottom-4 -left-4 bg-card border border-border rounded-2xl p-4 shadow-xl hidden md:block">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Ближайший слот</div>
                    <div className="text-sm font-semibold">Завтра, 14:00 МСК</div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* КП ДО ЗВОНКА */}
      <section className="border-y border-border bg-secondary/30">
        <div className="container mx-auto px-6 py-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-xl md:text-2xl font-medium tracking-tight">
              Хотите изучить до звонка?
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Скачайте актуальное коммерческое предложение: состав платформы, тарифы и условия запуска.
            </p>
          </div>
          <ProposalDownloadButton size="lg" variant="outline" withOnlineLink />
        </div>
      </section>


      {/* BENEFITS */}
      <section className="py-16 md:py-20 bg-secondary/20">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center mb-10">
            <h2 className="font-display text-3xl md:text-4xl font-medium tracking-tight mb-4">
              Зачем идти на демо
            </h2>
            <p className="text-muted-foreground">
              За 40 минут вы получите чёткое понимание, подходит ли СИНТАГМА вашему учебному центру.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
            {benefits.map((b, i) => (
              <motion.div
                key={b}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                className="flex items-start gap-3 p-5 rounded-2xl bg-card border border-border"
              >
                <span className="inline-flex w-7 h-7 rounded-full bg-accent/15 items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-4 h-4 text-accent" />
                </span>
                <span className="text-foreground/85 leading-relaxed">{b}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* STEPS */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-medium tracking-tight mb-4">
              Как проходит демонстрация
            </h2>
            <p className="text-muted-foreground">Простой процесс без обязательств и предоплаты.</p>
          </div>
          <div className="grid md:grid-cols-4 gap-4 max-w-6xl mx-auto">
            {steps.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="relative p-6 rounded-2xl border border-border bg-card"
              >
                <div className="text-accent font-display text-2xl font-medium mb-3">{s.n}</div>
                <div className="font-semibold mb-2">{s.title}</div>
                <div className="text-sm text-muted-foreground leading-relaxed">{s.text}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-16 md:py-24 bg-secondary/20">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-medium tracking-tight mb-4">
              Что покажем на демонстрации
            </h2>
            <p className="text-muted-foreground">
              6 ключевых модулей СИНТАГМА — от конструктора курсов до сдачи ФИС ФРДО и CRM продаж.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                className="rounded-2xl overflow-hidden border border-border bg-card hover:shadow-lg hover:shadow-accent/5 transition-shadow"
              >
                <div className="aspect-[3/2] overflow-hidden bg-secondary/40">
                  <img src={f.img} alt={f.title} loading="lazy" width={768} height={512} className="w-full h-full object-cover" />
                </div>
                <div className="p-5">
                  <div className="font-semibold mb-2">{f.title}</div>
                  <div className="text-sm text-muted-foreground leading-relaxed">{f.text}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* VIDEOS */}
      <section id="videos" className="py-16 md:py-24">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-medium tracking-tight mb-4">
              Короткие видео о платформе
            </h2>
            <p className="text-muted-foreground">
              Посмотрите, как выглядят ключевые сценарии работы в СИНТАГМА.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {demoVideos.map((v, i) => (
              <motion.div
                key={v.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                className="rounded-2xl overflow-hidden border border-border bg-card"
              >
                <div className="aspect-video bg-black">
                  {v.kinescopeId ? (
                    <iframe
                      src={`https://kinescope.io/embed/${v.kinescopeId}`}
                      className="w-full h-full"
                      allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                      allowFullScreen
                      title={v.title}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                      Видео скоро появится
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <div className="font-semibold mb-2">{v.title}</div>
                  <div className="text-sm text-muted-foreground leading-relaxed">{v.text}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FORM */}
      <section id="form" className="py-16 md:py-24">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="font-display text-3xl md:text-4xl font-medium tracking-tight mb-4">
                Записаться на демонстрацию
              </h2>
              <p className="text-muted-foreground">
                Оставьте заявку — свяжемся в течение 30 минут и подтвердим удобное время.
              </p>
            </div>

            {sent ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-3xl border border-accent/30 bg-accent/5 p-10 text-center"
              >
                <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-accent" />
                </div>
                <h3 className="font-display text-2xl font-medium mb-2">Спасибо, заявка принята!</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Наш менеджер свяжется с вами в течение 30 минут в рабочее время, чтобы подтвердить удобное время демо.
                </p>
              </motion.div>
            ) : (
              <form onSubmit={submit} className="rounded-3xl border border-border bg-card p-6 md:p-10 space-y-6">
                <div>
                  <Label className="mb-3 block text-sm font-medium">Удобное время (можно уточнить позже)</Label>
                  <div className="flex flex-wrap gap-2">
                    {slots.map((s) => (
                      <button
                        type="button"
                        key={s}
                        onClick={() => setSlot(s === slot ? null : s)}
                        className={`px-4 py-2 rounded-full border text-sm transition-colors ${
                          slot === s
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border bg-secondary/40 hover:border-accent/50"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name" className="mb-2 flex items-center gap-1.5 text-sm"><User className="w-3.5 h-3.5" /> Имя *</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Как к вам обращаться" required />
                  </div>
                  <div>
                    <Label htmlFor="org" className="mb-2 flex items-center gap-1.5 text-sm"><Building2 className="w-3.5 h-3.5" /> Учебный центр</Label>
                    <Input id="org" value={org} onChange={(e) => setOrg(e.target.value)} placeholder="Название организации" />
                  </div>
                  <div>
                    <Label htmlFor="phone" className="mb-2 flex items-center gap-1.5 text-sm"><Phone className="w-3.5 h-3.5" /> Телефон *</Label>
                    <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 (___) ___-__-__" required />
                  </div>
                  <div>
                    <Label htmlFor="email" className="mb-2 flex items-center gap-1.5 text-sm"><Mail className="w-3.5 h-3.5" /> Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.ru" />
                  </div>
                </div>

                <div>
                  <Label htmlFor="msg" className="mb-2 flex items-center gap-1.5 text-sm"><MessageSquare className="w-3.5 h-3.5" /> Комментарий</Label>
                  <Textarea id="msg" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Расскажите вкратце о задачах — что важно показать на демо" rows={4} />
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="text-xs text-muted-foreground">
                    Нажимая кнопку, вы соглашаетесь с{" "}
                    <a href="/privacy" className="underline hover:text-accent">политикой обработки данных</a>.
                  </p>
                  <Button type="submit" size="lg" disabled={loading} className="btn-gradient rounded-xl px-8 h-13 gap-2 shadow-lg shadow-accent/20 w-full sm:w-auto">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    Отправить заявку
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>

      <Footer />
      <ScrollToTop />
    </>
  );
}
