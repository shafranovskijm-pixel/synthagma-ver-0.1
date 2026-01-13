import { Users, BookOpen, CheckCircle2, TrendingUp } from "lucide-react";
import type { OrganizationStats } from "@/types";

interface StatsCardsProps {
  stats: OrganizationStats;
}

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6 mb-6 lg:mb-8">
      <div className="bg-card rounded-xl lg:rounded-2xl p-4 lg:p-6 border border-border">
        <div className="flex items-center gap-3 lg:gap-4">
          <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-lg lg:rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="w-5 h-5 lg:w-6 lg:h-6 text-primary" />
          </div>
          <div>
            <div className="text-xl lg:text-2xl font-bold font-display">{stats.totalStudents}</div>
            <div className="text-muted-foreground text-xs lg:text-sm">Учеников</div>
          </div>
        </div>
      </div>
      <div className="bg-card rounded-xl lg:rounded-2xl p-4 lg:p-6 border border-border">
        <div className="flex items-center gap-3 lg:gap-4">
          <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-lg lg:rounded-xl bg-accent/10 flex items-center justify-center">
            <BookOpen className="w-5 h-5 lg:w-6 lg:h-6 text-accent" />
          </div>
          <div>
            <div className="text-xl lg:text-2xl font-bold font-display">{stats.totalCourses}</div>
            <div className="text-muted-foreground text-xs lg:text-sm">Курсов</div>
          </div>
        </div>
      </div>
      <div className="bg-card rounded-xl lg:rounded-2xl p-4 lg:p-6 border border-border">
        <div className="flex items-center gap-3 lg:gap-4">
          <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-lg lg:rounded-xl bg-sigma-green/10 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 lg:w-6 lg:h-6 text-sigma-green" />
          </div>
          <div>
            <div className="text-xl lg:text-2xl font-bold font-display">{stats.completedCount}</div>
            <div className="text-muted-foreground text-xs lg:text-sm">Завершили</div>
          </div>
        </div>
      </div>
      <div className="bg-card rounded-xl lg:rounded-2xl p-4 lg:p-6 border border-border">
        <div className="flex items-center gap-3 lg:gap-4">
          <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-lg lg:rounded-xl bg-sigma-orange/10 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 lg:w-6 lg:h-6 text-sigma-orange" />
          </div>
          <div>
            <div className="text-xl lg:text-2xl font-bold font-display">{stats.averageProgress}%</div>
            <div className="text-muted-foreground text-xs lg:text-sm">Ср. прогресс</div>
          </div>
        </div>
      </div>
    </div>
  );
}
