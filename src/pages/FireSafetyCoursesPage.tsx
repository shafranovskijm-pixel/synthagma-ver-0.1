import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Flame, CheckCircle2, Clock, FileCheck, Shield, ArrowRight, Building2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Footer } from "@/components/landing/Footer";

const PLATFORM_ORG_ID = "4ac2c05a-d8b5-4e72-ba31-f2c743091d95";
const FIRE_SAFETY_CATEGORY_ID = "4972cc13-a7f9-46f4-842a-a5d981a55963";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};
const stagger = { visible: { transition: { staggerChildren: 0.06 } } };

// 5 обязательных категорий по Приложению №4 к Приказу МЧС №806/1120
const REQUIRED_CATEGORIES = [
  {
    n: 1,
    title: "Руководители и ответственные за ПБ",
    who: "Директора организаций, лица, назначенные приказом ответственными за пожарную безопасность.",
    period: "ПК 16 ч раз в 3 года",
  },
  {
    n: 2,
    title: "Ответственные за проведение противопожарного инструктажа",
    who: "Инженеры и специалисты, которые проводят вводный, первичный, повторный и внеплановый инструктажи.",
    period: "ПК 16 ч раз в 3 года",
  },
  {
    n: 3,
    title: "Руководители эксплуатирующих и управляющих организаций",
    who: "Управляющие компании ЖКХ, гостиницы, санатории, школы, детсады (объекты Ф1.1, Ф1.2, Ф4.1, Ф4.2).",
    period: "ПК 16 ч раз в 3 года",
  },
  {
    n: 4,
    title: "Ответственные за организацию огневых работ",
    who: "Специалисты, отвечающие за сварочные, газосварочные и другие огневые работы на объектах.",
    period: "ПК 16 ч раз в 3 года",
  },
  {
    n: 5,
    title: "Объекты с массовым пребыванием людей (50+) и повышенной опасности",
    who: "Ответственные за ПБ в ТРЦ, стадионах, АЗС, больницах, производствах категорий А/Б.",
    period: "ПК 16 ч ежегодно",
  },
];

const advantages = [
  { icon: FileCheck, title: "Соответствие 806/1120", desc: "Программы разработаны по требованиям Приказа МЧС №806 от 18.11.2021 в редакции №1120 от 16.12.2024." },
  { icon: Clock, title: "Обучение за 1-2 недели", desc: "Заочная форма с ДОТ и ЭО. Итоговая аттестация онлайн, удостоверение — почтой." },
  { icon: Shield, title: "ФРДО и реестр", desc: "Выданные удостоверения вносятся в ФРДО. Проверка подлинности — на нашем сайте." },
  { icon: Building2, title: "Массовое обучение", desc: "Групповые тарифы для организаций. Личный кабинет с журналами и протоколами." },
];

interface FireCourse {
  id: string;
  title: string;
  description: string | null;
  hours: number | null;
  price: number | null;
}

async function fetchFireSafetyCourses(): Promise<FireCourse[]> {
  const { data, error } = await supabase
    .from("courses")
    .select("id, title, description, frdo_duration_hours, price")
    .eq("organization_id", PLATFORM_ORG_ID)
    .eq("category_id", FIRE_SAFETY_CATEGORY_ID)
    .eq("is_published", true)
    .order("catalog_order", { ascending: true, nullsFirst: false })
    .order("title", { ascending: true });
  if (error) throw error;
  return (data || []).map((c: any) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    hours: c.frdo_duration_hours,
    price: c.price ?? 0,
  }));
}

