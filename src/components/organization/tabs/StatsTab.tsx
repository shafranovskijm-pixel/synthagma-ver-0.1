import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3, Clock, FileText, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ClassJournalExport } from "@/components/organization/ClassJournalExport";
import { DocumentIssuanceLog } from "@/components/organization/DocumentIssuanceLog";
import type { UserFacingErrorKind } from "@/utils/isTransientNetworkError";
import { summaryErrorMessage } from "./summaryStateMessages";

interface StatsTabProps {
  organizationId: string;
  stats: {
    totalStudents: number;
    totalCourses: number;
    completedCount: number;
    averageProgress: number;
  };
  hasData?: boolean;
  isLoading?: boolean;
  errorKind?: UserFacingErrorKind | null;
  onRetry?: () => void;
}

export function StatsTab({ organizationId, stats, hasData, isLoading, errorKind, onRetry }: StatsTabProps) {
  const showError = !!errorKind && !hasData;
  const showSkeleton = !showError && !!isLoading && !hasData;

  return (
    <div className="space-y-4 lg:space-y-6">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start bg-card border border-border rounded-xl p-1 h-auto flex-wrap gap-1">
          <TabsTrigger value="overview" className="rounded-lg data-[state=active]:bg-primary/10 gap-1 lg:gap-2 text-xs lg:text-sm px-2 lg:px-3">
            <BarChart3 className="w-3 h-3 lg:w-4 lg:h-4" />
            <span className="hidden sm:inline">Обзор</span>
          </TabsTrigger>
          <TabsTrigger value="class-journal" className="rounded-lg data-[state=active]:bg-primary/10 gap-1 lg:gap-2 text-xs lg:text-sm px-2 lg:px-3">
            <Clock className="w-3 h-3 lg:w-4 lg:h-4" />
            <span className="hidden sm:inline">Журнал занятий</span>
            <span className="sm:hidden">Журнал</span>
          </TabsTrigger>
          <TabsTrigger value="document-log" className="rounded-lg data-[state=active]:bg-primary/10 gap-1 lg:gap-2 text-xs lg:text-sm px-2 lg:px-3">
            <FileText className="w-3 h-3 lg:w-4 lg:h-4" />
            <span className="hidden sm:inline">Журнал документов</span>
            <span className="sm:hidden">Документы</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 lg:mt-6">
          {showError ? (
            <div className="bg-card border border-border rounded-xl lg:rounded-2xl p-6 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
              <div className="flex-1 text-sm text-muted-foreground">{summaryErrorMessage(errorKind)}</div>
              {onRetry && (
                <Button size="sm" variant="outline" className="gap-2" onClick={onRetry}>
                  <RefreshCw className="w-3.5 h-3.5" /> Повторить
                </Button>
              )}
            </div>
          ) : (
            <div className="bg-card rounded-xl lg:rounded-2xl border border-border p-4 lg:p-6">
              <h2 className="font-display text-lg lg:text-xl font-semibold mb-4 lg:mb-6">Общая статистика</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
                <div className="space-y-3 lg:space-y-4">
                  <Row label="Всего учеников" value={showSkeleton ? null : String(stats.totalStudents)} />
                  <Row label="Всего курсов" value={showSkeleton ? null : String(stats.totalCourses)} />
                  <Row label="Завершили обучение" value={showSkeleton ? null : String(stats.completedCount)} valueClass="text-sigma-green" />
                  <Row label="Средний прогресс" value={showSkeleton ? null : `${stats.averageProgress}%`} noBorder />
                </div>
                <div className="flex items-center justify-center py-4">
                  {showSkeleton ? (
                    <Skeleton className="w-32 h-32 lg:w-40 lg:h-40 rounded-full" />
                  ) : (
                    <div className="relative w-32 h-32 lg:w-40 lg:h-40">
                      <svg className="w-32 h-32 lg:w-40 lg:h-40 transform -rotate-90">
                        <circle cx="50%" cy="50%" r="45%" fill="none" stroke="hsl(var(--border))" strokeWidth="12" />
                        <circle cx="50%" cy="50%" r="45%" fill="none" stroke="hsl(var(--primary))" strokeWidth="12"
                          strokeDasharray={`${stats.averageProgress * 2.83} 283`} strokeLinecap="round" />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-2xl lg:text-4xl font-bold font-display">{stats.averageProgress}%</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="class-journal" className="mt-4 lg:mt-6">
          <ClassJournalExport organizationId={organizationId} />
        </TabsContent>

        <TabsContent value="document-log" className="mt-4 lg:mt-6">
          <DocumentIssuanceLog organizationId={organizationId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value, valueClass, noBorder }: { label: string; value: string | null; valueClass?: string; noBorder?: boolean }) {
  return (
    <div className={`flex justify-between items-center py-2 ${noBorder ? '' : 'border-b border-border/50'}`}>
      <span className="text-sm text-muted-foreground">{label}</span>
      {value === null ? <Skeleton className="h-4 w-14" /> : <span className={`font-bold ${valueClass ?? ''}`}>{value}</span>}
    </div>
  );
}
