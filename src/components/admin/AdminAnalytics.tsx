import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, BookOpen, Activity, CheckCircle, Building2, DollarSign, Calendar, TrendingUp } from "lucide-react";
import { OnlineUsersWidget } from "./OnlineUsersWidget";
import { AdminAITodayWidget } from "./analytics/AdminAITodayWidget";
import { useAdminAnalytics } from "@/hooks/useAdminAnalytics";
import { RegistrationsChart } from "./analytics/RegistrationsChart";
import { ActivityChart } from "./analytics/ActivityChart";
import { VisitsChart } from "./analytics/VisitsChart";
import { CompletionsChart } from "./analytics/CompletionsChart";
import { PaymentsChart } from "./analytics/PaymentsChart";
import { FeaturesChart } from "./analytics/FeaturesChart";
import { OverviewCards } from "./analytics/OverviewCards";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

export function AdminAnalytics() {
  const {
    loading, period, setPeriod, visitFilter, setVisitFilter, visitSearch, setVisitSearch,
    registrationsByDay, activityByDay, completionsByDay, visitsByDay, visitStats, visitLog,
    topUsers, paymentStats, featureUsageStats, stats, aiUsageByOrg, aiUserStats,
    enrollmentStatusData, paymentStatusData, tariffDistributionData, chartConfig, formatCurrency } = useAdminAnalytics();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <SigmaSpinner size="lg" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12 text-muted-foreground">Нет данных для отображения</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 дней</SelectItem>
            <SelectItem value="30">30 дней</SelectItem>
            <SelectItem value="90">90 дней</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Payment & Revenue Stats */}
      {paymentStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card className="border-sigma-green/30 bg-sigma-green/5">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><Building2 className="w-3 h-3" /> С оплатой</CardDescription>
              <CardTitle className="text-2xl text-sigma-green">{paymentStats.paidCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-destructive/30 bg-destructive/5">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><Building2 className="w-3 h-3" /> Без оплаты</CardDescription>
              <CardTitle className="text-2xl text-destructive">{paymentStats.unpaidCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Годовой тариф</CardDescription>
              <CardTitle className="text-2xl">{paymentStats.yearlyCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Месячный тариф</CardDescription>
              <CardTitle className="text-2xl">{paymentStats.monthlyCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> Прогноз/мес</CardDescription>
              <CardTitle className="text-xl text-primary">{formatCurrency(paymentStats.projectedMonthlyRevenue)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> Прогноз/год</CardDescription>
              <CardTitle className="text-xl text-primary">{formatCurrency(paymentStats.projectedYearlyRevenue)}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OnlineUsersWidget />
        <AdminAITodayWidget />
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><Building2 className="w-3 h-3" /> Всего организаций</CardDescription>
            <CardTitle className="text-2xl">{stats.totalOrganizations}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><Building2 className="w-3 h-3" /> Новых орг-ций</CardDescription>
            <CardTitle className="text-2xl">{stats.newOrgs}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><Users className="w-3 h-3" /> Новые пользователи</CardDescription>
            <CardTitle className="text-2xl">{stats.newUsers}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> Новые записи</CardDescription>
            <CardTitle className="text-2xl">{stats.newEnrollments}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Завершено курсов</CardDescription>
            <CardTitle className="text-2xl">{stats.completedCourses}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><Activity className="w-3 h-3" /> Активных записей</CardDescription>
            <CardTitle className="text-2xl">{stats.activeEnrollments}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> % завершения</CardDescription>
            <CardTitle className="text-2xl">{stats.completionRate}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="registrations" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="registrations">Регистрации</TabsTrigger>
          <TabsTrigger value="activity">Активность</TabsTrigger>
          <TabsTrigger value="visits">Посещения</TabsTrigger>
          <TabsTrigger value="completions">Завершения</TabsTrigger>
          <TabsTrigger value="payments">Оплаты</TabsTrigger>
          <TabsTrigger value="features">Функции</TabsTrigger>
          <TabsTrigger value="overview">Обзор</TabsTrigger>
        </TabsList>

        <TabsContent value="registrations">
          <RegistrationsChart data={registrationsByDay} period={period} chartConfig={chartConfig} />
        </TabsContent>

        <TabsContent value="activity">
          <ActivityChart data={activityByDay} period={period} chartConfig={chartConfig} />
        </TabsContent>

        <TabsContent value="visits">
          <VisitsChart
            visitsByDay={visitsByDay} visitStats={visitStats} visitLog={visitLog} topUsers={topUsers}
            visitFilter={visitFilter} setVisitFilter={setVisitFilter}
            visitSearch={visitSearch} setVisitSearch={setVisitSearch}
            period={period} chartConfig={chartConfig}
          />
        </TabsContent>

        <TabsContent value="completions">
          <CompletionsChart data={completionsByDay} period={period} chartConfig={chartConfig} />
        </TabsContent>

        <TabsContent value="payments">
          <PaymentsChart paymentStatusData={paymentStatusData} tariffDistributionData={tariffDistributionData} />
        </TabsContent>

        <TabsContent value="features">
          <FeaturesChart featureUsageStats={featureUsageStats} />
        </TabsContent>

        <TabsContent value="overview">
          <OverviewCards
            stats={stats} enrollmentStatusData={enrollmentStatusData}
            paymentStats={paymentStats} aiUsageByOrg={aiUsageByOrg}
            aiUserStats={aiUserStats} formatCurrency={formatCurrency}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
