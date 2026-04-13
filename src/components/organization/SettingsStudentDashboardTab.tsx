import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { SUBSCRIPTION_PLANS } from "@/constants/subscriptionPlans";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Save, Settings, Loader2, ExternalLink, Lock, ArrowUpRight,
  Trophy, MessageCircle, LayoutGrid,
} from "lucide-react";

interface StudentDashboardSettings {
  showAchievements: boolean;
  showAiChat: boolean;
  catalogMode: "catalog" | "assigned";
  [key: string]: boolean | string;
}

const DEFAULT_STUDENT: StudentDashboardSettings = {
  showAchievements: false,
  showAiChat: false,
  catalogMode: "catalog",
};

interface Props {
  organizationId: string;
}

export function SettingsStudentDashboardTab({ organizationId }: Props) {
  const navigate = useNavigate();
  const { plan } = useSubscriptionLimits(organizationId);
  const hasBranding = SUBSCRIPTION_PLANS[plan]?.limits?.branding ?? false;
  const [settings, setSettings] = useState<StudentDashboardSettings>(DEFAULT_STUDENT);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: org } = await supabase
        .from("organizations")
        .select("student_dashboard_settings")
        .eq("id", organizationId)
        .single();
      if (org?.student_dashboard_settings) {
        const s = org.student_dashboard_settings as any;
        setSettings({
          showAchievements: s.showAchievements ?? false,
          showAiChat: s.showAiChat ?? false,
          catalogMode: s.catalogMode || "catalog",
        });
      }
    };
    load();
  }, [organizationId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ student_dashboard_settings: JSON.parse(JSON.stringify(settings)) })
        .eq('id', organizationId);
      if (error) throw error;
      toast.success('Настройки сохранены');
    } catch {
      toast.error('Ошибка сохранения настроек');
    } finally {
      setIsSaving(false);
    }
  };

  const LockedOverlay = () => (
    <div className="absolute inset-0 z-10 bg-background/60 backdrop-blur-[2px] rounded-xl lg:rounded-2xl flex items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-center px-4 max-w-sm">
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
          <Lock className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">Доступно от тарифа «Стандарт»</p>
        <Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-xs mt-1" onClick={() => navigate('/organization?tab=subscription')}>
          <ArrowUpRight className="w-3.5 h-3.5" /> Сменить тариф
        </Button>
      </div>
    </div>
  );

  return (
    <div className="bg-card rounded-xl lg:rounded-2xl border border-border p-4 lg:p-6 relative">
      {!hasBranding && <LockedOverlay />}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
            <Settings className="w-4 h-4 lg:w-5 lg:h-5" />
            Настройки личного кабинета ученика
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Настройте, какие разделы будут отображаться в личном кабинете учеников
          </p>
        </div>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={() => window.open("/student", "_blank")}>
                <ExternalLink className="w-4 h-4" /> Просмотр
              </Button>
            </TooltipTrigger>
            <TooltipContent>Предпросмотр личного кабинета ученика</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="space-y-4">
        <div className="flex items-center justify-between py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="font-medium">Достижения</p>
              <p className="text-sm text-muted-foreground">Раздел с наградами и достижениями</p>
            </div>
          </div>
          <button
            onClick={() => setSettings(prev => ({ ...prev, showAchievements: !prev.showAchievements }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.showAchievements ? 'bg-primary' : 'bg-muted'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.showAchievements ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">ИИ-помощник</p>
              <p className="text-sm text-muted-foreground">Чат с ИИ для помощи в обучении</p>
            </div>
          </div>
          <button
            onClick={() => setSettings(prev => ({ ...prev, showAiChat: !prev.showAiChat }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.showAiChat ? 'bg-primary' : 'bg-muted'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.showAiChat ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        <div className="flex items-center justify-between py-3 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <LayoutGrid className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">Начальный экран ученика</p>
              <p className="text-sm text-muted-foreground">Что показывать первым при входе</p>
            </div>
          </div>
          <div className="flex gap-1 bg-muted rounded-lg p-0.5">
            <button
              onClick={() => setSettings(prev => ({ ...prev, catalogMode: "catalog" }))}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${settings.catalogMode === "catalog" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Каталог
            </button>
            <button
              onClick={() => setSettings(prev => ({ ...prev, catalogMode: "assigned" }))}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${settings.catalogMode === "assigned" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Назначенные
            </button>
          </div>
        </div>
      </div>
      <div className="mt-6 pt-4 border-t border-border">
        <Button className="btn-gradient rounded-xl gap-2" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Сохранение...</> : <><Save className="w-4 h-4" /> Сохранить настройки</>}
        </Button>
      </div>
    </div>
  );
}
