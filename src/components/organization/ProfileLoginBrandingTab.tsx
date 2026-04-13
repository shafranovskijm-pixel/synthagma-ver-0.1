import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { SUBSCRIPTION_PLANS } from "@/constants/subscriptionPlans";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Lock, ArrowUpRight, LogIn } from "lucide-react";
import { LoginBrandingSettings } from "@/components/organization/LoginBrandingSettings";

interface Props {
  organizationId: string;
  userId: string;
}

export function ProfileLoginBrandingTab({ organizationId, userId }: Props) {
  const navigate = useNavigate();
  const { plan } = useSubscriptionLimits(organizationId);
  const hasBranding = SUBSCRIPTION_PLANS[plan]?.limits?.branding ?? false;
  const [organizationName, setOrganizationName] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", organizationId)
        .single();
      if (org) setOrganizationName(org.name || "");
    };
    load();
  }, [organizationId]);

  return (
    <div className="max-w-2xl">
      <div className="bg-card rounded-2xl border border-border p-6 relative">
        {!hasBranding && (
          <div className="absolute inset-0 z-10 bg-background/60 backdrop-blur-[2px] rounded-2xl flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-center px-4 max-w-sm">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <Lock className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">Доступно от тарифа «Стандарт»</p>
              <ul className="text-left space-y-1 mt-1">
                <li className="flex items-start gap-2 text-xs text-muted-foreground"><span className="text-primary mt-0.5">✓</span>Уникальная ссылка для входа учеников</li>
                <li className="flex items-start gap-2 text-xs text-muted-foreground"><span className="text-primary mt-0.5">✓</span>Логотип и цвета на странице авторизации</li>
              </ul>
              <Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-xs mt-1" onClick={() => navigate('/organization?tab=subscription')}>
                <ArrowUpRight className="w-3.5 h-3.5" /> Сменить тариф
              </Button>
            </div>
          </div>
        )}
        <h3 className="font-display font-semibold text-lg flex items-center gap-2 mb-1">
          <LogIn className="w-5 h-5" /> Брендирование страницы входа
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Создайте индивидуальную страницу входа с вашим брендом и уникальной ссылкой
        </p>
        <LoginBrandingSettings
          organizationId={organizationId}
          organizationName={organizationName}
          userId={userId}
        />
      </div>
    </div>
  );
}
