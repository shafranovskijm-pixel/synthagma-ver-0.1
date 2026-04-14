import { useState, useEffect } from "react";
import { ThemePersonalization } from "@/components/ui/ThemePersonalization";
import { 
  Palette, ChevronRight, Database,
  Shield, Bell, Loader2, Save, Globe, Tag, Sparkles, Settings, RefreshCw,
  BarChart3, FileText, Bot, Terminal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SEOSettingsManager } from "./SEOSettingsManager";
import { PromoCodesManager } from "./PromoCodesManager";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { AdminAnalytics } from "./AdminAnalytics";
import { BlogManager } from "./BlogManager";
import { AISettingsManager } from "./AISettingsManager";
import { DevToolsPanel } from "./DevToolsPanel";

interface SystemSettings {
  maintenanceMode: boolean;
  registrationEnabled: boolean;
}

export function AdminSettings() {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    maintenanceMode: false,
    registrationEnabled: true,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isResettingCache, setIsResettingCache] = useState(false);
  const [dbStats, setDbStats] = useState({
    totalOrgs: 0,
    totalUsers: 0,
    totalCourses: 0,
    totalEnrollments: 0,
  });
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  useEffect(() => {
    fetchDbStats();
  }, []);

  const fetchDbStats = async () => {
    setIsLoadingStats(true);
    try {
      const [orgsRes, usersRes, coursesRes, enrollmentsRes] = await Promise.all([
        supabase.from('organizations').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('courses').select('id', { count: 'exact', head: true }),
        supabase.from('enrollments').select('id', { count: 'exact', head: true }),
      ]);

      setDbStats({
        totalOrgs: orgsRes.count || 0,
        totalUsers: usersRes.count || 0,
        totalCourses: coursesRes.count || 0,
        totalEnrollments: enrollmentsRes.count || 0,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      toast.success('Настройки сохранены');
    } catch (error) {
      toast.error('Ошибка сохранения');
    } finally {
      setIsSaving(false);
    }
  };

  const cardClass = "bg-card rounded-xl lg:rounded-2xl border border-border/60 shadow-sm hover:shadow-md transition-shadow duration-200 group";

  return (
    <div className="max-w-2xl space-y-4 lg:space-y-6">
      {/* Page Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-2xl font-display font-bold bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
            Настройки
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">6 секций • Панель администратора</p>
      </div>

      {/* Theme Settings */}
      <details className={cardClass} open>
        <summary className="p-4 lg:p-6 cursor-pointer list-none flex items-center justify-between">
          <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-violet-500/10">
              <Palette className="w-4 h-4 lg:w-5 lg:h-5 text-violet-500" />
            </div>
            Тема оформления
          </h3>
          <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 lg:px-6 pb-4 lg:pb-6">
          <ThemePersonalization
            isDarkMode={isDarkMode}
            onToggleDark={(dark) => {
              setIsDarkMode(dark);
              if (dark) {
                document.documentElement.classList.add('dark');
                localStorage.setItem('theme', 'dark');
              } else {
                document.documentElement.classList.remove('dark');
                localStorage.setItem('theme', 'light');
              }
            }}
          />
        </div>
      </details>

      {/* Database Stats */}
      <details className={cardClass}>
        <summary className="p-4 lg:p-6 cursor-pointer list-none flex items-center justify-between">
          <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-500/10">
              <Database className="w-4 h-4 lg:w-5 lg:h-5 text-blue-500" />
            </div>
            Статистика базы данных
          </h3>
          <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 lg:px-6 pb-4 lg:pb-6">
          {isLoadingStats ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{dbStats.totalOrgs}</div>
                <div className="text-sm text-muted-foreground">Организаций</div>
              </div>
              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4">
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{dbStats.totalUsers}</div>
                <div className="text-sm text-muted-foreground">Пользователей</div>
              </div>
              <div className="bg-violet-500/5 border border-violet-500/10 rounded-xl p-4">
                <div className="text-2xl font-bold text-violet-600 dark:text-violet-400">{dbStats.totalCourses}</div>
                <div className="text-sm text-muted-foreground">Курсов</div>
              </div>
              <div className="bg-orange-500/5 border border-orange-500/10 rounded-xl p-4">
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{dbStats.totalEnrollments}</div>
                <div className="text-sm text-muted-foreground">Зачислений</div>
              </div>
            </div>
          )}
          <Button 
            variant="outline" 
            className="mt-4 rounded-xl gap-2"
            onClick={fetchDbStats}
            disabled={isLoadingStats}
          >
            {isLoadingStats ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            Обновить статистику
          </Button>
        </div>
      </details>

      {/* Cache Reset */}
      <details className={cardClass}>
        <summary className="p-4 lg:p-6 cursor-pointer list-none flex items-center justify-between">
          <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-red-500/10">
              <RefreshCw className="w-4 h-4 lg:w-5 lg:h-5 text-red-500" />
            </div>
            Сброс кеша у пользователей
          </h3>
          <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 lg:px-6 pb-4 lg:pb-6 space-y-3">
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
                const newVersion = 'v' + Date.now();
                const { error } = await supabase
                  .from('app_settings')
                  .update({ setting_value: newVersion, updated_at: new Date().toISOString() })
                  .eq('setting_key', 'force_cache_version');
                if (error) throw error;
                toast.success('Кеш будет сброшен при следующей загрузке у всех пользователей');
              } catch (error) {
                console.error(error);
                toast.error('Ошибка сброса кеша');
              } finally {
                setIsResettingCache(false);
              }
            }}
          >
            {isResettingCache ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Сбросить кеш у всех
          </Button>
        </div>
      </details>

      <details className={cardClass}>
        <summary className="p-4 lg:p-6 cursor-pointer list-none flex items-center justify-between">
          <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10">
              <Globe className="w-4 h-4 lg:w-5 lg:h-5 text-emerald-500" />
            </div>
            SEO настройки
          </h3>
          <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 lg:px-6 pb-4 lg:pb-6">
          <SEOSettingsManager />
        </div>
      </details>

      {/* System Settings */}
      <details className={cardClass}>
        <summary className="p-4 lg:p-6 cursor-pointer list-none flex items-center justify-between">
          <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-orange-500/10">
              <Shield className="w-4 h-4 lg:w-5 lg:h-5 text-orange-500" />
            </div>
            Системные настройки
          </h3>
          <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 lg:px-6 pb-4 lg:pb-6 space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div>
              <p className="font-medium text-sm lg:text-base">Регистрация организаций</p>
              <p className="text-xs lg:text-sm text-muted-foreground">Разрешить новым организациям регистрироваться</p>
            </div>
            <button
              onClick={() => setSystemSettings(prev => ({ ...prev, registrationEnabled: !prev.registrationEnabled }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${systemSettings.registrationEnabled ? 'bg-primary' : 'bg-muted'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${systemSettings.registrationEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between py-3 border-b border-border">
            <div>
              <p className="font-medium text-sm lg:text-base flex items-center gap-2">
                Режим обслуживания
                {systemSettings.maintenanceMode && (
                  <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">Активен</span>
                )}
              </p>
              <p className="text-xs lg:text-sm text-muted-foreground">Временно заблокировать доступ для пользователей</p>
            </div>
            <button
              onClick={() => setSystemSettings(prev => ({ ...prev, maintenanceMode: !prev.maintenanceMode }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${systemSettings.maintenanceMode ? 'bg-destructive' : 'bg-muted'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${systemSettings.maintenanceMode ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>


          <Button 
            className="btn-gradient rounded-xl gap-2" 
            onClick={handleSaveSettings}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Сохранение...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Сохранить настройки
              </>
            )}
          </Button>
        </div>
      </details>

      {/* Promo Codes */}
      <details className={cardClass}>
        <summary className="p-4 lg:p-6 cursor-pointer list-none flex items-center justify-between">
          <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-pink-500/10">
              <Tag className="w-4 h-4 lg:w-5 lg:h-5 text-pink-500" />
            </div>
            Промоакции
          </h3>
          <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 lg:px-6 pb-4 lg:pb-6">
          <PromoCodesManager />
        </div>
      </details>

      {/* Notifications */}
      <details className={cardClass}>
        <summary className="p-4 lg:p-6 cursor-pointer list-none flex items-center justify-between">
          <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10">
              <Bell className="w-4 h-4 lg:w-5 lg:h-5 text-amber-500" />
            </div>
            Уведомления
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">Скоро</Badge>
          </h3>
          <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 lg:px-6 pb-4 lg:pb-6">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="p-3 rounded-full bg-amber-500/10 mb-3">
              <Sparkles className="w-6 h-6 text-amber-500" />
            </div>
            <p className="font-medium text-sm">Уведомления скоро появятся</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Настройка уведомлений для администраторов о важных событиях в системе
            </p>
          </div>
        </div>
      </details>

      {/* Analytics */}
      <details className={cardClass}>
        <summary className="p-4 lg:p-6 cursor-pointer list-none flex items-center justify-between">
          <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-sky-500/10">
              <BarChart3 className="w-4 h-4 lg:w-5 lg:h-5 text-sky-500" />
            </div>
            Аналитика
          </h3>
          <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 lg:px-6 pb-4 lg:pb-6">
          <AdminAnalytics />
        </div>
      </details>

      {/* Content */}
      <details className={cardClass}>
        <summary className="p-4 lg:p-6 cursor-pointer list-none flex items-center justify-between">
          <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-teal-500/10">
              <FileText className="w-4 h-4 lg:w-5 lg:h-5 text-teal-500" />
            </div>
            Контент
          </h3>
          <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 lg:px-6 pb-4 lg:pb-6">
          <BlogManager />
        </div>
      </details>

      {/* AI Providers */}
      <details className={cardClass}>
        <summary className="p-4 lg:p-6 cursor-pointer list-none flex items-center justify-between">
          <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-purple-500/10">
              <Bot className="w-4 h-4 lg:w-5 lg:h-5 text-purple-500" />
            </div>
            ИИ-провайдеры
          </h3>
          <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 lg:px-6 pb-4 lg:pb-6">
          <AISettingsManager />
        </div>
      </details>

      {/* DevTools */}
      <details className={cardClass}>
        <summary className="p-4 lg:p-6 cursor-pointer list-none flex items-center justify-between">
          <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gray-500/10">
              <Terminal className="w-4 h-4 lg:w-5 lg:h-5 text-gray-500" />
            </div>
            Developer Tools
          </h3>
          <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 lg:px-6 pb-4 lg:pb-6">
          <DevToolsPanel />
        </div>
      </details>

      {/* System Info */}
      <div className={`${cardClass} p-4 lg:p-6`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-slate-500/10">
              <Shield className="w-4 h-4 lg:w-5 lg:h-5 text-slate-500" />
            </div>
            О системе
          </h3>
          <Badge variant="outline" className="text-xs font-mono">v1.0.0</Badge>
        </div>
        <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-muted/50">
          <SigmaLogo size="sm" showText={false} />
          <div>
            <p className="font-display font-semibold text-sm">Синтагма</p>
            <p className="text-xs text-muted-foreground">Платформа дистанционного обучения</p>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Окружение</span>
            <span className="font-medium">Production</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Сборка</span>
            <span className="font-medium font-mono text-xs">2026.03.07</span>
          </div>
        </div>
      </div>
    </div>
  );
}
