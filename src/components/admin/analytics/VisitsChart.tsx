import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, BookOpen, Users, TrendingUp, Search, Monitor } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { CHART_COLORS } from "@/hooks/useAdminAnalytics";

interface Props {
  visitsByDay: any[];
  visitStats: { platformTotal: number; courseTotal: number; uniqueUsers: number; avgPerDay: number } | null;
  visitLog: any[];
  topUsers: any[];
  visitFilter: "all" | "platform" | "courses";
  setVisitFilter: (v: "all" | "platform" | "courses") => void;
  visitSearch: string;
  setVisitSearch: (v: string) => void;
  period: string;
  chartConfig: Record<string, any>;
}

export function VisitsChart({ visitsByDay, visitStats, visitLog, topUsers, visitFilter, setVisitFilter, visitSearch, setVisitSearch, period, chartConfig }: Props) {
  if (!visitStats) return null;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><Eye className="w-3 h-3" /> Заходы на платформу</CardDescription>
            <CardTitle className="text-2xl">{visitStats.platformTotal}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> Заходы на курсы</CardDescription>
            <CardTitle className="text-2xl">{visitStats.courseTotal}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><Users className="w-3 h-3" /> Уникальных пользователей</CardDescription>
            <CardTitle className="text-2xl">{visitStats.uniqueUsers}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Среднее/день</CardDescription>
            <CardTitle className="text-2xl">{visitStats.avgPerDay}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Посещения по дням</CardTitle>
          <CardDescription>Заходы на платформу и курсы за последние {period} дней</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[350px] w-full">
            <AreaChart data={visitsByDay} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorPlatform" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorCourses" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS[1]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS[1]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent labelKey="fullDate" />} />
              <Area type="monotone" dataKey="platform" name="Платформа" stroke={CHART_COLORS[0]} strokeWidth={2} fillOpacity={1} fill="url(#colorPlatform)" />
              <Area type="monotone" dataKey="courses" name="Курсы" stroke={CHART_COLORS[1]} strokeWidth={2} fillOpacity={1} fill="url(#colorCourses)" />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Журнал посещений</CardTitle>
          <CardDescription>Детализация по каждому визиту (последние 200)</CardDescription>
          <div className="flex flex-wrap gap-2 mt-3">
            <Select value={visitFilter} onValueChange={(v) => setVisitFilter(v as typeof visitFilter)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все посещения</SelectItem>
                <SelectItem value="platform">Только платформа</SelectItem>
                <SelectItem value="courses">Только курсы</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Поиск по имени или email..." value={visitSearch} onChange={(e) => setVisitSearch(e.target.value)} className="pl-8" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Имя</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Дата и время</TableHead>
                  <TableHead>Организация</TableHead>
                  <TableHead>Курс</TableHead>
                  <TableHead>Устройство</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visitLog.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Нет данных за выбранный период</TableCell>
                  </TableRow>
                ) : (
                  visitLog.map((v: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium whitespace-nowrap">{v.name}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{v.email}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{format(v.time, "d MMM yyyy, HH:mm", { locale: ru })}</TableCell>
                      <TableCell className="text-xs max-w-[150px] truncate">{v.orgName || "—"}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs">{v.courseTitle || "—"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        <span className="flex items-center gap-1"><Monitor className="w-3 h-3" />{v.device} · {v.browser}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{v.ip}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Топ-20 активных пользователей</CardTitle>
          <CardDescription>По количеству посещений за {period} дней</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Имя</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-center">Платформа</TableHead>
                <TableHead className="text-center">Курсы</TableHead>
                <TableHead className="text-center">Всего</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Нет данных</TableCell>
                </TableRow>
              ) : (
                topUsers.map((u: any, i: number) => (
                  <TableRow key={u.userId}>
                    <TableCell className="font-bold text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{u.email}</TableCell>
                    <TableCell className="text-center">{u.platform}</TableCell>
                    <TableCell className="text-center">{u.courses}</TableCell>
                    <TableCell className="text-center font-bold">{u.total}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
