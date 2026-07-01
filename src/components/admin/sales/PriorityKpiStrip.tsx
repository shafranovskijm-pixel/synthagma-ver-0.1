import { cn } from '@/lib/utils';
import { Sparkles, AlarmClock, UserCheck, Clock8, PhoneCall } from 'lucide-react';

export type PriorityFilterKey = 'new_today' | 'overdue' | 'assigned_to_me' | 'stale_7d' | 'calls_today';

interface Item {
  key: PriorityFilterKey;
  label: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'warning' | 'danger' | 'primary' | 'muted' | 'info';
}

interface Props {
  counts: Record<PriorityFilterKey, number>;
  active: PriorityFilterKey | null;
  onSelect: (key: PriorityFilterKey | null) => void;
}

const toneStyles: Record<Item['tone'], string> = {
  warning: 'text-amber-700 dark:text-amber-300 bg-amber-500/10',
  danger: 'text-rose-700 dark:text-rose-300 bg-rose-500/10',
  primary: 'text-primary bg-primary/10',
  muted: 'text-muted-foreground bg-muted/50',
  info: 'text-sky-700 dark:text-sky-300 bg-sky-500/10',
};

export function PriorityKpiStrip({ counts, active, onSelect }: Props) {
  const items: Item[] = [
    { key: 'new_today', label: 'Новые сегодня', count: counts.new_today, icon: Sparkles, tone: 'warning' },
    { key: 'overdue', label: 'Просрочено', count: counts.overdue, icon: AlarmClock, tone: 'danger' },
    { key: 'assigned_to_me', label: 'Назначены мне', count: counts.assigned_to_me, icon: UserCheck, tone: 'primary' },
    { key: 'stale_7d', label: 'Без контакта 7+ дней', count: counts.stale_7d, icon: Clock8, tone: 'muted' },
    { key: 'calls_today', label: 'Звонки сегодня', count: counts.calls_today, icon: PhoneCall, tone: 'info' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      {items.map(it => {
        const Icon = it.icon;
        const isActive = active === it.key;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onSelect(isActive ? null : it.key)}
            className={cn(
              'flex items-center gap-2.5 rounded-xl border p-3 text-left transition',
              isActive ? 'border-primary shadow-sm bg-primary/5' : 'hover:bg-muted/40 border-border',
            )}
          >
            <div className={cn('shrink-0 w-9 h-9 rounded-lg flex items-center justify-center', toneStyles[it.tone])}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground truncate">{it.label}</div>
              <div className="text-lg font-semibold leading-tight">{it.count}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
