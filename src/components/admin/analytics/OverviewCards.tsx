import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, Users } from "lucide-react";
import { CHART_COLORS } from "@/hooks/useAdminAnalytics";

interface Props {
  stats: {
    totalUsers: number; totalOrganizations: number; totalCourses: number;
    publishedCourses: number; completionRate: number;
  };
  enrollmentStatusData: { name: string; value: number; color: string }[];
  paymentStats: { paidCount: number; projectedYearlyRevenue: number } | null;
  aiUsageByOrg: { orgId: string; name: string; generations: number; tokens: number }[];
  aiUserStats: { key: string; userName: string; orgName: string; count: number }[];
  formatCurrency: (v: number) => string;
}

export function OverviewCards({ stats, enrollmentStatusData, paymentStats, aiUsageByOrg, aiUserStats, formatCurrency }: Props) {
  return (
    <>
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Статусы записей на курсы</CardTitle>
            <CardDescription>Распределение записей по статусу</CardDescription>
          </CardHeader>
          <CardContent>
            {enrollmentStatusData.length > 0 ? (
              <ChartContainer config={{}} className="h-[300px] w-full">
                <PieChart>
                  <Pie data={enrollmentStatusData} cx="50%" cy="50%" labelLine={false} outerRadius={100} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {enrollmentStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">Нет записей на курсы</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Общая статистика</CardTitle>
            <CardDescription>Ключевые показатели платформы</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
              <span className="text-muted-foreground">Всего пользователей</span>
              <span className="font-bold text-lg">{stats.totalUsers}</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
              <span className="text-muted-foreground">Всего организаций</span>
              <span className="font-bold text-lg">{stats.totalOrganizations}</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
              <span className="text-muted-foreground">Всего курсов</span>
              <span className="font-bold text-lg">{stats.totalCourses}</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
              <span className="text-muted-foreground">Опубликованных курсов</span>
              <span className="font-bold text-lg">{stats.publishedCourses}</span>
            </div>
            {paymentStats && (
              <>
                <div className="flex justify-between items-center p-3 rounded-lg bg-green-500/10">
                  <span className="text-muted-foreground">Оплаченных организаций</span>
                  <span className="font-bold text-lg text-green-600">{paymentStats.paidCount}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-primary/10">
                  <span className="text-muted-foreground">Прогноз выручки/год</span>
                  <span className="font-bold text-lg text-primary">{formatCurrency(paymentStats.projectedYearlyRevenue)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            ИИ-генерации по организациям
          </CardTitle>
          <CardDescription>Рейтинг организаций по количеству ИИ-запросов (все время)</CardDescription>
        </CardHeader>
        <CardContent>
          {aiUsageByOrg.length > 0 ? (
            <div className="space-y-6">
              <ChartContainer config={{ generations: { label: "Генерации", color: CHART_COLORS[3] } }} className="h-[300px] w-full">
                <BarChart data={aiUsageByOrg.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={150} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="generations" name="Генерации" fill={CHART_COLORS[3]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
              <ScrollArea className="h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Организация</TableHead>
                      <TableHead className="text-right">Генерации</TableHead>
                      <TableHead className="text-right">Токены</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aiUsageByOrg.map((org, index) => (
                      <TableRow key={org.orgId}>
                        <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                        <TableCell className="font-medium">{org.name}</TableCell>
                        <TableCell className="text-right">{org.generations.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{org.tokens.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground">Нет данных об ИИ-генерациях</div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            ИИ-запросы по пользователям
          </CardTitle>
          <CardDescription>Какие пользователи используют ИИ-генерации и в каких организациях</CardDescription>
        </CardHeader>
        <CardContent>
          {aiUserStats.length > 0 ? (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Пользователь</TableHead>
                    <TableHead>Организация</TableHead>
                    <TableHead className="text-right">Запросов</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aiUserStats.map((user, index) => (
                    <TableRow key={user.key}>
                      <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="font-medium">{user.userName}</TableCell>
                      <TableCell className="text-muted-foreground">{user.orgName}</TableCell>
                      <TableCell className="text-right font-medium">{user.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground">
              Нет данных — логирование запросов начнётся с новых генераций
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
