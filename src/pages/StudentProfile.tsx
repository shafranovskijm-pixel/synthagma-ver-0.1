import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "next-themes";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, User, Video, FileCheck, FileText, Trophy, Palette, Users, LogOut, Sun, Moon, Monitor, Loader2, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { VideoIdentification } from "@/components/student/VideoIdentification";
import { StudentConsentForm } from "@/components/student/StudentConsentForm";
import { StudentDocumentsUpload } from "@/components/student/StudentDocumentsUpload";
import { AchievementsPanel } from "@/components/student/AchievementsPanel";
import { cn } from "@/lib/utils";

export default function StudentProfile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState("profile");

  const { data: profile, isLoading } = useQuery({
    queryKey: ["student-profile-page", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name, organization_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!p) return null;
      let orgName: string | null = null;
      if (p.organization_id) {
        const { data: org } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", p.organization_id)
          .maybeSingle();
        orgName = org?.name || null;
      }
      return { full_name: p.full_name, organization_id: p.organization_id, organization_name: orgName };
    },
    enabled: !!user?.id,
  });

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
      return b ? { logoUrl: b.logoUrl, primaryColor: b.primaryColor } : null;
    },
    enabled: !!profile?.organization_id,
  });

  const { data: orgSettings } = useQuery({
    queryKey: ["student-profile-org-settings", profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return null;
      const { data } = await supabase
        .from("organizations")
        .select("student_dashboard_settings")
        .eq("id", profile.organization_id)
        .maybeSingle();
      const s = data?.student_dashboard_settings as any;
      return { showAchievements: s?.showAchievements ?? false };
    },
    enabled: !!profile?.organization_id,
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const initials = profile?.full_name
    ? profile.full_name.split(" ").slice(0, 2).map((n: string) => n[0]).join("").toUpperCase()
    : "У";

  const tabs = [
    { id: "profile", label: "Профиль", icon: User },
    { id: "identification", label: "Идентификация", icon: Video },
    { id: "consent", label: "Согласие на ПД", icon: FileCheck },
    { id: "documents", label: "Документы", icon: FileText },
    ...(orgSettings?.showAchievements ? [{ id: "achievements", label: "Достижения", icon: Trophy }] : []),
    { id: "theme", label: "Тема", icon: Palette },
    { id: "partner", label: "Партнёрская программа", icon: Users },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b border-border bg-card px-6 py-4 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/student")} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Назад
        </Button>
        <h1 className="text-lg font-semibold">Мой профиль</h1>
      </div>

      <div className="max-w-5xl mx-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
            {tabs.map(tab => (
              <TabsTrigger key={tab.id} value={tab.id} className="gap-2 text-xs sm:text-sm">
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Profile tab */}
          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Мой профиль</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-4">
                  <Avatar className="w-16 h-16">
                    <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-xl font-semibold">{profile?.full_name || "Ученик"}</p>
                    <p className="text-sm text-muted-foreground">{user?.email}</p>
                    {profile?.organization_name && (
                      <p className="text-sm text-muted-foreground mt-1">{profile.organization_name}</p>
                    )}
                  </div>
                </div>
                <div className="pt-4 border-t border-border">
                  <Button variant="destructive" onClick={handleLogout} className="gap-2">
                    <LogOut className="w-4 h-4" />
                    Выйти из аккаунта
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Identification tab */}
          <TabsContent value="identification">
            <Card>
              <CardContent className="pt-6">
                {user && (
                  <VideoIdentification
                    userId={user.id}
                    userName={profile?.full_name || "Ученик"}
                    organizationId={profile?.organization_id || undefined}
                    embedded={true}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Consent tab */}
          <TabsContent value="consent">
            <Card>
              <CardContent className="pt-6">
                {user && profile?.organization_id && (
                  <StudentConsentForm
                    userId={user.id}
                    userName={profile?.full_name || "Ученик"}
                    organizationId={profile.organization_id}
                    embedded={true}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Documents tab */}
          <TabsContent value="documents">
            <Card>
              <CardContent className="pt-6">
                {user && profile?.organization_id && (
                  <StudentDocumentsUpload
                    userId={user.id}
                    organizationId={profile.organization_id}
                    isOpen={false}
                    onOpenChange={() => {}}
                    embedded={true}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Achievements tab */}
          {orgSettings?.showAchievements && (
            <TabsContent value="achievements">
              <Card>
                <CardContent className="pt-6">
                  {user && (
                    <AchievementsPanel
                      userId={user.id}
                      isOpen={false}
                      onOpenChange={() => {}}
                      embedded={true}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Theme tab */}
          <TabsContent value="theme">
            <Card>
              <CardHeader>
                <CardTitle>Тема оформления</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { id: "light", label: "Светлая", icon: Sun, desc: "Классическая светлая тема" },
                    { id: "dark", label: "Тёмная", icon: Moon, desc: "Тёмная тема для работы ночью" },
                    { id: "system", label: "Системная", icon: Monitor, desc: "Следует настройкам вашего устройства" },
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id)}
                      className={cn(
                        "flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all",
                        theme === t.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30"
                      )}
                    >
                      <t.icon className={cn("w-8 h-8", theme === t.id ? "text-primary" : "text-muted-foreground")} />
                      <span className="font-medium">{t.label}</span>
                      <span className="text-xs text-muted-foreground text-center">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Partner program tab */}
          <TabsContent value="partner">
            <Card>
              <CardHeader>
                <CardTitle>Партнёрская программа</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  Приглашайте организации на платформу и получайте от 10% до 25% комиссии с их оплат подписки в течение 2 лет.
                </p>
                <Button onClick={() => navigate("/partner")} className="gap-2">
                  <Users className="w-4 h-4" />
                  Перейти к партнёрской программе
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
