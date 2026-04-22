import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, Check, ArrowRight } from "lucide-react";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";

interface FeatureLockedLandingProps {
  /** Tumbler key inside organizations.menu_settings, e.g. "showStats" */
  settingKey: string;
  title: string;
  description: string;
  benefits: string[];
  icon?: React.ComponentType<{ className?: string }>;
}

export function FeatureLockedLanding({
  settingKey,
  title,
  description,
  benefits,
  icon: Icon = Sparkles,
}: FeatureLockedLandingProps) {
  const d = useOrgDashboard();
  const [enabling, setEnabling] = useState(false);

  const handleEnable = async () => {
    if (!d.organizationId) return;
    setEnabling(true);
    try {
      const { data: org } = await supabase
        .from("organizations")
        .select("menu_settings")
        .eq("id", d.organizationId)
        .maybeSingle();
      const current = (org?.menu_settings as Record<string, unknown>) || {};
      const next = { ...current, [settingKey]: true };
      const { error } = await supabase
        .from("organizations")
        .update({ menu_settings: next as never })
        .eq("id", d.organizationId);
      if (error) throw error;
      toast.success(`Раздел «${title}» включён`);
      // Simple refresh — context will reload menu_settings on next render cycle
      window.location.reload();
    } catch (err) {
      console.error(err);
      toast.error("Не удалось включить раздел");
    } finally {
      setEnabling(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8 lg:py-12">
      <Card className="p-8 lg:p-12 text-center bg-gradient-to-br from-primary/5 via-card to-card border-primary/20">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/15 text-primary mb-6">
          <Icon className="w-8 h-8" />
        </div>
        <h2 className="text-2xl lg:text-3xl font-display font-bold mb-3">{title}</h2>
        <p className="text-muted-foreground mb-8 max-w-xl mx-auto">{description}</p>

        {benefits.length > 0 && (
          <ul className="text-left max-w-md mx-auto mb-8 space-y-2.5">
            {benefits.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 text-primary shrink-0">
                  <Check className="w-3 h-3" />
                </span>
                <span className="text-foreground/85">{b}</span>
              </li>
            ))}
          </ul>
        )}

        <Button
          size="lg"
          onClick={handleEnable}
          disabled={enabling}
          className="rounded-xl gap-2"
        >
          {enabling ? "Включаем…" : "Включить раздел"}
          {!enabling && <ArrowRight className="w-4 h-4" />}
        </Button>

        <p className="text-xs text-muted-foreground mt-4">
          Функция доступна на вашем тарифе. Включить можно в любой момент.
        </p>
      </Card>
    </div>
  );
}
