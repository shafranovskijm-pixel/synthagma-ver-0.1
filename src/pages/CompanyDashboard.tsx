import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import {
  Building2, GraduationCap, UserPlus, LogOut,
  LayoutDashboard, Users, ClipboardList, FileText, Bell, Send,
  Eye, X, UsersRound,
} from "lucide-react";
import { useCompanyDashboard } from "@/hooks/useCompanyDashboard";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog";
import { companyOnboardingSteps } from "@/constants/onboardingSteps";
import { CompanyStatsCards } from "@/components/company/CompanyStatsCards";
import { CompanyEmployeesTab } from "@/components/company/CompanyEmployeesTab";
import { TrainingPlansTab } from "@/components/company/TrainingPlansTab";
import { CompanyDocumentsTab } from "@/components/company/CompanyDocumentsTab";
import { CompanyRemindersTab } from "@/components/company/CompanyRemindersTab";
import { CompanyRequestsTab } from "@/components/company/CompanyRequestsTab";
import { CompanyStaffManager } from "@/components/company/CompanyStaffManager";

type TabId = "home" | "employees" | "planning" | "requests" | "documents" | "reminders" | "team";

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "home", label: "Главная", icon: LayoutDashboard },
  { id: "employees", label: "Сотрудники", icon: Users },
  { id: "planning", label: "Планирование", icon: ClipboardList },
  { id: "requests", label: "Заявки", icon: Send },
  { id: "documents", label: "Документы", icon: FileText },
  { id: "reminders", label: "Напоминания", icon: Bell },
  { id: "team", label: "Команда", icon: UsersRound },
];

const CompanyDashboard = () => {
  const navigate = useNavigate();
  const viewAsData = useMemo(() => {
    try {
      const raw = localStorage.getItem('orgViewAsCompany');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, []);
  const isOrgView = !!viewAsData;

  const { company, employees, stats, loading, addingEmployee, addEmployee, refresh } =
    useCompanyDashboard(viewAsData?.userId || undefined);
  const { signOut, user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [showOnboarding, setShowOnboarding] = useState(false);

  const exitOrgView = () => {
    localStorage.removeItem('orgViewAsCompany');
    navigate('/organization');
  };

  useEffect(() => {
    if (!user) return;
    const checkOnboarding = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data && !data.onboarding_completed) {
        setShowOnboarding(true);
      }
    };
    checkOnboarding();
  }, [user]);

  const handleCloseOnboarding = async () => {
    setShowOnboarding(false);
    if (user) {
      await supabase
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("user_id", user.id);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <p className="text-muted-foreground">Загрузка кабинета...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Org View Banner */}
      {isOrgView && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-primary text-primary-foreground py-2 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            <span className="text-sm font-medium">Режим просмотра: {viewAsData?.companyName}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={exitOrgView} className="gap-1">
            <X className="w-3 h-3" />
            Выйти
          </Button>
        </div>
      )}
      {/* Sidebar */}
      <aside className={`w-60 border-r border-border bg-card/80 backdrop-blur-sm flex flex-col sticky top-0 h-screen ${isOrgView ? 'mt-10' : ''}`}>
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <SigmaLogo size="sm" />
            <div className="min-w-0">
              <h1 className="font-display text-sm font-bold truncate">{company?.name}</h1>
              <p className="text-xs text-muted-foreground">Кабинет компании</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              data-onboarding={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <tab.icon className="w-4 h-4 shrink-0" />
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full gap-2 justify-start">
            <LogOut className="w-4 h-4" />
            Выйти
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className={`flex-1 max-w-6xl mx-auto px-6 py-8 space-y-8 ${isOrgView ? 'mt-10' : ''}`}>
        {/* Welcome for empty state */}
        {activeTab === "home" && employees.length === 0 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold mb-1">Добро пожаловать!</h2>
                  <p className="text-muted-foreground text-sm mb-3">
                    Здесь вы можете управлять обучением своих сотрудников. Начните с добавления сотрудников.
                  </p>
                  <Button onClick={() => setActiveTab("employees")} className="gap-2">
                    <UserPlus className="w-4 h-4" />
                    Добавить сотрудника
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "home" && <CompanyStatsCards stats={stats} />}

        {activeTab === "employees" && company && (
          <CompanyEmployeesTab
            employees={employees}
            addingEmployee={addingEmployee}
            addEmployee={addEmployee}
            companyId={company.id}
            organizationId={company.organization_id}
            onRefresh={refresh}
          />
        )}

        {activeTab === "planning" && company && (
          <TrainingPlansTab
            companyId={company.id}
            organizationId={company.organization_id}
            employees={employees.map((e) => ({ user_id: e.user_id, full_name: e.full_name }))}
          />
        )}

        {activeTab === "requests" && company && (
          <CompanyRequestsTab
            companyId={company.id}
            organizationId={company.organization_id}
            employees={employees.map((e) => ({ user_id: e.user_id, full_name: e.full_name }))}
          />
        )}

        {activeTab === "documents" && company && (
          <CompanyDocumentsTab companyId={company.id} />
        )}

        {activeTab === "reminders" && company && (
          <CompanyRemindersTab
            companyId={company.id}
            employees={employees.map((e) => ({ user_id: e.user_id, full_name: e.full_name }))}
          />
        )}

        {activeTab === "team" && company && (
          <CompanyStaffManager
            companyId={company.id}
            companyName={company.name}
            ownerUserId={company.user_id}
          />
        )}
      </main>
      <OnboardingDialog
        open={showOnboarding}
        onClose={handleCloseOnboarding}
        steps={companyOnboardingSteps}
        onNavigateToTab={(tab) => { setActiveTab(tab as TabId); setShowOnboarding(false); handleCloseOnboarding(); }}
      />
    </div>
  );
};

export default CompanyDashboard;
