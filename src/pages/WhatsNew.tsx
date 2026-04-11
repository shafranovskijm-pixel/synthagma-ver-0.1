import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Footer } from "@/components/landing/Footer";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";

interface PlatformUpdate {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  published_at: string;
}

const WhatsNew = () => {
  const [updates, setUpdates] = useState<PlatformUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("platform_updates")
      .select("id, title, description, image_url, published_at")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .then(({ data }) => {
        setUpdates((data as PlatformUpdate[]) || []);
        setLoading(false);
      });
  }, []);

  return (
    <>
      <Helmet>
        <title>Что нового — СИНТАГМА</title>
        <meta name="description" content="Последние обновления и улучшения платформы СИНТАГМА." />
      </Helmet>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="container mx-auto px-6 h-16 flex items-center">
            <Link to="/" className="flex items-center gap-2">
              <SigmaLogo size="md" showText />
            </Link>
          </div>
        </header>

        <main className="container mx-auto px-6 py-16 max-w-3xl">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-4">
              <Sparkles className="w-3 h-3 mr-1" /> Обновления
            </Badge>
            <h1 className="font-display text-3xl lg:text-4xl font-bold mb-3">Что нового</h1>
            <p className="text-muted-foreground">Последние улучшения и новые возможности платформы</p>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="space-y-8">
              {updates.map((u, i) => (
                <motion.article
                  key={u.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="border border-border rounded-xl p-6 bg-card hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Sparkles className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="font-semibold text-lg">{u.title}</h2>
                        <span className="text-xs text-muted-foreground">
                          {new Date(u.published_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-sm leading-relaxed">{u.description}</p>
                      {u.image_url && (
                        <img src={u.image_url} alt={u.title} className="mt-4 rounded-lg max-h-64 object-cover w-full" />
                      )}
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>
          )}
        </main>
        <Footer />
      </div>
    </>
  );
};

export default WhatsNew;
