import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Settings, LayoutGrid, Save, RefreshCw, RotateCcw, ChevronRight, Users, FileText, ClipboardList, FileSpreadsheet, BarChart3, Link, HardHat, ShoppingBag, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RobokassaSettings } from "@/components/organization/RobokassaSettings";

interface MenuSettings {
  showStats: boolean;
  showLinks: boolean;
  showLaborSafety: boolean;
  showDocuments: boolean;
  showServices: boolean;
  showCompanies: boolean;
  [key: string]: boolean;
}

const DEFAULT_MENU: MenuSettings = {
  showStats: true,
  showLinks: true,
  showLaborSafety: true,
  showDocuments: true,
  showServices: true,
  showCompanies: true,
};

export default function OrganizationSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [menuSettings, setMenuSettings] = useState<MenuSettings>(DEFAULT_MENU);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: prof } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      const orgId = prof?.organization_id || (await supabase.rpc("current_organization_id")).data as string | null;
      if (orgId) {
        setOrganizationId(orgId);
        const { data: org } = await supabase.from("organizations").select("menu_settings").eq("id", orgId).single();
        if (org?.menu_settings) {
          const m = org.menu_settings as any;
          setMenuSettings({
            showStats: m.showStats ?? true,
            showLinks: m.showLinks ?? true,
            showLaborSafety: m.showLaborSafety ?? true,
            showDocuments: m.showDocuments ?? true,
            showServices: m.showServices ?? true,
            showCompanies: m.showCompanies ?? true,
          });
        }
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const handleSaveMenuSettings = async () => {
    if (!organizationId) return;
    const { error } = await supabase.from('organizations').update({ menu_settings: menuSettings as any }).eq('id', organizationId);
    if (error) { toast.error('Ошибка сохранения'); return; }
    toast.success('Настройки меню сохранены');
  };

  const resetMenuSettings = async () => {
    if (!organizationId) return;
    setMenuSettings(DEFAULT_MENU);
    await supabase.from('organizations').update({ menu_settings: DEFAULT_MENU as any }).eq('id', organizationId);
    toast.success('Меню восстановлено по умолчанию');
  };

  const reloadMenuSettings = async () => {
    if (!organizationId) return;
    const { data } = await supabase.from("organizations").select("menu_settings").eq("id", organizationId).single();
    if (data?.menu_settings) {
      const m = data.menu_settings as any;
      setMenuSettings({
        showStats: m.showStats ?? true, showLinks: m.showLinks ?? true, showLaborSafety: m.showLaborSafety ?? true,
        showDocuments: m.showDocuments ?? true, showServices: m.showServices ?? true, showCompanies: m.showCompanies ?? true,
      });
    }
    toast.success('Меню обновлено');
  };

  const ToggleRow = ({ icon: Icon, iconClass, label, desc, settingsKey }: { icon: any; iconClass: string; label: string; desc: string; settingsKey: keyof MenuSettings }) => (
    <div className="flex items-center justify-between py-2 lg:py-3 border-b border-border last:border-b-0">
      <div className="flex items-center gap-2 lg:gap-3">
        <div className={`w-8 h-8 lg:w-10 lg:h-10 rounded-lg lg:rounded-xl ${iconClass} flex items-center justify-center`}>
          <Icon className="w-4 h-4 lg:w-5 lg:h-5" />
        </div>
        <div>
          <p className="font-medium text-sm lg:text-base">{label}</p>
          <p className="text-xs lg:text-sm text-muted-foreground hidden sm:block">{desc}</p>
        </div>
      </div>
      <button
        onClick={() => setMenuSettings(prev => ({ ...prev, [settingsKey]: !prev[settingsKey] }))}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${menuSettings[settingsKey] ? 'bg-primary' : 'bg-muted'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${menuSettings[settingsKey] ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 h-14 bg-card border-b border-border flex items-center px-4 lg:px-6 gap-3">
        <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" />
          <h1 className="font-display font-semibold text-lg">Настройки</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4 lg:space-y-6">
        {/* Menu Items Settings */}
        <details className="bg-card rounded-xl lg:rounded-2xl border border-border group" open>
          <summary className="p-4 lg:p-6 cursor-pointer list-none flex items-center justify-between">
            <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 lg:w-5 lg:h-5" />
              Разделы меню
            </h3>
            <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
          </summary>
          <div className="px-4 lg:px-6 pb-4 lg:pb-6">
            <p className="text-xs lg:text-sm text-muted-foreground mb-3 lg:mb-4">Включите или отключите разделы в боковом меню</p>
            <div className="space-y-0">
              <ToggleRow icon={BarChart3} iconClass="bg-accent/10 text-accent" label="Статистика" desc="Аналитика и отчёты" settingsKey="showStats" />
              <ToggleRow icon={Link} iconClass="bg-primary/10 text-primary" label="Ссылки регистрации" desc="Самостоятельная регистрация" settingsKey="showLinks" />
              <ToggleRow icon={HardHat} iconClass="bg-accent/10 text-accent" label="Охрана труда" desc="Модуль охраны труда" settingsKey="showLaborSafety" />
              <ToggleRow icon={FileText} iconClass="bg-destructive/10 text-destructive" label="Документы" desc="Документооборот" settingsKey="showDocuments" />
              <ToggleRow icon={Building2} iconClass="bg-primary/10 text-primary" label="Компании" desc="Управление корпоративными клиентами" settingsKey="showCompanies" />
              <ToggleRow icon={ShoppingBag} iconClass="bg-primary/10 text-primary" label="Маркетплейс" desc="Магазин курсов" settingsKey="showServices" />
            </div>
            <div className="mt-4 lg:mt-6 pt-3 lg:pt-4 border-t border-border flex flex-wrap gap-2">
              <Button className="btn-gradient rounded-xl gap-2 text-sm" onClick={handleSaveMenuSettings}>
                <Save className="w-4 h-4" />
                Сохранить
              </Button>
              <Button variant="outline" className="rounded-xl gap-2 text-sm" onClick={reloadMenuSettings}>
                <RefreshCw className="w-4 h-4" />
                Обновить меню
              </Button>
              <Button variant="ghost" className="rounded-xl gap-2 text-sm" onClick={resetMenuSettings}>
                <RotateCcw className="w-4 h-4" />
                По умолчанию
              </Button>
            </div>
          </div>
        </details>

        {/* Robokassa Payment Settings */}
        {organizationId && <RobokassaSettings organizationId={organizationId} />}

        {/* Quick Navigation to Sections */}
        <details className="bg-card rounded-xl lg:rounded-2xl border border-border group">
          <summary className="p-4 lg:p-6 cursor-pointer list-none flex items-center justify-between">
            <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
              <Settings className="w-4 h-4 lg:w-5 lg:h-5" />
              Управление разделами
            </h3>
            <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
          </summary>
          <div className="px-4 lg:px-6 pb-4 lg:pb-6 space-y-3">
            <p className="text-xs lg:text-sm text-muted-foreground mb-2">Быстрый доступ к разделам управления организацией</p>
            {[
              { tab: "staff", icon: Users, iconBg: "bg-primary/10", iconColor: "text-primary", title: "Сотрудники", desc: "Управление ролями и доступом" },
              { tab: "documents", icon: FileText, iconBg: "bg-destructive/10", iconColor: "text-destructive", title: "Документооборот", desc: "Приказы, протоколы, сертификаты" },
              { tab: "journals", icon: ClipboardList, iconBg: "bg-accent/10", iconColor: "text-accent", title: "Журналы учёта", desc: "Журналы учёта слушателей" },
              { tab: "frdo", icon: FileSpreadsheet, iconBg: "bg-primary/10", iconColor: "text-primary", title: "ФИС ФРДО", desc: "Федеральный реестр документов" },
            ].map(({ tab, icon: Icon, iconBg, iconColor, title, desc }) => (
              <button
                key={tab}
                onClick={() => navigate("/organization", { state: { tab } })}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-accent/5 hover:border-primary/30 transition-all text-left group/nav"
              >
                <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-4 h-4 ${iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{title}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover/nav:text-primary transition-colors" />
              </button>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
