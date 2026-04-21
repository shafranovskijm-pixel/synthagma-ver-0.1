import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Clock, BookOpen, GraduationCap } from "lucide-react";
import { getBaseUrl } from "@/utils/getBaseUrl";

interface Org {
  id: string;
  name: string;
  public_slug: string | null;
  logo_url: string | null;
  description: string | null;
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

  useEffect(() => {
    if (!slug) return;
    (async () => {
      setLoading(true);
      const { data: orgData } = await supabase
        .from("organizations")
        .select("id, name, public_slug, logo_url, description")
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
        {org.logo_url && <meta property="og:image" content={org.logo_url} />}
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
          {org.logo_url && (
            <img src={org.logo_url} alt={org.name} className="h-16 md:h-20 mx-auto mb-6 object-contain" loading="eager" />
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

      {/* Courses grid */}
      <main className="max-w-6xl mx-auto px-6 py-12 md:py-16">
        {courses.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen className="w-16 h-16 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">У этой школы пока нет опубликованных курсов</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((c) => (
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

function pluralize(n: number): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "курс";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "курса";
  return "курсов";
}
