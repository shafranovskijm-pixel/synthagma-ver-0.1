import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3, Clock, FileText } from "lucide-react";
import { ClassJournalExport } from "@/components/organization/ClassJournalExport";
import { DocumentIssuanceLog } from "@/components/organization/DocumentIssuanceLog";

interface StatsTabProps {
  organizationId: string;
  stats: {
    totalStudents: number;
    totalCourses: number;
    completedCount: number;
    averageProgress: number;
  };
}

export function StatsTab({ organizationId, stats }: StatsTabProps) {
  return (
    <div className="space-y-4 lg:space-y-6">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start bg-card border border-border rounded-xl p-1 h-auto flex-wrap gap-1">
          <TabsTrigger
            value="overview"
            className="rounded-lg data-[state=active]:bg-primary/10 gap-1 lg:gap-2 text-xs lg:text-sm px-2 lg:px-3"
          >
            <BarChart3 className="w-3 h-3 lg:w-4 lg:h-4" />
            <span className="hidden sm:inline">Обзор</span>
          </TabsTrigger>
          <TabsTrigger
            value="class-journal"
            className="rounded-lg data-[state=active]:bg-primary/10 gap-1 lg:gap-2 text-xs lg:text-sm px-2 lg:px-3"
          >
            <Clock className="w-3 h-3 lg:w-4 lg:h-4" />
            <span className="hidden sm:inline">Журнал занятий</span>
            <span className="sm:hidden">Журнал</span>
          </TabsTrigger>
          <TabsTrigger
            value="document-log"
            className="rounded-lg data-[state=active]:bg-primary/10 gap-1 lg:gap-2 text-xs lg:text-sm px-2 lg:px-3"
          >
            <FileText className="w-3 h-3 lg:w-4 lg:h-4" />
            <span className="hidden sm:inline">Журнал документов</span>
            <span className="sm:hidden">Документы</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 lg:mt-6">
          <div className="bg-card rounded-xl lg:rounded-2xl border border-border p-4 lg:p-6">
            <h2 className="font-display text-lg lg:text-xl font-semibold mb-4 lg:mb-6">
              Общая статистика
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
              <div className="space-y-3 lg:space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">Всего учеников</span>
                  <span className="font-bold">{stats.totalStudents}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">Всего курсов</span>
                  <span className="font-bold">{stats.totalCourses}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">Завершили обучение</span>
                  <span className="font-bold text-sigma-green">{stats.completedCount}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-muted-foreground">Средний прогресс</span>
                  <span className="font-bold">{stats.averageProgress}%</span>
                </div>
              </div>
              <div className="flex items-center justify-center py-4">
                <div className="relative w-32 h-32 lg:w-40 lg:h-40">
                  <svg className="w-32 h-32 lg:w-40 lg:h-40 transform -rotate-90">
                    <circle
                      cx="50%"
                      cy="50%"
                      r="45%"
                      fill="none"
                      stroke="hsl(var(--border))"
                      strokeWidth="12"
                    />
                    <circle
                      cx="50%"
                      cy="50%"
                      r="45%"
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth="12"
                      strokeDasharray={`${stats.averageProgress * 2.83} 283`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl lg:text-4xl font-bold font-display">
                      {stats.averageProgress}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
