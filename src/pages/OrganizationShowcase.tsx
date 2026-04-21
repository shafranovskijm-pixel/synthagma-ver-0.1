import { useEffect, useState, useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Clock, BookOpen, GraduationCap, Search } from "lucide-react";
import { getBaseUrl } from "@/utils/getBaseUrl";

interface Org {
  id: string;
  name: string;
  public_slug: string | null;
  description: string | null;
  branding: any;
}

interface Course {
  id: string;
  title: string;
  slug: string | null;
  description: string | null;
  duration: string | null;
  price: number;
  cover_image_url: string | null;
  accent_color: string | null;
}

type PriceFilter = "all" | "free" | "paid";

/**
 * Публичная витрина школы — показывает все опубликованные курсы организации.
 * Доступна по адресу /o/:slug, slug автогенерится из названия в БД.
 */
export default function OrganizationShowcase() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [org, setOrg] = useState<Org | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");

  useEffect(() => {
    if (!slug) return;
    (async () => {
      setLoading(true);
      const { data: orgData } = await supabase
        .from("organizations")
        .select("id, name, public_slug, description, branding")
        .eq("public_slug", slug)
        .maybeSingle();

      if (!orgData) {
        setLoading(false);
        return;
      }
      setOrg(orgData as Org);

      const { data: coursesData } = await supabase
        .from("courses")
        .select("id, title, slug, description, duration, price, cover_image_url, accent_color")
        .eq("organization_id", orgData.id)
        .eq("is_published", true)
        .eq("hidden_from_catalog", false)
        .order("catalog_order", { ascending: true });

      setCourses((coursesData as Course[]) || []);
      setLoading(false);
    })();
  }, [slug]);

  const filteredCourses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return courses.filter((c) => {
      if (priceFilter === "free" && c.price > 0) return false;
      if (priceFilter === "paid" && c.price === 0) return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        (c.description?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [courses, search, priceFilter]);

  const freeCount = useMemo(() => courses.filter((c) => c.price === 0).length, [courses]);
  const paidCount = courses.length - freeCount;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <SigmaSpinner size="lg" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-bold mb-3">Школа не найдена</h1>
        <p className="text-muted-foreground mb-6">Проверьте ссылку или вернитесь на главную</p>
        <Button onClick={() => navigate("/")} variant="outline">На главную</Button>
      </div>
    );
  }

  const canonicalUrl = `${getBaseUrl()}/o/${org.public_slug}`;
  const metaTitle = `${org.name} — каталог курсов`;
  const metaDesc = org.description?.slice(0, 160) || `Все курсы школы ${org.name}: программы обучения, повышение квалификации, профессиональная переподготовка`;
  const ogImage = org.logo_url || "";

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDesc} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDesc} />
        <meta property="og:url" content={canonicalUrl} />
        {ogImage && <meta property="og:image" content={ogImage} />}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={metaTitle} />
        <meta name="twitter:description" content={metaDesc} />
        {ogImage && <meta name="twitter:image" content={ogImage} />}
      </Helmet>

      {/* Hero / Header */}
      <header className="relative px-6 pt-12 pb-16 md:pt-20 md:pb-24 border-b border-border bg-card/40 backdrop-blur">
        <button
          onClick={() => navigate(-1)}
          className="absolute top-6 left-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="w-4 h-4" /> Назад
        </button>

        <div className="max-w-5xl mx-auto text-center">
          {orgLogo && (
            <img
              src={orgLogo}
              alt={org.name}
              className="w-20 h-20 mx-auto mb-5 rounded-2xl object-cover border border-border shadow-sm"
              loading="eager"
            />
          )}
          <h1 className="text-3xl md:text-5xl font-bold mb-4 tracking-tight">{org.name}</h1>
          {org.description && (
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">{org.description}</p>
          )}
          <div className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-full px-4 py-2 border border-border">
            <GraduationCap className="w-4 h-4" />
            {courses.length === 0 ? "Курсы скоро появятся" : `${courses.length} ${pluralize(courses.length)} в каталоге`}
          </div>
        </div>
      </header>

      {/* Поиск + фильтры */}
      {courses.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 pt-8">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по названию или описанию"
                className="pl-9 rounded-xl"
              />
            </div>
            <div className="flex gap-2 shrink-0">
              <FilterChip active={priceFilter === "all"} onClick={() => setPriceFilter("all")}>
                Все ({courses.length})
              </FilterChip>
              <FilterChip active={priceFilter === "free"} onClick={() => setPriceFilter("free")}>
                Бесплатные ({freeCount})
              </FilterChip>
              <FilterChip active={priceFilter === "paid"} onClick={() => setPriceFilter("paid")}>
                Платные ({paidCount})
              </FilterChip>
            </div>
          </div>
        </section>
      )}

      {/* Courses grid */}
      <main className="max-w-6xl mx-auto px-6 py-8 md:py-12">
        {courses.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen className="w-16 h-16 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">У этой школы пока нет опубликованных курсов</p>
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground">Ничего не найдено по вашему запросу</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 rounded-xl"
              onClick={() => { setSearch(""); setPriceFilter("all"); }}
            >
              Сбросить фильтры
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourses.map((c) => (
              <Link
                key={c.id}
                to={`/c/${c.slug || c.id}`}
                className="block group"
              >
                <Card className="overflow-hidden h-full hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border-border/60">
                  <div className="aspect-video bg-muted relative overflow-hidden">
                    {c.cover_image_url ? (
                      <img
                        src={c.cover_image_url}
                        alt={c.title}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center"
                        style={{ background: `linear-gradient(135deg, ${c.accent_color || "hsl(var(--primary))"}, ${c.accent_color || "hsl(var(--primary))"}99)` }}
                      >
                        <BookOpen className="w-12 h-12 text-white/80" />
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <h3 className="font-semibold text-lg mb-2 line-clamp-2 group-hover:text-primary transition">{c.title}</h3>
                    {c.description && (
                      <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{c.description}</p>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      {c.duration && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="w-3.5 h-3.5" /> {c.duration}
                        </span>
                      )}
                      <span className="font-bold text-foreground">
                        {c.price > 0 ? `${c.price.toLocaleString("ru-RU")} ₽` : "Бесплатно"}
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        Платформа Синтагма
      </footer>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-2 text-xs font-medium rounded-xl border transition ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function pluralize(n: number): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "курс";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "курса";
  return "курсов";
}
