import { useState, useEffect } from "react";
import { ThemePersonalization } from "@/components/ui/ThemePersonalization";
import {
  Palette, Database, Shield, Bell, Save, Globe, Tag, Sparkles,
  RefreshCw, BarChart3, FileText, Bot, Terminal, Users, FolderOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SEOSettingsManager } from "./SEOSettingsManager";
import { PromoCodesManager } from "./PromoCodesManager";
import { AdminAnalytics } from "./AdminAnalytics";
import { BlogManager } from "./BlogManager";
import { AISettingsManager } from "./AISettingsManager";
import { DevToolsPanel } from "./DevToolsPanel";
import { AdminStaffTab } from "./AdminStaffTab";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface SystemSettings {
  maintenanceMode: boolean;
  registrationEnabled: boolean;
}

type SectionKey = "theme" | "staff" | "db" | "cache" | "seo" | "system" | "promo" | "notifications" | "analytics" | "content" | "ai" | "devtools";

const SECTIONS: { key: SectionKey; label: string; icon: React.ElementType; color: string }[] = [
  { key: "theme", label: "Тема оформления", icon: Palette, color: "text-violet-500" },
  { key: "staff", label: "Сотрудники", icon: Users, color: "text-cyan-500" },
  { key: "db", label: "Статистика БД", icon: Database, color: "text-blue-500" },
  { key: "cache", label: "Сброс кеша", icon: RefreshCw, color: "text-red-500" },
  { key: "seo", label: "SEO", icon: Globe, color: "text-emerald-500" },
  { key: "system", label: "Системные", icon: Shield, color: "text-orange-500" },
  { key: "promo", label: "Промоакции", icon: Tag, color: "text-pink-500" },
  { key: "notifications", label: "Уведомления", icon: Bell, color: "text-amber-500" },
  { key: "analytics", label: "Аналитика", icon: BarChart3, color: "text-sky-500" },
  { key: "content", label: "Контент", icon: FileText, color: "text-teal-500" },
  { key: "ai", label: "ИИ-провайдеры", icon: Bot, color: "text-purple-500" },
  { key: "devtools", label: "Developer Tools", icon: Terminal, color: "text-primary" },
];

