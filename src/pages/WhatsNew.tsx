import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Footer } from "@/components/landing/Footer";
import { Sparkles, ArrowLeft } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import whatsNewBanner from "@/assets/whats-new-banner.jpg";

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
        {/* Simple header */}
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="container mx-auto px-6 h-14 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <SigmaLogo size="md" showText />
            </Link>
            <Link to="/">
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                <ArrowLeft className="w-4 h-4" /> На главную
              </Button>
            </Link>
          </div>
        </header>

        {/* Hero banner — centered */}
        <div className="w-full flex justify-center px-6 pt-10 pb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-3xl rounded-2xl overflow-hidden shadow-lg"
          >
            <img
              src={whatsNewBanner}
              alt="Что нового"
              className="w-full h-[220px] sm:h-[280px] object-cover"
              width={1200}
              height={640}
            />
          </motion.div>
        </div>

        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="font-display text-2xl lg:text-3xl font-bold mb-2">Что нового</h1>
          <p className="text-muted-foreground text-sm">Последние улучшения и новые возможности платформы</p>
        </div>

        {/* Updates list */}
        <main className="container mx-auto px-6 pb-20 max-w-3xl">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : updates.length === 0 ? (
            <p className="text-center text-muted-foreground py-20">Пока нет обновлений</p>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-6 top-0 bottom-0 w-px bg-border hidden sm:block" />

              <div className="space-y-6">
                {updates.map((u, i) => (
                  <motion.article
                    key={u.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.07 }}
                    className="relative flex gap-4 sm:gap-6"
                  >
                    {/* Timeline dot */}
                    <div className="hidden sm:flex flex-col items-center shrink-0">
                      <div className="w-3 h-3 rounded-full bg-primary ring-4 ring-background z-10" />
                    </div>

                    {/* Card */}
                    <div className="flex-1 bg-card border border-border rounded-xl p-5 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                          {new Date(u.published_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(u.published_at).getFullYear()}
                        </span>
                      </div>
                      <h2 className="font-semibold text-base mb-1.5">{u.title}</h2>
                      <p className="text-muted-foreground text-sm leading-relaxed">{u.description}</p>
                      {u.image_url && (
                        <img
                          src={u.image_url}
                          alt={u.title}
                          className="mt-4 rounded-lg max-h-56 object-cover w-full"
                          loading="lazy"
                          width={800}
                          height={400}
                        />
                      )}
                    </div>
                  </motion.article>
                ))}
              </div>
            </div>
          )}
        </main>
        <Footer />
      </div>
    </>
  );
};

export default WhatsNew;
