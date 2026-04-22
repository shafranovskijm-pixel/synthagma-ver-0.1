import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Snowflake, Flame, Eye, Mail, AlertTriangle, Calendar as CalendarIcon,
  Search, ArrowRight, Clock, ChevronRight,
} from 'lucide-react';
import { differenceInDays, format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Props {
  organizationId?: string | null;
  onOpenDeal?: (inn: string | null, name: string) => void;
}

interface LeadRow {
  id: string;
  org_name: string;
  inn: string | null;
  status: string;
  last_contact_at: string | null;
  created_at: string;
}
interface ProposalRow {
  id: string;
  company_name: string;
  company_inn: string | null;
  status: string;
  last_sent_at: string | null;
  first_viewed_at: string | null;
  created_at: string;
  total_amount: number | null;
}
interface ContractRow {
  id: string;
  company_name: string;
  company_inn: string | null;
  status: string;
  created_at: string;
}

type SegmentKey =
  | 'hot'
  | 'opened_no_reply'
  | 'cold_30'
  | 'no_touch_60'
  | 'pending_signature'
  | 'won_recent';

interface SegmentDef {
  key: SegmentKey;
  title: string;
  description: string;
  icon: any;
  tone: 'hot' | 'warm' | 'cold' | 'info' | 'success';
}

const SEGMENT_DEFS: SegmentDef[] = [
  {
    key: 'hot',
    title: 'Горячие',
    description: 'Активный диалог за 7 дней + есть КП или договор',
    icon: Flame,
    tone: 'hot',
  },
  {
    key: 'opened_no_reply',
    title: 'Открыли КП, не ответили',
    description: 'Просмотрели КП, но 3+ дней нет реакции',
    icon: Eye,
    tone: 'warm',
  },
  {
    key: 'pending_signature',
    title: 'Ждут подписания',
    description: 'Договор отправлен, не подписан 3+ дней',
    icon: Mail,
    tone: 'warm',
  },
  {
    key: 'cold_30',
    title: 'Остывают',
    description: 'Лиды в работе, без контакта 14–30 дней',
    icon: AlertTriangle,
    tone: 'warm',
  },
  {
    key: 'no_touch_60',
    title: 'Заморожены',
    description: 'Без контакта более 60 дней — стоит реактивировать',
    icon: Snowflake,
    tone: 'cold',
  },
  {
    key: 'won_recent',
    title: 'Недавно купили',
    description: 'Договор подписан за 90 дней — допродажа',
    icon: CalendarIcon,
    tone: 'success',
  },
];

interface SegmentItem {
  inn: string | null;
  name: string;
  reason: string;
  daysAgo: number | null;
  amount?: number;
}

const TONE_CLASSES: Record<SegmentDef['tone'], string> = {
  hot: 'border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400',
  warm: 'border-orange-500/30 bg-orange-500/5 text-orange-600 dark:text-orange-400',
  cold: 'border-sky-500/30 bg-sky-500/5 text-sky-600 dark:text-sky-400',
  info: 'border-primary/30 bg-primary/5 text-primary',
  success: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400',
};

export function SalesSegments({ organizationId, onOpenDeal }: Props) {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [active, setActive] = useState<SegmentKey>('hot');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const applyOrg = (q: any) =>
          organizationId ? q.eq('organization_id', organizationId) : q;

        const [lr, pr, cr] = await Promise.all([
          applyOrg(
            supabase.from('sales_leads')
              .select('id, org_name, inn, status, last_contact_at, created_at')
              .order('created_at', { ascending: false })
              .limit(2000)
          ),
          applyOrg(
            supabase.from('commercial_proposals')
              .select('id, company_name, company_inn, status, last_sent_at, first_viewed_at, created_at, total_amount')
              .is('deleted_at', null)
              .order('created_at', { ascending: false })
              .limit(1000)
          ),
          applyOrg(
            supabase.from('sales_contracts')
              .select('id, company_name, company_inn, status, created_at')
              .order('created_at', { ascending: false })
              .limit(1000)
          ),
        ]);

        if (cancelled) return;
        setLeads((lr.data || []) as LeadRow[]);
        setProposals((pr.data || []) as ProposalRow[]);
        setContracts((cr.data || []) as ContractRow[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [organizationId]);

  const segments = useMemo(() => {
    const now = new Date();
    const result: Record<SegmentKey, SegmentItem[]> = {
      hot: [], opened_no_reply: [], cold_30: [], no_touch_60: [],
      pending_signature: [], won_recent: [],
    };

    const dedupe = (arr: SegmentItem[]) => {
      const seen = new Set<string>();
      return arr.filter(it => {
        const k = `${it.inn || ''}|${it.name}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    };

    // Hot: lead in_progress + last_contact_at <= 7 дней + есть КП или договор
    const innHasProposal = new Set(proposals.map(p => p.company_inn).filter(Boolean) as string[]);
    const innHasContract = new Set(contracts.map(c => c.company_inn).filter(Boolean) as string[]);
    leads.forEach(l => {
      const lc = l.last_contact_at ? new Date(l.last_contact_at) : null;
      const days = lc ? differenceInDays(now, lc) : 999;
      const hasDocs = (l.inn && (innHasProposal.has(l.inn) || innHasContract.has(l.inn)));
      if (l.status === 'in_progress' && days <= 7 && hasDocs) {
        result.hot.push({
          inn: l.inn, name: l.org_name,
          reason: `Контакт ${days} дн. назад • есть документы`,
          daysAgo: days,
        });
      }
      if (l.status === 'in_progress' && days >= 14 && days < 60) {
        result.cold_30.push({
          inn: l.inn, name: l.org_name,
          reason: lc ? `Без контакта ${days} дн.` : 'Контакт ни разу не зафиксирован',
          daysAgo: days,
        });
      }
      if (days >= 60 && l.status !== 'won' && l.status !== 'not_interested') {
        result.no_touch_60.push({
          inn: l.inn, name: l.org_name,
          reason: `Заморожен ${days} дн.`,
          daysAgo: days,
        });
      }
    });

    // Opened CP, no reply: first_viewed_at есть, status='sent' или 'viewed', с последнего касания 3+ дн.
    proposals.forEach(p => {
      if (!p.first_viewed_at) return;
      if (!['sent', 'viewed'].includes(p.status)) return;
      const days = differenceInDays(now, new Date(p.first_viewed_at));
      if (days >= 3) {
        result.opened_no_reply.push({
          inn: p.company_inn, name: p.company_name,
          reason: `Открыли КП ${days} дн. назад`,
          daysAgo: days,
          amount: Number(p.total_amount || 0),
        });
      }
    });

    // Pending signature: договор в статусе sent / pending 3+ дн.
    contracts.forEach(c => {
      if (!['sent', 'pending', 'signing'].includes(c.status)) return;
      const days = differenceInDays(now, new Date(c.created_at));
      if (days >= 3) {
        result.pending_signature.push({
          inn: c.company_inn, name: c.company_name,
          reason: `Договор ждёт подписи ${days} дн.`,
          daysAgo: days,
        });
      }
    });

    // Won recent
    contracts.forEach(c => {
      if (!['signed', 'active', 'paid'].includes(c.status)) return;
      const days = differenceInDays(now, new Date(c.created_at));
      if (days <= 90) {
        result.won_recent.push({
          inn: c.company_inn, name: c.company_name,
          reason: `Подписан ${days} дн. назад`,
          daysAgo: days,
        });
      }
    });

    (Object.keys(result) as SegmentKey[]).forEach(k => {
      result[k] = dedupe(result[k]).sort((a, b) => (b.daysAgo || 0) - (a.daysAgo || 0));
    });

    return result;
  }, [leads, proposals, contracts]);

  const counts = useMemo(() => {
    const r: Record<SegmentKey, number> = {
      hot: 0, opened_no_reply: 0, cold_30: 0, no_touch_60: 0,
      pending_signature: 0, won_recent: 0,
    };
    (Object.keys(segments) as SegmentKey[]).forEach(k => { r[k] = segments[k].length; });
    return r;
  }, [segments]);

  const list = useMemo(() => {
    const items = segments[active] || [];
    if (!search.trim()) return items;
    const s = search.toLowerCase();
    return items.filter(it =>
      it.name.toLowerCase().includes(s) || (it.inn || '').includes(s)
    );
  }, [segments, active, search]);

  const activeDef = SEGMENT_DEFS.find(s => s.key === active)!;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Snowflake className="w-5 h-5 text-primary" />
            Авто-сегменты клиентов
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Автоматическая сегментация по активности и статусу. Кликните по карточке, чтобы увидеть список.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {SEGMENT_DEFS.map(def => {
              const Icon = def.icon;
              const isActive = active === def.key;
              return (
                <button
                  key={def.key}
                  onClick={() => setActive(def.key)}
                  className={cn(
                    'rounded-2xl border p-3 text-left transition-all hover:scale-[1.02]',
                    TONE_CLASSES[def.tone],
                    isActive && 'ring-2 ring-primary shadow-sm scale-[1.02]'
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <Icon className="w-4 h-4" />
                    <span className="text-xl font-bold">{counts[def.key]}</span>
                  </div>
                  <div className="text-xs font-semibold text-foreground">{def.title}</div>
                  <div className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{def.description}</div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between gap-3 space-y-0">
          <div className="flex items-center gap-2">
            <activeDef.icon className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">{activeDef.title}</CardTitle>
            <Badge variant="secondary" className="rounded-full">{counts[active]}</Badge>
          </div>
          <div className="relative w-64 max-w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию или ИНН"
              className="pl-9 h-9 rounded-xl"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          ) : list.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              {counts[active] === 0
                ? 'В этом сегменте пока пусто 👌'
                : 'Ничего не найдено по поиску'}
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
              {list.map((it, i) => (
                <button
                  key={`${it.inn || ''}-${i}`}
                  onClick={() => onOpenDeal?.(it.inn, it.name)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border hover:bg-muted/50 transition-colors text-left group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{it.name}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      {it.inn && <span className="font-mono">{it.inn}</span>}
                      {it.inn && <span>•</span>}
                      <Clock className="w-3 h-3" />
                      <span>{it.reason}</span>
                      {it.amount ? (
                        <>
                          <span>•</span>
                          <span className="font-medium text-foreground">
                            {it.amount.toLocaleString('ru-RU')} ₽
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
