import { useState } from "react";
import { Users, FileText, GraduationCap, CheckCircle2, ChevronDown, ChevronUp, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { DocumentsStats } from "@/types";
import type { UserFacingErrorKind } from "@/utils/isTransientNetworkError";
import { summaryErrorMessage } from "./summaryStateMessages";

interface DocumentsStatsCardsProps {
  stats: DocumentsStats;
  /** Phase 4B.1.c.2.a — server-honest state. */
  hasData?: boolean;
  isLoading?: boolean;
  errorKind?: UserFacingErrorKind | null;
  onRetry?: () => void;
}

export function DocumentsStatsCards({ stats, hasData, isLoading, errorKind, onRetry }: DocumentsStatsCardsProps) {
  const [visible, setVisible] = useState(true);

  const showError = !!errorKind && !hasData;
  const showSkeleton = !showError && !!isLoading && !hasData;

  return (
    <div className="mb-6 lg:mb-8">
      <button
        onClick={() => setVisible(v => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
      >
        {visible ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {visible ? "Скрыть статистику" : "Показать статистику"}
      </button>
      {visible && showError && (
        <div className="bg-card border border-border rounded-xl lg:rounded-2xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
          <div className="flex-1 text-sm text-muted-foreground">{summaryErrorMessage(errorKind)}</div>
          {onRetry && (
            <Button size="sm" variant="outline" className="gap-2" onClick={onRetry}>
              <RefreshCw className="w-3.5 h-3.5" /> Повторить
            </Button>
          )}
        </div>
      )}
      {visible && !showError && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
          <Card>
            <IconBox tone="primary"><Users className="w-4 h-4 lg:w-5 lg:h-5 text-primary" /></IconBox>
            <ValueLabel
              value={showSkeleton ? null : String(stats.total)}
              label="Всего"
            />
          </Card>
          <Card>
            <IconBox tone={stats.withPassport === stats.total && stats.total > 0 ? "green" : "amber"}>
              <FileText className={`w-4 h-4 lg:w-5 lg:h-5 ${stats.withPassport === stats.total && stats.total > 0 ? 'text-green-500' : 'text-amber-500'}`} />
            </IconBox>
            <ValueLabel
              value={showSkeleton ? null : `${stats.withPassport}`}
              suffix={showSkeleton ? null : `/${stats.total}`}
              label="Паспорт"
            />
          </Card>
          <Card>
            <IconBox tone={stats.withSnils === stats.total && stats.total > 0 ? "green" : "amber"}>
              <FileText className={`w-4 h-4 lg:w-5 lg:h-5 ${stats.withSnils === stats.total && stats.total > 0 ? 'text-green-500' : 'text-amber-500'}`} />
            </IconBox>
            <ValueLabel
              value={showSkeleton ? null : `${stats.withSnils}`}
              suffix={showSkeleton ? null : `/${stats.total}`}
              label="СНИЛС"
            />
          </Card>
          <Card>
            <IconBox tone={stats.withEducation === stats.total && stats.total > 0 ? "green" : "amber"}>
              <GraduationCap className={`w-4 h-4 lg:w-5 lg:h-5 ${stats.withEducation === stats.total && stats.total > 0 ? 'text-green-500' : 'text-amber-500'}`} />
            </IconBox>
            <ValueLabel
              value={showSkeleton ? null : `${stats.withEducation}`}
              suffix={showSkeleton ? null : `/${stats.total}`}
              label="Образование"
            />
          </Card>
          <Card wide>
            <IconBox tone={stats.complete === stats.total && stats.total > 0 ? "green" : "primary"}>
              <CheckCircle2 className={`w-4 h-4 lg:w-5 lg:h-5 ${stats.complete === stats.total && stats.total > 0 ? 'text-green-500' : 'text-primary'}`} />
            </IconBox>
            <ValueLabel
              value={showSkeleton ? null : `${stats.complete}`}
              suffix={showSkeleton ? null : `/${stats.total}`}
              label="Все документы"
            />
          </Card>
        </div>
      )}
    </div>
  );
}

function Card({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`${wide ? 'col-span-2 lg:col-span-1 ' : ''}bg-card rounded-xl lg:rounded-2xl p-3 lg:p-4 border border-border`}>
      <div className="flex items-center gap-2 lg:gap-3">{children}</div>
    </div>
  );
}

function IconBox({ tone, children }: { tone: "primary" | "green" | "amber"; children: React.ReactNode }) {
  const bg = tone === "green" ? "bg-green-500/10" : tone === "amber" ? "bg-amber-500/10" : "bg-primary/10";
  return <div className={`w-8 h-8 lg:w-10 lg:h-10 rounded-lg ${bg} flex items-center justify-center`}>{children}</div>;
}

function ValueLabel({ value, suffix, label }: { value: string | null; suffix?: string | null; label: string }) {
  return (
    <div>
      {value === null ? (
        <Skeleton className="h-6 w-14" />
      ) : (
        <div className="text-lg lg:text-2xl font-bold">
          {value}
          {suffix && <span className="text-xs lg:text-sm text-muted-foreground font-normal">{suffix}</span>}
        </div>
      )}
      <div className="text-[10px] lg:text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
