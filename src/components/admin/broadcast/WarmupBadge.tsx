import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Flame, TrendingUp, AlertTriangle, MailX, RefreshCw } from "lucide-react";
import { useEmailWarmup } from "@/hooks/useEmailWarmup";

interface WarmupBadgeProps {
  scopeKey: string;
}

export function WarmupBadge({ scopeKey }: WarmupBadgeProps) {
  const { status, loading, errorKind, retry } = useEmailWarmup(scopeKey);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Загрузка прогрева...</p>
        </CardContent>
      </Card>
    );
  }

  if (errorKind && !status) {
    const message =
      errorKind === "permission" || errorKind === "unauthorized"
        ? "Нет доступа к данным о прогреве этого отправителя."
        : errorKind === "network"
        ? "Не удалось загрузить статус прогрева. Проверьте соединение."
        : "Не удалось загрузить статус прогрева.";
    return (
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4" />
            {message}
          </div>
          <Button size="sm" variant="outline" onClick={retry} className="gap-2">
            <RefreshCw className="w-3 h-3" /> Повторить
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Прогрев недоступен.</p>
        </CardContent>
      </Card>
    );
  }

  if (status.configured === false) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <MailX className="w-4 h-4" />
          SMTP не настроен — запуск рассылки недоступен.
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
