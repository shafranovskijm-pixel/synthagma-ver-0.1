import { useState } from "react";
import { ArrowRight, ShieldCheck, AlertTriangle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useFrdoReadiness } from "@/hooks/useFrdoReadiness";
import { supabase } from "@/integrations/supabase/client";
import { detectGenderFromMiddleName } from "@/constants/frdo";
import { toast } from "sonner";

interface FrdoReadinessBannerProps {
  organizationId: string;
  onOpenFrdo?: () => void;
}

/**
 * Banner shown above the education documents journal that aggregates
 * FRDO export readiness across all issued documents and offers a CTA
 * to jump into the FRDO module to fill in the missing fields.
 */
export function FrdoReadinessBanner({ organizationId, onOpenFrdo }: FrdoReadinessBannerProps) {
  const { stats, loading, readinessPercent, refresh } = useFrdoReadiness(organizationId);
  const [isAutoFilling, setIsAutoFilling] = useState(false);

  const handleAutoFillGender = async () => {
    setIsAutoFilling(true);
    try {
      const { data, error } = await supabase
        .from("student_frdo_data")
        .select("id, middle_name, gender")
        .eq("organization_id", organizationId)
        .or("gender.is.null,gender.eq.");
      if (error) throw error;

      const updates = (data || [])
        .map((r) => ({ id: r.id, detected: detectGenderFromMiddleName(r.middle_name) }))
        .filter((r) => r.detected);

      if (updates.length === 0) {
        toast.info("Нет записей, где пол можно определить по отчеству");
        return;
      }

      await Promise.all(
        updates.map((u) =>
          supabase.from("student_frdo_data").update({ gender: u.detected! }).eq("id", u.id),
        ),
      );
      toast.success(`Пол заполнен у ${updates.length} студентов`);
      await refresh();
    } catch (err) {
      console.error("[FrdoReadinessBanner] auto-fill failed", err);
      toast.error("Не удалось автоматически заполнить пол");
    } finally {
      setIsAutoFilling(false);
    }
  };

  if (loading || stats.total_documents === 0) return null;

  const isReady = stats.missing_frdo_data === 0 && stats.missing_profession_name === 0;

  return (
    <div
      className={
        "rounded-2xl border p-4 lg:p-5 " +
        (isReady
          ? "bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20"
          : "bg-gradient-to-r from-accent/40 to-accent/20 border-accent")
      }
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 " +
              (isReady ? "bg-primary/15" : "bg-accent")
            }
          >
            {isReady ? (
              <ShieldCheck className="w-5 h-5 text-primary" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-accent-foreground" />
            )}
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-sm">
              {isReady
                ? "Все документы готовы к выгрузке в ФИС ФРДО"
                : `Готовность к выгрузке ФРДО: ${readinessPercent}%`}
            </p>
            <p className="text-xs text-muted-foreground">
              {stats.ready_for_export} из {stats.total_documents} записей содержат полный набор данных
              {!isReady && stats.missing_frdo_data > 0 && (
                <>
                  {" · "}не хватает данных у{" "}
                  <span className="font-medium">{stats.missing_frdo_data}</span>
                </>
              )}
            </p>
            {!isReady && (
              <div className="flex flex-wrap gap-2 pt-2 text-[11px]">
                {stats.missing_birth_date > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-background/60 border border-border">
                    Без даты рождения: {stats.missing_birth_date}
                  </span>
                )}
                {stats.missing_snils > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-background/60 border border-border">
                    Без СНИЛС: {stats.missing_snils}
                  </span>
                )}
                {stats.missing_passport > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-background/60 border border-border">
                    Без паспорта: {stats.missing_passport}
                  </span>
                )}
                {stats.missing_gender_resolvable > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-primary">
                    Пол можно авто-определить: {stats.missing_gender_resolvable}
                  </span>
                )}
                {stats.missing_gender_unresolvable > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-background/60 border border-border">
                    Без пола (вручную): {stats.missing_gender_unresolvable}
                  </span>
                )}
                {stats.missing_profession_name > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-background/60 border border-border">
                    Без профессии: {stats.missing_profession_name}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-stretch lg:items-end gap-2 w-full lg:w-auto lg:min-w-[260px]">
          <Progress value={readinessPercent} className="h-2" />
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {stats.missing_gender_resolvable > 0 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleAutoFillGender}
                disabled={isAutoFilling}
                className="rounded-xl"
              >
                <Sparkles className="w-4 h-4 mr-1.5" />
                Авто-заполнить пол
              </Button>
            )}
            {onOpenFrdo && (
              <Button
                size="sm"
                variant={isReady ? "outline" : "default"}
                onClick={onOpenFrdo}
                className="rounded-xl"
              >
                Перейти в ФРДО
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
