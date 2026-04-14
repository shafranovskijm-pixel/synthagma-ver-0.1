import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { CHART_COLORS } from "@/hooks/useAdminAnalytics";

interface Props {
  data: any[];
  period: string;
  chartConfig: Record<string, any>;
}

export function ActivityChart({ data, period, chartConfig }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Активность на платформе</CardTitle>
        <CardDescription>Записи на курсы и прохождение уроков за последние {period} дней</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[350px] w-full">
          <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent labelKey="fullDate" />} />
            <Bar dataKey="enrollments" name="Записи на курсы" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
            <Bar dataKey="lessons" name="Уроки пройдены" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