export default function FireSafetyCoursesPage() {
  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["fire-safety-courses"],
    queryFn: fetchFireSafetyCourses,
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Курсы по пожарной безопасности 2026",
    description: "Программы обучения мерам пожарной безопасности по Приказу МЧС №806/1120 для организаций.",
    itemListElement: courses.slice(0, 20).map((c, i) => ({
      "@type": "Course",
      position: i + 1,
      name: c.title,
      description: c.description || undefined,
      provider: { "@type": "Organization", name: "Синтагма" },
    })),
  };

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Обучение пожарной безопасности 2026 — курсы ДПО по Приказу МЧС 806/1120</title>
        <meta
          name="description"
          content="Обучение мерам пожарной безопасности для организаций: 5 обязательных категорий по Приказу МЧС №806 от 18.11.2021 (ред. №1120 от 16.12.2024). ДПО ПК 16 ч, огневые работы, объекты Ф1.1/Ф4.1. Удостоверение с ФРДО."
        />
        <link rel="canonical" href="https://sintagma.com.ru/courses/fire-safety" />
        <meta property="og:title" content="Курсы по пожарной безопасности — Приказ МЧС 806/1120" />
        <meta property="og:description" content="Полный каталог программ ДПО ПК и ПП по пожарной безопасности для организаций." />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <LandingHeader />

      {/* Hero */}
      <section className="relative overflow-hidden pt-28 pb-16 md:pt-36 md:pb-20">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-background to-background" />
        <div className="absolute top-20 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
        <div className="container mx-auto px-6 relative z-10">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="max-w-4xl mx-auto text-center">
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 text-accent text-sm font-medium mb-6">
              <Flame className="w-4 h-4" />
              Приказ МЧС России №806/1120
            </motion.div>
            <motion.h1 variants={fadeUp} className="font-display text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight mb-6">
              Обучение <span className="text-accent">пожарной безопасности</span> для организаций
            </motion.h1>
            <motion.p variants={fadeUp} className="text-lg md:text-xl text-muted-foreground leading-relaxed mb-8 max-w-2xl mx-auto">
              Полный каталог программ ДПО ПК и ПП по Приказу МЧС №806 от 18.11.2021 (в редакции №1120 от 16.12.2024).
              Удостоверение с внесением в ФРДО, срок обучения 1–2 недели.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-center gap-3">
              <Link to="/register-organization">
                <Button size="lg" className="rounded-xl h-12 px-6 gap-2">
                  Обучить сотрудников
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <a href="#programs">
                <Button size="lg" variant="outline" className="rounded-xl h-12 px-6">
                  Смотреть программы
                </Button>
              </a>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Обязательные категории */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-5xl mx-auto">
            <motion.div variants={fadeUp} className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-destructive/10 text-destructive text-xs font-medium mb-4">
                <AlertTriangle className="w-3.5 h-3.5" />
                Обязательно по закону
              </div>
              <h2 className="font-display text-3xl md:text-4xl font-medium tracking-tight mb-4">
                5 категорий работников, которым нужно ДПО
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Приложение №4 к Приказу МЧС России №806 определяет пять категорий, которые обязаны проходить
                дополнительное профессиональное образование в области пожарной безопасности.
              </p>
            </motion.div>

            <motion.div variants={stagger} className="grid md:grid-cols-2 gap-4">
              {REQUIRED_CATEGORIES.map((cat) => (
                <motion.div key={cat.n} variants={fadeUp}>
                  <Card className="h-full border-border/60 hover:border-accent/40 transition-colors">
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center font-display font-medium shrink-0">
                          {cat.n}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-display text-lg font-medium mb-2 leading-snug">{cat.title}</h3>
                          <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{cat.who}</p>
                          <Badge variant="secondary" className="text-xs font-normal">
                            <Clock className="w-3 h-3 mr-1" />
                            {cat.period}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Программы платформы */}
      <section id="programs" className="py-16 md:py-20 bg-gradient-to-br from-secondary/20 via-background to-background">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-6xl mx-auto">
            <motion.div variants={fadeUp} className="text-center mb-12">
              <h2 className="font-display text-3xl md:text-4xl font-medium tracking-tight mb-4">
                Готовые программы обучения
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                {isLoading ? "Загружаем каталог…" : `${courses.length} программ по пожарной безопасности готовы к запуску в вашей организации.`}
              </p>
            </motion.div>

            <motion.div variants={stagger} className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {courses.map((c) => (
                <motion.div key={c.id} variants={fadeUp}>
                  <Card className="h-full border-border/60 hover:border-accent/40 hover:shadow-lg transition-all group">
                    <CardContent className="p-5 flex flex-col h-full">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
                          <Flame className="w-4 h-4" />
                        </div>
                        {c.hours ? (
                          <Badge variant="outline" className="text-xs">
                            {c.hours} ч
                          </Badge>
                        ) : null}
                      </div>
                      <h3 className="font-display text-base font-medium mb-2 leading-snug line-clamp-3 min-h-[3.5rem]">
                        {c.title}
                      </h3>
                      {c.description ? (
                        <p className="text-xs text-muted-foreground line-clamp-3 mb-4 leading-relaxed">{c.description}</p>
                      ) : null}
                      <div className="mt-auto flex items-center justify-between pt-3 border-t border-border/40">
                        <span className="text-sm font-medium text-accent">
                          {c.price && c.price > 0 ? `от ${c.price.toLocaleString("ru-RU")} ₽` : "По запросу"}
                        </span>
                        <Link to="/register-organization" className="text-xs text-muted-foreground group-hover:text-accent transition-colors inline-flex items-center gap-1">
                          Подключить
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Инструктажи */}
      <section className="py-16 md:py-20">
        <div className="container mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-4xl mx-auto">
            <motion.div variants={fadeUp} className="text-center mb-10">
              <h2 className="font-display text-3xl md:text-4xl font-medium tracking-tight mb-4">
                Противопожарные инструктажи
              </h2>
              <p className="text-muted-foreground">
                Кроме ДПО, работодатель обязан проводить 5 видов инструктажей. Программы утверждает руководитель организации.
              </p>
            </motion.div>
            <motion.div variants={stagger} className="grid sm:grid-cols-2 gap-3">
              {[
                { t: "Вводный", d: "Со всеми вновь принимаемыми, командированными, сезонными сотрудниками." },
                { t: "Первичный на рабочем месте", d: "До начала самостоятельной работы на месте." },
                { t: "Повторный", d: "Не реже 1 раза в год (для пожароопасных производств — 1 раз в 6 мес)." },
                { t: "Внеплановый", d: "При изменениях в нормативных актах, происшествиях, длительном перерыве." },
                { t: "Целевой", d: "Перед разовыми работами повышенной пожарной опасности." },
              ].map((it) => (
                <motion.div key={it.t} variants={fadeUp}>
                  <Card className="border-border/60 h-full">
                    <CardContent className="p-4 flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                      <div>
                        <div className="font-medium text-sm mb-1">{it.t}</div>
                        <div className="text-xs text-muted-foreground leading-relaxed">{it.d}</div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Преимущества */}
      <section className="py-16 md:py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-background to-secondary/20" />
        <div className="container mx-auto px-6 relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-5xl mx-auto">
            <motion.div variants={fadeUp} className="text-center mb-12">
              <h2 className="font-display text-3xl md:text-4xl font-medium tracking-tight">Почему выбирают нас</h2>
            </motion.div>
            <motion.div variants={fadeUp} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {advantages.map((a) => (
                <Card key={a.title} className="border-border/60 bg-card/80 h-full">
                  <CardContent className="p-6">
                    <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                      <a.icon className="w-5 h-5 text-accent" />
                    </div>
                    <h3 className="font-display text-base font-medium mb-2">{a.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{a.desc}</p>
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
            <motion.h2 variants={fadeUp} className="font-display text-3xl md:text-4xl font-medium tracking-tight mb-4">
              Начните обучение сегодня
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Зарегистрируйте организацию — получите доступ ко всем программам ПБ и другим 300+ курсам.
            </motion.p>
            <motion.div variants={fadeUp}>
              <Link to="/register-organization">
                <Button size="lg" className="rounded-xl h-12 px-8 gap-2">
                  Зарегистрировать организацию
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
