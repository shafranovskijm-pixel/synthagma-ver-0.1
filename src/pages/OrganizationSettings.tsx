import { useState, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Settings, LayoutGrid, Save, RefreshCw, RotateCcw, Users, FileText, ClipboardList, FileSpreadsheet, BarChart3, Link, HardHat, ShoppingBag, Building2, CreditCard, GraduationCap, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { RobokassaSettings } from "@/components/organization/RobokassaSettings";
import { SettingsStudentDashboardTab } from "@/components/organization/SettingsStudentDashboardTab";
import { StaffManager } from "@/components/organization/StaffManager";
import { JournalsManager } from "@/components/organization/JournalsManager";
import { FRDOManager } from "@/components/organization/FRDOManager";
import { OrgDashboardProvider } from "@/contexts/OrgDashboardContext";

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
  const [activeModuleTab, setActiveModuleTab] = useState("staff");

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: prof } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      let orgId = prof?.organization_id || (await supabase.rpc("current_organization_id")).data as string | null;
      if (!orgId) {
        const { data: firstOrg } = await supabase.from("organizations").select("id").limit(1).maybeSingle();
        orgId = firstOrg?.id || null;
      }
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

  const menuItems = [
    { icon: BarChart3, bg: "bg-accent/15", color: "text-accent", label: "Статистика", desc: "Аналитика и отчёты", key: "showStats" as keyof MenuSettings },
    { icon: Link, bg: "bg-primary/15", color: "text-primary", label: "Ссылки регистрации", desc: "Самостоятельная регистрация", key: "showLinks" as keyof MenuSettings },
    { icon: HardHat, bg: "bg-accent/15", color: "text-accent", label: "Охрана труда", desc: "Модуль охраны труда", key: "showLaborSafety" as keyof MenuSettings },
    { icon: FileText, bg: "bg-destructive/15", color: "text-destructive", label: "Документы", desc: "Документооборот", key: "showDocuments" as keyof MenuSettings },
    { icon: Building2, bg: "bg-primary/15", color: "text-primary", label: "Компании", desc: "Управление корпоративными клиентами", key: "showCompanies" as keyof MenuSettings },
    { icon: ShoppingBag, bg: "bg-primary/15", color: "text-primary", label: "Маркетплейс", desc: "Магазин курсов", key: "showServices" as keyof MenuSettings },
  ];

  const moduleSubTabs = [
    { id: "staff", icon: Users, label: "Сотрудники" },
    
    { id: "journals", icon: ClipboardList, label: "Журналы" },
    { id: "frdo", icon: FileSpreadsheet, label: "ФИС ФРДО" },
  ];

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

      <div className="max-w-5xl mx-auto px-4 py-6">
        <Tabs defaultValue="menu">
          <TabsList className="mb-6 bg-muted/50 p-1 rounded-xl flex-wrap">
            <TabsTrigger value="menu" className="rounded-lg gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2">
              <LayoutGrid className="w-4 h-4" /> Разделы меню
            </TabsTrigger>
            <TabsTrigger value="robokassa" className="rounded-lg gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2">
              <Wallet className="w-4 h-4" /> Касса
            </TabsTrigger>
            <TabsTrigger value="student" className="rounded-lg gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2">
              <GraduationCap className="w-4 h-4" /> Настройки ЛК
            </TabsTrigger>
            <TabsTrigger value="documents" className="rounded-lg gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2">
              <FileText className="w-4 h-4" /> Документы
            </TabsTrigger>
            <TabsTrigger value="modules" className="rounded-lg gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2">
              <Settings className="w-4 h-4" /> Управление
            </TabsTrigger>
          </TabsList>

          {/* Tab: Menu Items */}
          <TabsContent value="menu">
            <div className="max-w-2xl">
              <div className="bg-card rounded-xl lg:rounded-2xl border border-border p-4 lg:p-6">
                <p className="text-xs lg:text-sm text-muted-foreground mb-4 lg:mb-5">Включите или отключите разделы в боковом меню</p>
                <div className="space-y-2">
                  {menuItems.map((item) => {
                    const Icon = item.icon;
                    const isOn = menuSettings[item.key];
                    return (
                      <div
                        key={item.key}
                        className="flex items-center justify-between p-3 lg:p-4 rounded-xl border border-border/60 hover:border-primary/30 hover:bg-accent/5 transition-all group/row"
                      >
                        <div className="flex items-center gap-3 lg:gap-4">
                          <div className={`w-11 h-11 lg:w-12 lg:h-12 rounded-xl ${item.bg} flex items-center justify-center shadow-sm transition-transform group-hover/row:scale-105`}>
                            <Icon className={`w-5 h-5 lg:w-[22px] lg:h-[22px] ${item.color}`} />
                          </div>
                          <div>
                            <p className="font-medium text-sm lg:text-base">{item.label}</p>
                            <p className="text-xs lg:text-sm text-muted-foreground">{item.desc}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setMenuSettings(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0 ${isOn ? 'bg-primary shadow-md' : 'bg-muted'}`}
                        >
                          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${isOn ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-5 lg:mt-6 pt-4 border-t border-border flex flex-wrap gap-2">
                  <Button className="btn-gradient rounded-xl gap-2 text-sm" onClick={handleSaveMenuSettings}>
                    <Save className="w-4 h-4" /> Сохранить
                  </Button>
                  <Button variant="outline" className="rounded-xl gap-2 text-sm" onClick={reloadMenuSettings}>
                    <RefreshCw className="w-4 h-4" /> Обновить меню
                  </Button>
                  <Button variant="ghost" className="rounded-xl gap-2 text-sm" onClick={resetMenuSettings}>
                    <RotateCcw className="w-4 h-4" /> По умолчанию
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Tab: Payment */}
          <TabsContent value="robokassa">
            <div className="max-w-2xl">
              {organizationId && <RobokassaSettings organizationId={organizationId} />}
            </div>
          </TabsContent>

          {/* Tab: Student Dashboard Settings */}
          <TabsContent value="student">
            <div className="max-w-2xl">
              {organizationId && <SettingsStudentDashboardTab organizationId={organizationId} />}
            </div>
          </TabsContent>

          {/* Tab: Documents */}
          <TabsContent value="documents">
            <div>
              {organizationId && (
                <OrgDashboardProvider>
                  <DocumentsModuleWrapper organizationId={organizationId} />
                </OrgDashboardProvider>
              )}
            </div>
          </TabsContent>

          {/* Tab: Module Management — embedded components */}
          <TabsContent value="modules">
            <div className="space-y-4">
              {/* Sub-tab navigation */}
              <div className="flex flex-wrap gap-2">
                {moduleSubTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeModuleTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveModuleTab(tab.id)}
                      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-md border-primary'
                          : 'bg-card hover:bg-accent/10 border-border hover:border-primary/30 text-foreground'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Sub-tab content */}
              <div className="bg-card rounded-xl lg:rounded-2xl border border-border p-4 lg:p-6">
                {organizationId && activeModuleTab === "staff" && (
                  <OrgDashboardProvider>
                    <StaffManager organizationId={organizationId} />
                  </OrgDashboardProvider>
                )}
                {organizationId && activeModuleTab === "journals" && (
                  <JournalsManager organizationId={organizationId} />
                )}
                {organizationId && activeModuleTab === "frdo" && (
                  <FRDOManager organizationId={organizationId} />
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

const LazyDocumentsTab = lazy(() => import("@/components/organization/tabs/DocumentsTab").then(m => ({ default: m.DocumentsTab })));

function DocumentsModuleWrapper({ organizationId }: { organizationId: string }) {
  return (
    <Suspense fallback={<div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>}>
      <LazyDocumentsTab organizationId={organizationId} organizationName="" isOrdersEnabled={true} />
    </Suspense>
  );
}
