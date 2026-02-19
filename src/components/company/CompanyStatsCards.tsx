import { Card, CardContent } from "@/components/ui/card";
import { Users, TrendingUp, CheckCircle2, Clock } from "lucide-react";

interface CompanyStats {
  totalEmployees: number;
  avgProgress: number;
  completedCourses: number;
  activeCourses: number;
}

interface Props {
  stats: CompanyStats;
}

export function CompanyStatsCards({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalEmployees}</p>
              <p className="text-xs text-muted-foreground">Сотрудников</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.avgProgress}%</p>
              <p className="text-xs text-muted-foreground">Средний прогресс</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.completedCourses}</p>
              <p className="text-xs text-muted-foreground">Завершено</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.activeCourses}</p>
              <p className="text-xs text-muted-foreground">В процессе</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
