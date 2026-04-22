import { ArrowRight, ShieldCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useFrdoReadiness } from "@/hooks/useFrdoReadiness";

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
  const { stats, loading, readinessPercent } = useFrdoReadiness(organizationId);

  if (loading || stats.total_documents === 0) return null;

  const isReady = stats.missing_frdo_data === 0;

  return (
    <div
      className={
        "rounded-2xl border p-4 lg:p-5 " +
        (isReady
          ? "bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 border-emerald-500/20"
          : "bg-gradient-to-r from-amber-500/10 to-amber-500/5 border-amber-500/20")
      }
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 " +
              (isReady ? "bg-emerald-500/15" : "bg-amber-500/15")
            }
          >
            {isReady ? (
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-600" />
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
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-stretch lg:items-end gap-2 w-full lg:w-auto lg:min-w-[260px]">
          <Progress value={readinessPercent} className="h-2" />
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
  );
}
