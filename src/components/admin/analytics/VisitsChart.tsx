import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Eye, BookOpen, Users, TrendingUp, Search, Monitor } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { CHART_COLORS } from "@/hooks/useAdminAnalytics";
import { RoleBadge } from "./RoleBadge";

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
          <CardDescription>Кто, из какой организации, с какой ролью и что делал (последние 500)</CardDescription>
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
              <Input placeholder="Имя, email, организация или роль..." value={visitSearch} onChange={(e) => setVisitSearch(e.target.value)} className="pl-8" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[560px] w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Имя</TableHead>
                  <TableHead className="whitespace-nowrap">Роль</TableHead>
                  <TableHead className="whitespace-nowrap">Организация</TableHead>
                  <TableHead className="whitespace-nowrap">Дата и время</TableHead>
                  <TableHead className="whitespace-nowrap">Действие</TableHead>
                  <TableHead className="whitespace-nowrap">Курс</TableHead>
                  <TableHead className="whitespace-nowrap">Устройство</TableHead>
                  <TableHead className="whitespace-nowrap">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visitLog.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">Нет данных за выбранный период</TableCell>
                  </TableRow>
                ) : (
                  visitLog.map((v: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium whitespace-nowrap">
                        <div>{v.name}</div>
                        <div className="text-[11px] text-muted-foreground">{v.email}</div>
                      </TableCell>
                      <TableCell><RoleBadge role={v.role} /></TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{v.orgName || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{format(v.time, "d MMM yyyy, HH:mm", { locale: ru })}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {v.type === "course" ? "Открыл курс" : "Вход на платформу"}
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate text-xs">{v.courseTitle || "—"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        <span className="flex items-center gap-1"><Monitor className="w-3 h-3" />{v.device} · {v.browser}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{v.ip}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Топ-30 активных пользователей</CardTitle>
          <CardDescription>По количеству посещений за {period} дней</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Имя</TableHead>
                  <TableHead>Роль</TableHead>
                  <TableHead>Организация</TableHead>
                  <TableHead className="text-center">Платформа</TableHead>
                  <TableHead className="text-center">Курсы</TableHead>
                  <TableHead className="text-center">Всего</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Нет данных</TableCell>
                  </TableRow>
                ) : (
                  topUsers.map((u: any, i: number) => (
                    <TableRow key={u.userId}>
                      <TableCell className="font-bold text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        <div>{u.name}</div>
                        <div className="text-[11px] text-muted-foreground">{u.email}</div>
                      </TableCell>
                      <TableCell><RoleBadge role={u.role} /></TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{u.orgName || "—"}</TableCell>
                      <TableCell className="text-center">{u.platform}</TableCell>
                      <TableCell className="text-center">{u.courses}</TableCell>
                      <TableCell className="text-center font-bold">{u.total}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </>
  );
}
