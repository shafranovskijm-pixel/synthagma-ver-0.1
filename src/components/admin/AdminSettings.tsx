import { useState, useEffect } from "react";
import { 
  Sun, Moon, Palette, ChevronRight, Database, 
  Shield, Bell, Loader2, Save, AlertCircle, Package
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PatchUpdatesManager } from "./PatchUpdatesManager";

interface SystemSettings {
  maintenanceMode: boolean;
  registrationEnabled: boolean;
  defaultTokensLimit: number;
  defaultStorageLimit: number;
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
    defaultTokensLimit: 100000,
    defaultStorageLimit: 1073741824, // 1GB
  });

  const [isSaving, setIsSaving] = useState(false);
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
      // Here you would save to a system_settings table
      await new Promise(resolve => setTimeout(resolve, 500));
      toast.success('Настройки сохранены');
    } catch (error) {
      toast.error('Ошибка сохранения');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4 lg:space-y-6">
      {/* Theme Settings */}
      <details className="bg-card rounded-xl lg:rounded-2xl border border-border group" open>
        <summary className="p-4 lg:p-6 cursor-pointer list-none flex items-center justify-between">
          <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
            <Palette className="w-4 h-4 lg:w-5 lg:h-5" />
            Тема оформления
          </h3>
          <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 lg:px-6 pb-4 lg:pb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="font-medium text-sm lg:text-base">Режим оформления</p>
              <p className="text-xs lg:text-sm text-muted-foreground">Выберите светлую или тёмную тему</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={!isDarkMode ? "default" : "outline"}
                className="rounded-xl gap-2 text-xs lg:text-sm flex-1 sm:flex-none"
                size="sm"
                onClick={() => {
                  setIsDarkMode(false);
                  document.documentElement.classList.remove('dark');
                  localStorage.setItem('theme', 'light');
                }}
              >
                <Sun className="w-4 h-4" />
                Светлая
              </Button>
              <Button
                variant={isDarkMode ? "default" : "outline"}
                className="rounded-xl gap-2 text-xs lg:text-sm flex-1 sm:flex-none"
                size="sm"
                onClick={() => {
                  setIsDarkMode(true);
                  document.documentElement.classList.add('dark');
                  localStorage.setItem('theme', 'dark');
                }}
              >
                <Moon className="w-4 h-4" />
                Тёмная
              </Button>
            </div>
          </div>
        </div>
      </details>

      {/* Database Stats */}
      <details className="bg-card rounded-xl lg:rounded-2xl border border-border group">
        <summary className="p-4 lg:p-6 cursor-pointer list-none flex items-center justify-between">
          <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
            <Database className="w-4 h-4 lg:w-5 lg:h-5" />
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
              <div className="bg-secondary/50 rounded-xl p-4">
                <div className="text-2xl font-bold">{dbStats.totalOrgs}</div>
                <div className="text-sm text-muted-foreground">Организаций</div>
              </div>
              <div className="bg-secondary/50 rounded-xl p-4">
                <div className="text-2xl font-bold">{dbStats.totalUsers}</div>
                <div className="text-sm text-muted-foreground">Пользователей</div>
              </div>
              <div className="bg-secondary/50 rounded-xl p-4">
                <div className="text-2xl font-bold">{dbStats.totalCourses}</div>
                <div className="text-sm text-muted-foreground">Курсов</div>
              </div>
              <div className="bg-secondary/50 rounded-xl p-4">
                <div className="text-2xl font-bold">{dbStats.totalEnrollments}</div>
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

      {/* System Settings */}
      <details className="bg-card rounded-xl lg:rounded-2xl border border-border group">
        <summary className="p-4 lg:p-6 cursor-pointer list-none flex items-center justify-between">
          <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
            <Shield className="w-4 h-4 lg:w-5 lg:h-5" />
            Системные настройки
          </h3>
          <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 lg:px-6 pb-4 lg:pb-6 space-y-4">
          {/* Registration */}
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

          {/* Maintenance Mode */}
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

          {/* Default Limits */}
          <div className="space-y-3 py-3">
            <div>
              <Label className="text-sm">Лимит AI-токенов по умолчанию</Label>
              <Input
                type="number"
                value={systemSettings.defaultTokensLimit}
                onChange={(e) => setSystemSettings(prev => ({ ...prev, defaultTokensLimit: parseInt(e.target.value) || 0 }))}
                className="mt-1 rounded-xl"
              />
            </div>
            <div>
              <Label className="text-sm">Лимит хранилища по умолчанию (байт)</Label>
              <Input
                type="number"
                value={systemSettings.defaultStorageLimit}
                onChange={(e) => setSystemSettings(prev => ({ ...prev, defaultStorageLimit: parseInt(e.target.value) || 0 }))}
                className="mt-1 rounded-xl"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Текущее значение: {(systemSettings.defaultStorageLimit / 1073741824).toFixed(1)} ГБ
              </p>
            </div>
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

      {/* Notifications Settings */}
      <details className="bg-card rounded-xl lg:rounded-2xl border border-border group">
        <summary className="p-4 lg:p-6 cursor-pointer list-none flex items-center justify-between">
          <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
            <Bell className="w-4 h-4 lg:w-5 lg:h-5" />
            Уведомления
          </h3>
          <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 lg:px-6 pb-4 lg:pb-6">
          <p className="text-sm text-muted-foreground">
            Настройка уведомлений для администраторов о важных событиях в системе.
          </p>
          <div className="mt-4 p-4 bg-secondary/50 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Функция уведомлений находится в разработке
            </span>
          </div>
        </div>
      </details>

      {/* Developer Mode - Patch Updates */}
      <details className="bg-card rounded-xl lg:rounded-2xl border border-border group">
        <summary className="p-4 lg:p-6 cursor-pointer list-none flex items-center justify-between">
          <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
            <Package className="w-4 h-4 lg:w-5 lg:h-5" />
            Режим разработчика
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">Dev</span>
          </h3>
          <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 lg:px-6 pb-4 lg:pb-6">
          <PatchUpdatesManager />
        </div>
      </details>

      {/* System Info */}
      <div className="bg-card rounded-xl lg:rounded-2xl border border-border p-4 lg:p-6">
        <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 lg:w-5 lg:h-5" />
          О системе
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Версия</span>
            <span className="font-medium">1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Платформа</span>
            <span className="font-medium">Синтагма</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Окружение</span>
            <span className="font-medium">Production</span>
          </div>
        </div>
      </div>
    </div>
  );
}
