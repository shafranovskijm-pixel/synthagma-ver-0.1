import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell } from "recharts";

interface Props {
  paymentStatusData: { name: string; value: number; color: string }[];
  tariffDistributionData: { name: string; value: number; color: string }[];
}

export function PaymentsChart({ paymentStatusData, tariffDistributionData }: Props) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Статус оплаты организаций</CardTitle>
          <CardDescription>Распределение по статусу оплаты</CardDescription>
        </CardHeader>
        <CardContent>
          {paymentStatusData.length > 0 ? (
            <ChartContainer config={{}} className="h-[300px] w-full">
              <PieChart>
                <Pie data={paymentStatusData} cx="50%" cy="50%" labelLine={false} outerRadius={100} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {paymentStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">Нет данных</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Распределение тарифов</CardTitle>
          <CardDescription>Типы тарифов организаций</CardDescription>
        </CardHeader>
        <CardContent>
          {tariffDistributionData.length > 0 ? (
            <ChartContainer config={{}} className="h-[300px] w-full">
              <PieChart>
                <Pie data={tariffDistributionData} cx="50%" cy="50%" labelLine={false} outerRadius={100} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {tariffDistributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">Нет данных</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
