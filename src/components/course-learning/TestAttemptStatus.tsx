import { Button } from '@/components/ui/button';
export interface TestAttemptStatusProps {
  maxAttempts: number | null;
  attemptsUsed: number;
  maxAttemptsPerDay: number | null;
  attemptsUsedToday: number;
  active: boolean;
  submitted: boolean;
  busy: boolean;
  blocked: boolean;
  error: string | null;
  manualCredit?: { creditedAt: string; creditedBy: string } | null;
  onStart: () => void;
  onRefresh: () => void;
}
export function TestAttemptStatus(props: TestAttemptStatusProps) {
  if (props.manualCredit) return <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-5" role="status">
    <h3 className="font-semibold text-green-700">Тест сдан — зачтено организацией</h3>
    <p className="mt-1 text-sm">Очная сдача / ручной зачёт от {new Date(props.manualCredit.creditedAt).toLocaleString('ru-RU')}. Повторно проходить тест не требуется.</p>
  </div>;
  return <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
    <p className="text-sm">Сегодня начато попыток: <strong>{props.attemptsUsedToday}{props.maxAttemptsPerDay != null ? ' из ' + props.maxAttemptsPerDay : ''}</strong>. Всего: {props.attemptsUsed}{props.maxAttempts != null ? ' из ' + props.maxAttempts : ''}.</p>
    {props.maxAttemptsPerDay != null && <p className="text-xs text-muted-foreground">Суточный лимит обновляется в 00:00 по Москве.</p>}
    {props.active && <p className="text-sm text-muted-foreground">Вы продолжаете начатую попытку. Обновление страницы не расходует новую попытку.</p>}
    {props.blocked && !props.active && <p role="status" className="text-sm text-destructive">{props.maxAttempts != null && props.attemptsUsed >= props.maxAttempts ? 'Использованы все попытки теста.' : 'На сегодня попытки закончились. Следующая попытка доступна после 00:00 по Москве.'}</p>}
    {!props.active && !props.submitted && !props.error && <Button onClick={props.onStart} disabled={props.busy || props.blocked}>Начать тест</Button>}
    {!props.active && !props.submitted && !props.error && <p className="text-xs text-muted-foreground">Попытка учитывается после нажатия «Начать тест».</p>}
    {props.error && <Button variant="outline" onClick={props.onRefresh} disabled={props.busy}>Обновить состояние теста</Button>}
  </div>;
}
