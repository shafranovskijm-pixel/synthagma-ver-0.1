import { Card, CardContent } from "@/components/ui/card";
import { Flame, TrendingUp } from "lucide-react";
import { useEmailWarmup } from "@/hooks/useEmailWarmup";

interface WarmupBadgeProps {
  scopeKey: string;
}

export function WarmupBadge({ scopeKey }: WarmupBadgeProps) {
  const { status, loading } = useEmailWarmup(scopeKey);

  if (loading || !status) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Загрузка прогрева...</p>
        </CardContent>
      </Card>
    );
  }

  const pct = status.daily_limit > 0 ? Math.round((status.sent_today / status.daily_limit) * 100) : 0;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-500" />
            <span className="font-medium text-sm">Прогрев SMTP — день {status.day}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="w-3 h-3" />
            всего: {status.total_sent}
          </div>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Сегодня: <span className="font-medium text-foreground">{status.sent_today}</span> / {status.daily_limit}
          </span>
          <span className="text-muted-foreground">
            Осталось: <span className="font-medium text-foreground">{status.remaining}</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
