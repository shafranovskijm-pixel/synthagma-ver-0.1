import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { CHART_COLORS } from "@/hooks/useAdminAnalytics";

interface Props {
  data: any[];
  period: string;
  chartConfig: Record<string, any>;
}

export function CompletionsChart({ data, period, chartConfig }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Завершения курсов</CardTitle>
        <CardDescription>Динамика завершения курсов за последние {period} дней</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[350px] w-full">
          <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent labelKey="fullDate" />} />
            <Line type="monotone" dataKey="completions" name="Завершения" stroke={CHART_COLORS[2]} strokeWidth={3} dot={{ fill: CHART_COLORS[2], strokeWidth: 2 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
