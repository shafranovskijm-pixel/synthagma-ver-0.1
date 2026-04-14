import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { CHART_COLORS } from "@/hooks/useAdminAnalytics";

interface Props {
  data: any[];
  period: string;
  chartConfig: Record<string, any>;
}

export function RegistrationsChart({ data, period, chartConfig }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Регистрации пользователей и организаций</CardTitle>
        <CardDescription>Динамика регистраций за последние {period} дней</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[350px] w-full">
          <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.3} />
                <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorOrgs" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLORS[3]} stopOpacity={0.3} />
                <stop offset="95%" stopColor={CHART_COLORS[3]} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent labelKey="fullDate" />} />
            <Area type="monotone" dataKey="users" name="Пользователи" stroke={CHART_COLORS[0]} strokeWidth={2} fillOpacity={1} fill="url(#colorUsers)" />
            <Area type="monotone" dataKey="organizations" name="Организации" stroke={CHART_COLORS[3]} strokeWidth={2} fillOpacity={1} fill="url(#colorOrgs)" />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
