import { Loader2, Zap, Clock, Database } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useCheckoApi } from '@/hooks/useCheckoApi';

export function CheckoQuotaBar() {
  const { stats, setAutoEnrich, runManualNow } = useCheckoApi();
  const s = stats.data;

  const used = s?.today_used ?? 0;
  const limit = s?.daily_limit ?? 100;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const remaining = s?.today_remaining ?? limit;

  return (
    <Card>
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1.5 min-w-[260px] flex-1">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Дневная квота Checko API</span>
              <Badge variant={remaining === 0 ? 'destructive' : 'secondary'} className="ml-1">
                {used} / {limit}
              </Badge>
            </div>
            <Progress value={pct} className="h-2" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Осталось сегодня: {remaining}</span>
              <span>Сброс в 00:00 МСК</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 min-w-[200px]">
            <div className="flex items-center gap-2 text-sm">
              <Database className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">В базе:</span>
              <span className="font-medium">{s?.total_companies ?? 0}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">В очереди:</span>
              <span className="font-medium">{s?.queue_size ?? 0}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 min-w-[260px]">
            <div className="flex items-center justify-between gap-3 p-2 rounded border bg-muted/30">
              <div>
                <div className="text-sm font-medium">Автообновление 03:00 МСК</div>
                <div className="text-xs text-muted-foreground">До 100 записей в сутки</div>
              </div>
              <Switch
                checked={s?.auto_enrich_enabled ?? false}
                onCheckedChange={(v) => setAutoEnrich.mutate(v)}
                disabled={setAutoEnrich.isPending || stats.isLoading}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => runManualNow.mutate()}
              disabled={runManualNow.isPending || !s?.auto_enrich_enabled}
              className="gap-2"
              title={!s?.auto_enrich_enabled ? 'Сначала включите автообновление' : 'Запустить автоцикл сейчас'}
            >
              {runManualNow.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Запустить автоцикл сейчас
            </Button>
          </div>
        </div>

        {s?.last_auto_run_at && (
          <div className="text-xs text-muted-foreground border-t pt-2">
            Последний автозапуск: {new Date(s.last_auto_run_at).toLocaleString('ru-RU')}
            {typeof s.last_auto_processed === 'number' && ` — обработано ${s.last_auto_processed}`}
            {s.last_auto_error && <span className="text-destructive"> — {s.last_auto_error}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
