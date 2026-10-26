import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { StarfieldCanvas } from "@/components/landing/StarfieldCanvas";
import { Footer } from "@/components/landing/Footer";
import {
  Shield, BookOpen, ArrowRight, Clock, FileCheck, RefreshCw, FileText, FileDown
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { exportCatalogToDocx, exportCatalogToPdf } from "@/utils/exportRostechnadzorCatalog";
import { usePublicCourseCatalog } from "@/hooks/usePublicCourseCatalog";
import { PublicCourseExplorer } from "@/components/landing/PublicCourseExplorer";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
};

const advantages = [
  {
    icon: FileCheck,
    title: "Готовые программы",
    description: "Выбирайте программы в каталоге и проверяйте состав курса перед подключением.",
  },
  {
    icon: RefreshCw,
    title: "Проверка перед запуском",
    description: "Перед назначением ученикам откройте карточку курса и проверьте материалы и тесты.",
  },
  {
    icon: Clock,
    title: "Подключение к организации",
    description: "Выбранный курс можно подключить к кабинету организации из каталога.",
  },
  {
    icon: Shield,
    title: "Направления обучения",
    description: "Электробезопасность, энергетика, охрана труда, пожарная безопасность, медицина, промбезопасность и другие.",
  },
];


const RostechnadzorCoursesPage = () => {
  const { data: catalog, isLoading: catalogLoading, isError: catalogError, refetch } = usePublicCourseCatalog();
  const fullCatalog = catalogError ? undefined : catalog?.groups;
  const totalCount = catalogError ? 0 : catalog?.totalCount ?? 0;
  const directionsCount = catalogError ? 0 : catalog?.directionsCount ?? 0;
  const jsonLdItems = (fullCatalog ?? []).map((cat, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: cat.title,
    description: `${cat.count} курсов`,
  }));

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Бесплатные готовые курсы для организаций | СИНТАГМА</title>
        <meta name="description" content="Собственные готовые курсы СИНТАГМЫ можно бесплатно добавить в кабинет организации. Использование СДО — по выбранному тарифу." />
        <meta property="og:title" content="Бесплатные готовые курсы — СИНТАГМА" />
        <meta property="og:description" content="Библиотека собственных бесплатных курсов СИНТАГМЫ. Добавьте материалы в кабинет организации и проверьте перед запуском обучения." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://xn--80aaiswd0ak.xn--p1ai/rostechnadzor-courses" />
        <link rel="canonical" href="https://xn--80aaiswd0ak.xn--p1ai/rostechnadzor-courses" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          "name": "Каталог готовых курсов СИНТАГМА",
          "description": "Готовые курсы по ключевым направлениям обучения",
          "numberOfItems": directionsCount || undefined,
          "itemListElement": jsonLdItems
        })}</script>
      </Helmet>

      <LandingHeader showStars />

      {/* Hero — dark style with starfield */}
      <section className="relative py-20 md:py-28 overflow-hidden bg-[#0a0e1a]">
        <StarfieldCanvas />

        <div className="container mx-auto px-6 relative z-10">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="max-w-4xl mx-auto text-center">
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/20 mb-6">
              <BookOpen className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-white/80">Библиотека{totalCount ? ` · ${totalCount} курсов` : ""}{directionsCount ? ` · ${directionsCount} направлений` : ""}</span>
            </motion.div>
            <motion.h1 variants={fadeUp} className="font-display text-4xl md:text-5xl lg:text-6xl font-medium mb-6 tracking-tight text-white">
              {totalCount ? `${totalCount} курсов — бесплатно` : "Бесплатные готовые курсы"}{" "}
              <br className="hidden sm:block" />
              <span className="text-white/50">для вашей организации</span>
            </motion.h1>
            <motion.p variants={fadeUp} className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
              Выберите программу в каталоге{directionsCount ? ` по ${directionsCount} направлениям` : ""},
              проверьте её материалы и бесплатно добавьте подходящий курс в кабинет организации. Использование СДО — по выбранному тарифу.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-center gap-4">
              <Link to="/register-organization">
                <Button size="lg" className="btn-gradient rounded-xl px-8 h-12 gap-2 group">
                  Зарегистрировать организацию
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
                { value: totalCount ? String(totalCount) : "—", label: "курсов" },
                { value: directionsCount ? String(directionsCount) : "—", label: "направлений" },
                { value: "Онлайн", label: "подключение из каталога" },
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
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="max-w-6xl mx-auto">
            <motion.div variants={fadeUp} className="text-center mb-8">
              <h2 className="font-display text-3xl md:text-4xl font-medium mb-4 tracking-tight">
                Найдите курс под вашу задачу
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto mb-6">
                Выберите направление или найдите нужную тему. Карточка откроется в каталоге организации после входа.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  variant="outline"
                  disabled={catalogLoading || catalogError || !fullCatalog?.length}
                  className="rounded-xl gap-2 border-accent/30 hover:bg-accent/10 hover:text-accent"
                  onClick={async () => {
                    if (!fullCatalog?.length) return;
                    try {
                      await exportCatalogToDocx(fullCatalog);
                      toast.success("Файл Word сформирован");
                    } catch (e) {
                      console.error(e);
                      toast.error("Не удалось сформировать Word");
                    }
                  }}
                >
                  <FileText className="w-4 h-4" />
                  {catalogLoading
                    ? "Загружаем каталог…"
                    : `Скачать каталог${totalCount ? ` (${totalCount})` : ""} в Word`}
                </Button>
                <Button
                  variant="outline"
                  disabled={catalogLoading || catalogError || !fullCatalog?.length}
                  className="rounded-xl gap-2 border-accent/30 hover:bg-accent/10 hover:text-accent"
                  onClick={async () => {
                    if (!fullCatalog?.length) return;
                    const t = toast.loading("Формируем PDF…");
                    try {
                      await exportCatalogToPdf(fullCatalog);
                      toast.success("PDF готов", { id: t });
                    } catch (e) {
                      console.error(e);
                      toast.error("Не удалось сформировать PDF", { id: t });
                    }
                  }}
                >
                  <FileDown className="w-4 h-4" />
                  {catalogLoading
                    ? "Загружаем каталог…"
                    : `Скачать каталог${totalCount ? ` (${totalCount})` : ""} в PDF`}
                </Button>
              </div>
            </motion.div>


            {catalogLoading && <div role="status" className="rounded-2xl border border-border/70 bg-card/70 py-16 text-center text-muted-foreground">Загружаем актуальный каталог…</div>}
            {catalogError && <div className="rounded-2xl border border-border/70 bg-card/70 py-12 text-center text-muted-foreground" role="alert"><p>Не удалось загрузить каталог. Повторите загрузку.</p><Button variant="link" onClick={() => void refetch()}>Повторить загрузку</Button></div>}
            {!catalogLoading && !catalogError && catalog?.totalCount === 0 && <div className="py-12 text-center text-muted-foreground">В публичном каталоге пока нет доступных курсов.</div>}
            {!catalogLoading && !catalogError && catalog && catalog.totalCount > 0 && <PublicCourseExplorer catalog={catalog} />}

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
        <div className="absolute top-[15%] left-[10%] w-72 h-72 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-[10%] right-[8%] w-64 h-64 bg-accent/4 rounded-full blur-3xl pointer-events-none" />
        <div className="container mx-auto px-6 text-center relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="font-display text-3xl md:text-4xl font-medium mb-4 tracking-tight">
              От выбранного курса — <span className="text-accent">к обучению команды</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Создайте кабинет организации, бесплатно добавьте подходящие материалы
              и подготовьте программу к назначению ученикам.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-center gap-4">
              <Link to="/register-organization">
                <Button size="lg" className="btn-gradient rounded-xl px-8 h-12 gap-2 group">
                  Зарегистрировать организацию
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