export function AdminSettings() {
  const [activeSection, setActiveSection] = useState<SectionKey>("theme");

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== "undefined") return document.documentElement.classList.contains("dark");
    return false;
  });

  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    maintenanceMode: false,
    registrationEnabled: true });
  const [isSaving, setIsSaving] = useState(false);
  const [isResettingCache, setIsResettingCache] = useState(false);

  const [dbStats, setDbStats] = useState({ totalOrgs: 0, totalUsers: 0, totalCourses: 0, totalEnrollments: 0 });
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  useEffect(() => { fetchDbStats(); }, []);

  const fetchDbStats = async () => {
    setIsLoadingStats(true);
    try {
      const [orgsRes, usersRes, coursesRes, enrollmentsRes] = await Promise.all([
        supabase.from("organizations").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("courses").select("id", { count: "exact", head: true }),
        supabase.from("enrollments").select("id", { count: "exact", head: true }),
      ]);
      setDbStats({
        totalOrgs: orgsRes.count || 0,
        totalUsers: usersRes.count || 0,
        totalCourses: coursesRes.count || 0,
        totalEnrollments: enrollmentsRes.count || 0 });
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      toast.success("Настройки сохранены");
    } catch { toast.error("Ошибка сохранения"); }
    finally { setIsSaving(false); }
  };

  const renderContent = () => {
    switch (activeSection) {
      case "theme":
        return (
          <ThemePersonalization
            isDarkMode={isDarkMode}
            onToggleDark={(dark) => {
              setIsDarkMode(dark);
              if (dark) { document.documentElement.classList.add("dark"); localStorage.setItem("theme", "dark"); }
              else { document.documentElement.classList.remove("dark"); localStorage.setItem("theme", "light"); }
            }}
          />
        );

      case "db":
        return (
          <div className="space-y-4">
            {isLoadingStats ? (
              <div className="flex items-center justify-center py-8"><SigmaSpinner /></div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Организаций", value: dbStats.totalOrgs, cls: "bg-blue-500/5 border-blue-500/10 text-blue-600 dark:text-blue-400" },
                  { label: "Пользователей", value: dbStats.totalUsers, cls: "bg-emerald-500/5 border-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
                  { label: "Курсов", value: dbStats.totalCourses, cls: "bg-violet-500/5 border-violet-500/10 text-violet-600 dark:text-violet-400" },
                  { label: "Зачислений", value: dbStats.totalEnrollments, cls: "bg-orange-500/5 border-orange-500/10 text-orange-600 dark:text-orange-400" },
                ].map(s => (
                  <div key={s.label} className={`border rounded-xl p-4 ${s.cls}`}>
                    <div className="text-2xl font-bold">{s.value}</div>
                    <div className="text-sm text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
            )}
            <Button variant="outline" className="rounded-xl gap-2" onClick={fetchDbStats} disabled={isLoadingStats}>
              {isLoadingStats ? <SigmaSpinner size="sm" /> : <Database className="w-4 h-4" />}
              Обновить статистику
            </Button>
          </div>
        );

      case "cache":
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Принудительно сбросить кеш PWA у всех пользователей. Используйте, если студенты видят устаревший интерфейс.
            </p>
            <Button
              variant="destructive"
              className="rounded-xl gap-2"
              disabled={isResettingCache}
              onClick={async () => {
                setIsResettingCache(true);
                try {
                  const newVersion = "v" + Date.now();
                  const { error } = await supabase
                    .from("app_settings")
                    .update({ setting_value: newVersion, updated_at: new Date().toISOString() })
                    .eq("setting_key", "force_cache_version");
                  if (error) throw error;
                  toast.success("Кеш будет сброшен при следующей загрузке у всех пользователей");
                } catch (error) {
                  console.error(error);
                  toast.error("Ошибка сброса кеша");
                } finally { setIsResettingCache(false); }
              }}
            >
              {isResettingCache ? <SigmaSpinner size="sm" /> : <RefreshCw className="w-4 h-4" />}
              Сбросить кеш у всех
            </Button>
          </div>
        );

      case "seo": return <SEOSettingsManager />;

      case "system":
        return (
          <div className="space-y-4">
            {[
              {
                title: "Регистрация организаций",
                desc: "Разрешить новым организациям регистрироваться",
                active: systemSettings.registrationEnabled,
                toggle: () => setSystemSettings(p => ({ ...p, registrationEnabled: !p.registrationEnabled })),
                colorActive: "bg-primary" },
              {
                title: "Режим обслуживания",
                desc: "Временно заблокировать доступ для пользователей",
                active: systemSettings.maintenanceMode,
                toggle: () => setSystemSettings(p => ({ ...p, maintenanceMode: !p.maintenanceMode })),
                colorActive: "bg-destructive",
                badge: systemSettings.maintenanceMode },
            ].map(item => (
              <div key={item.title} className="flex items-center justify-between py-3 border-b border-border">
                <div>
                  <p className="font-medium text-sm flex items-center gap-2">
                    {item.title}
                    {item.badge && <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">Активен</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <button
                  onClick={item.toggle}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${item.active ? item.colorActive : "bg-muted"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${item.active ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            ))}
            <Button className="btn-gradient rounded-xl gap-2" onClick={handleSaveSettings} disabled={isSaving}>
              {isSaving ? <><SigmaSpinner size="sm" /> Сохранение...</> : <><Save className="w-4 h-4" /> Сохранить настройки</>}
            </Button>
          </div>
        );

      case "promo": return <PromoCodesManager />;

      case "notifications":
        return (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="p-3 rounded-full bg-amber-500/10 mb-3"><Sparkles className="w-6 h-6 text-amber-500" /></div>
            <p className="font-medium text-sm">Уведомления скоро появятся</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">Настройка уведомлений для администраторов о важных событиях</p>
          </div>
        );

      case "staff": return <AdminStaffTab />;
      case "analytics": return <AdminAnalytics />;
      case "content": return <BlogManager />;
      case "ai": return <AISettingsManager />;
      case "devtools": return <DevToolsPanel />;
      default: return null;
    }
  };

  const active = SECTIONS.find(s => s.key === activeSection)!;

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-[60vh]">
      {/* Left menu */}
      <nav className="w-full lg:w-[220px] shrink-0">
        <div className="lg:sticky lg:top-4 overflow-x-auto lg:overflow-x-visible">
          <div className="flex lg:flex-col gap-1 min-w-max lg:min-w-0 p-1 bg-card rounded-xl border border-border/60">
            {SECTIONS.map(s => {
              const Icon = s.icon;
              const isActive = activeSection === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setActiveSection(s.key)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-sm transition-all whitespace-nowrap ${
                    isActive
                      ? "bg-primary/10 text-primary font-medium shadow-sm"
                      : "text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-primary" : s.color}`} />
                  <span className="hidden lg:inline">{s.label}</span>
                  {s.key === "notifications" && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal hidden lg:inline-flex">Скоро</Badge>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Right content */}
      <div className="flex-1 min-w-0">
        <div className="bg-card rounded-xl lg:rounded-2xl border border-border/60 p-4 lg:p-6">
          <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border/60">
            <active.icon className={`w-5 h-5 ${active.color}`} />
            <h3 className="font-display font-semibold text-lg">{active.label}</h3>
          </div>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
