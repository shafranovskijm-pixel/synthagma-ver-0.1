import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  featureUsageStats: { feature_id: string; name: string; count: number }[];
}

export function FeaturesChart({ featureUsageStats }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Популярность функций</CardTitle>
        <CardDescription>Какими функциями организации пользуются больше всего</CardDescription>
      </CardHeader>
      <CardContent>
        {featureUsageStats.length > 0 ? (
          <div className="space-y-4">
            {featureUsageStats.map((feature, index) => (
              <div key={feature.feature_id} className="flex items-center gap-4">
                <div className="w-8 text-center font-bold text-muted-foreground">#{index + 1}</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{feature.name}</span>
                    <span className="text-muted-foreground">{feature.count} использований</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${(feature.count / (featureUsageStats[0]?.count || 1)) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Данные об использовании функций пока не собраны
          </div>
        )}
      </CardContent>
    </Card>
  );
}
