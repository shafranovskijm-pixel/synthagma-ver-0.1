import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import OrgPageLayout from "@/components/organization/OrgPageLayout";
import { motion } from "framer-motion";

interface PlatformUpdate {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  published_at: string;
}

function WhatsNewContent() {
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

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  if (updates.length === 0) {
    return <p className="text-center text-muted-foreground py-20">Пока нет обновлений</p>;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="font-display text-xl font-bold mb-1">Последние обновления</h2>
        <p className="text-muted-foreground text-sm">Новые возможности и улучшения платформы</p>
      </div>

      <div className="relative">
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
              <div className="hidden sm:flex flex-col items-center shrink-0">
                <div className="w-3 h-3 rounded-full bg-primary ring-4 ring-background z-10" />
              </div>
              <div className="flex-1 bg-card border border-border rounded-xl p-5 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    {new Date(u.published_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(u.published_at).getFullYear()}
                  </span>
                </div>
                <h3 className="font-semibold text-base mb-1.5">{u.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{u.description}</p>
                {u.image_url && (
                  <img src={u.image_url} alt={u.title} className="mt-4 rounded-lg max-h-56 object-cover w-full" loading="lazy" />
                )}
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function OrganizationWhatsNew() {
  return (
    <OrgPageLayout title="Что нового" icon={Sparkles}>
      <WhatsNewContent />
    </OrgPageLayout>
  );
}
