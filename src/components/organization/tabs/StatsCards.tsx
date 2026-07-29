import { Users, BookOpen, CheckCircle2, TrendingUp, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { OrganizationStats } from "@/types";
import type { UserFacingErrorKind } from "@/utils/isTransientNetworkError";
import { summaryErrorMessage } from "./summaryStateMessages";

interface StatsCardsProps {
  stats: OrganizationStats;
  /** Phase 4B.1.c.2.a — server-honest state. */
  hasData?: boolean;
  isLoading?: boolean;
  errorKind?: UserFacingErrorKind | null;
  onRetry?: () => void;
}

function StatCardShell({
  icon,
  iconBg,
  iconColor,
  label,
  children,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-xl lg:rounded-2xl p-4 lg:p-6 border border-border">
      <div className="flex items-center gap-3 lg:gap-4">
        <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-lg lg:rounded-xl ${iconBg} flex items-center justify-center`}>
          <span className={iconColor}>{icon}</span>
        </div>
        <div className="min-w-0">
          {children}
          <div className="text-muted-foreground text-xs lg:text-sm">{label}</div>
        </div>
      </div>
    </div>
  );
}

export function StatsCards({ stats, hasData, isLoading, errorKind, onRetry }: StatsCardsProps) {
  // Show error banner only when there is truly nothing to display.
  if (errorKind && !hasData) {
    return (
      <div className="mb-6 lg:mb-8 bg-card border border-border rounded-xl lg:rounded-2xl p-4 lg:p-5 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
        <div className="flex-1 text-sm text-muted-foreground">{summaryErrorMessage(errorKind)}</div>
        {onRetry && (
          <Button size="sm" variant="outline" className="gap-2" onClick={onRetry}>
            <RefreshCw className="w-3.5 h-3.5" /> Повторить
          </Button>
        )}
      </div>
    );
  }

  // First-load skeleton (no cached data yet).
  const showSkeleton = !!isLoading && !hasData;

  const renderValue = (value: number) =>
    showSkeleton ? <Skeleton className="h-7 w-16" /> : <div className="text-xl lg:text-2xl font-bold font-display">{value}</div>;
  const renderPercent = (value: number) =>
    showSkeleton ? <Skeleton className="h-7 w-16" /> : <div className="text-xl lg:text-2xl font-bold font-display">{value}%</div>;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6 mb-6 lg:mb-8">
      <StatCardShell icon={<Users className="w-5 h-5 lg:w-6 lg:h-6" />} iconBg="bg-primary/10" iconColor="text-primary" label="Учеников">
        {renderValue(stats.totalStudents)}
      </StatCardShell>
      <StatCardShell icon={<BookOpen className="w-5 h-5 lg:w-6 lg:h-6" />} iconBg="bg-accent/10" iconColor="text-accent" label="Курсов">
        {renderValue(stats.totalCourses)}
      </StatCardShell>
      <StatCardShell icon={<CheckCircle2 className="w-5 h-5 lg:w-6 lg:h-6" />} iconBg="bg-sigma-green/10" iconColor="text-sigma-green" label="Завершили">
        {renderValue(stats.completedCount)}
      </StatCardShell>
      <StatCardShell icon={<TrendingUp className="w-5 h-5 lg:w-6 lg:h-6" />} iconBg="bg-sigma-orange/10" iconColor="text-sigma-orange" label="Ср. прогресс">
        {renderPercent(stats.averageProgress)}
      </StatCardShell>
    </div>
  );
}
