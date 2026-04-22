import { useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  FileText,
  ScrollText,
  PenTool,
  Receipt,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Eye,
  Sparkles,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';

export interface TimelineEvent {
  id: string;
  type: 'proposal' | 'contract' | 'signature' | 'invoice';
  subtype?: 'created' | 'sent' | 'viewed' | 'signed' | 'rejected' | 'paid' | 'expired';
  title: string;
  status?: string;
  amount?: number;
  date: string;
  meta?: string;
}

interface CompanyTimelineProps {
  proposals: Array<{ id: string; status: string; total_amount: number; created_at: string; tariff_plan: string | null; last_sent_at?: string | null }>;
  contracts: Array<{ id: string; status: string; contract_number: string | null; total_amount: number; created_at: string }>;
  signatures: Array<{ id: string; status: string; document_title: string; document_type: string; created_at: string; signed_at: string | null; sent_at?: string | null; viewed_at?: string | null }>;
  invoices?: Array<{ id: string; status: string; document_number: string | null; amount: number; created_at: string; type: string }>;
}

const TYPE_META: Record<TimelineEvent['type'], { icon: any; label: string; color: string; bg: string }> = {
  proposal: { icon: FileText, label: 'КП', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
  contract: { icon: ScrollText, label: 'Договор', color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/10 border-violet-500/30' },
  signature: { icon: PenTool, label: 'Подпись', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
  invoice: { icon: Receipt, label: 'Счёт', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
};

const SUBTYPE_ICON: Record<string, any> = {
  created: Sparkles,
  sent: Send,
  viewed: Eye,
  signed: CheckCircle2,
  rejected: XCircle,
  paid: CheckCircle2,
  expired: XCircle,
};

const SUBTYPE_LABEL: Record<string, string> = {
  created: 'Создано',
  sent: 'Отправлено',
  viewed: 'Просмотрено',
  signed: 'Подписано',
  rejected: 'Отклонено',
  paid: 'Оплачено',
  expired: 'Истёк срок',
};

export function CompanyTimeline({ proposals, contracts, signatures, invoices = [] }: CompanyTimelineProps) {
  const events = useMemo<TimelineEvent[]>(() => {
    const all: TimelineEvent[] = [];

    proposals.forEach((p) => {
      all.push({
        id: `p-${p.id}-c`,
        type: 'proposal',
        subtype: 'created',
        title: p.tariff_plan ? `КП — ${p.tariff_plan}` : 'Коммерческое предложение',
        status: p.status,
        amount: p.total_amount,
        date: p.created_at,
      });
      if (p.last_sent_at) {
        all.push({
          id: `p-${p.id}-s`,
          type: 'proposal',
          subtype: 'sent',
          title: p.tariff_plan ? `КП — ${p.tariff_plan}` : 'Коммерческое предложение',
          status: p.status,
          date: p.last_sent_at,
        });
      }
    });

    contracts.forEach((c) => {
      all.push({
        id: `c-${c.id}-c`,
        type: 'contract',
        subtype: 'created',
        title: `Договор ${c.contract_number || 'б/н'}`,
        status: c.status,
        amount: c.total_amount,
        date: c.created_at,
      });
      if (c.status === 'signed' || c.status === 'active') {
        all.push({
          id: `c-${c.id}-s`,
          type: 'contract',
          subtype: 'signed',
          title: `Договор ${c.contract_number || 'б/н'}`,
          status: c.status,
          date: c.created_at,
        });
      }
    });

    signatures.forEach((s) => {
      all.push({
        id: `s-${s.id}-c`,
        type: 'signature',
        subtype: 'created',
        title: s.document_title,
        status: s.status,
        date: s.created_at,
        meta: s.document_type,
      });
      if (s.sent_at) {
        all.push({ id: `s-${s.id}-snt`, type: 'signature', subtype: 'sent', title: s.document_title, date: s.sent_at });
      }
      if (s.viewed_at) {
        all.push({ id: `s-${s.id}-v`, type: 'signature', subtype: 'viewed', title: s.document_title, date: s.viewed_at });
      }
      if (s.signed_at) {
        all.push({ id: `s-${s.id}-sg`, type: 'signature', subtype: 'signed', title: s.document_title, date: s.signed_at });
      }
      if (s.status === 'rejected') {
        all.push({ id: `s-${s.id}-r`, type: 'signature', subtype: 'rejected', title: s.document_title, date: s.created_at });
      }
    });

    invoices.forEach((i) => {
      all.push({
        id: `i-${i.id}-c`,
        type: 'invoice',
        subtype: 'created',
        title: `Счёт ${i.document_number || 'б/н'}`,
        status: i.status,
        amount: i.amount,
        date: i.created_at,
      });
      if (i.status === 'paid') {
        all.push({
          id: `i-${i.id}-p`,
          type: 'invoice',
          subtype: 'paid',
          title: `Счёт ${i.document_number || 'б/н'}`,
          amount: i.amount,
          date: i.created_at,
        });
      }
    });

    return all
      .filter((e) => !!e.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [proposals, contracts, signatures, invoices]);

  // Группировка по дате
  const grouped = useMemo(() => {
    const map = new Map<string, TimelineEvent[]>();
    events.forEach((e) => {
      const key = format(new Date(e.date), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return Array.from(map.entries());
  }, [events]);

  if (events.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-8">
        Событий пока нет
      </div>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-440px)]">
      <div className="relative pl-4 pr-2">
        {/* Вертикальная линия */}
        <div className="absolute left-[22px] top-2 bottom-2 w-px bg-gradient-to-b from-primary/40 via-border to-transparent" />

        <div className="space-y-5">
          {grouped.map(([dateKey, dayEvents]) => {
            const dateObj = new Date(dateKey);
            const isToday = format(new Date(), 'yyyy-MM-dd') === dateKey;
            return (
              <div key={dateKey} className="space-y-2">
                <div className="flex items-center gap-2 ml-8 mb-2">
                  <span className={cn(
                    'text-xs font-semibold px-2 py-0.5 rounded-md',
                    isToday ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                  )}>
                    {isToday ? 'Сегодня' : format(dateObj, 'd MMMM yyyy', { locale: ru })}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(dateObj, { addSuffix: true, locale: ru })}
                  </span>
                </div>
                {dayEvents.map((e) => {
                  const meta = TYPE_META[e.type];
                  const Icon = meta.icon;
                  const SubIcon = e.subtype ? SUBTYPE_ICON[e.subtype] : null;
                  return (
                    <div key={e.id} className="relative flex items-start gap-3 group">
                      {/* Точка на линии */}
                      <div className={cn(
                        'relative z-10 w-9 h-9 rounded-xl border-2 flex items-center justify-center shrink-0 transition-transform group-hover:scale-110',
                        meta.bg
                      )}>
                        <Icon className={cn('w-4 h-4', meta.color)} />
                      </div>

                      {/* Карточка события */}
                      <div className="flex-1 min-w-0 p-2.5 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4 font-medium', meta.color)}>
                                {meta.label}
                              </Badge>
                              {e.subtype && SubIcon && (
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <SubIcon className="w-3 h-3" />
                                  {SUBTYPE_LABEL[e.subtype]}
                                </span>
                              )}
                            </div>
                            <div className="text-sm font-medium mt-1 truncate">{e.title}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {format(new Date(e.date), 'HH:mm', { locale: ru })}
                              {e.meta && <span className="ml-1.5">• {e.meta}</span>}
                            </div>
                          </div>
                          {e.amount !== undefined && e.amount > 0 && (
                            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                              {e.amount.toLocaleString('ru-RU')} ₽
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}
