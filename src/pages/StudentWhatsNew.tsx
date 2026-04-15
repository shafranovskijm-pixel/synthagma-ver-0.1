import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StudentProfileSidebar } from "@/components/student/StudentProfileSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import {} from "lucide-react";

interface PlatformUpdate {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  published_at: string;
}

export default function StudentWhatsNew() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [updates, setUpdates] = useState<PlatformUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  const effectiveUserId = user?.id || null;

  const { data: profile } = useQuery({
    queryKey: ["student-profile-page", effectiveUserId],
    queryFn: async () => {
      if (!effectiveUserId) return null;
      const { data: p } = await (supabase
        .from("profiles")
        .select("full_name, organization_id")
        .eq("user_id", effectiveUserId)
        .maybeSingle() as any);
      return p;
    },
    enabled: !!effectiveUserId });

  const { data: branding } = useQuery({
    queryKey: ["student-profile-branding", profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return null;
      const { data } = await supabase
        .from("organizations")
        .select("branding")
        .eq("id", profile.organization_id)
        .maybeSingle();
      const b = data?.branding as any;
      return b ? { logoUrl: b.logoUrl } : null;
    },
    enabled: !!profile?.organization_id });

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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background">
      <StudentProfileSidebar
        activeTab=""
        onTabChange={(tab) => navigate("/student/profile")}
        logoUrl={branding?.logoUrl}
        isAdminView={false}
        onLogout={handleLogout}
        onBack={() => navigate("/student")}
      />

      <div className="lg:pl-[88px] min-h-screen">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">Что нового</h1>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <SigmaSpinner size="lg" />
            </div>
          ) : updates.length === 0 ? (
            <p className="text-center text-muted-foreground py-20">Пока нет обновлений</p>
          ) : (
            <div className="max-w-3xl mx-auto">
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
          )}
        </div>
      </div>
    </div>
  );
}
