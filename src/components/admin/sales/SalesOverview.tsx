import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  TrendingUp, AlertCircle, Flame, Trophy, Activity, Target,
  FileText, ScrollText, PenTool, Wallet, ArrowRight, Clock
} from 'lucide-react';
import { format, differenceInDays, startOfMonth, endOfMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import { SigmaSpinner } from '@/components/ui/SigmaSpinner';
import { cn } from '@/lib/utils';

interface OverviewData {
  monthRevenue: number;
  monthPlan: number;
  funnel: { leads: number; proposals: number; contracts: number; paid: number;
            leadsAmt: number; proposalsAmt: number; contractsAmt: number; paidAmt: number };
  alerts: {
    staleProposals: Array<{ id: string; company_name: string; total_amount: number; days: number }>;
    coldLeads: Array<{ id: string; org_name: string; days: number }>;
    pendingSignatures: Array<{ id: string; document_title: string; recipient_name: string; days: number }>;
  };
  topDeals: Array<{ inn: string; name: string; amount: number; stages: number }>;
  weekActivity: { calls: number; emails: number; meetings: number };
  leaderboard: Array<{ id: string; name: string; deals: number; revenue: number }>;
}

const MONTH_PLAN_DEFAULT = 500000; // ₽ — default plan

interface Props {
  onJump?: (tab: string) => void;
  organizationId?: string;
  /** какие из секций реально доступны при клике (если не указано — все) */
  availableSections?: string[];
}

export function SalesOverview({ onJump, organizationId, availableSections }: Props) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { void load(); }, [organizationId]);

  const safeJump = (tab: string) => {
    if (!availableSections || availableSections.includes(tab)) onJump?.(tab);
    else onJump?.('deals'); // fallback
  };

  async function load() {
    setLoading(true);
    try {
      const monthStart = startOfMonth(new Date()).toISOString();
      const monthEnd = endOfMonth(new Date()).toISOString();
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();

      const applyOrg = <T extends { eq: any }>(q: T, col = 'organization_id'): T =>
        organizationId ? q.eq(col, organizationId) : q;

      const [proposalsR, contractsR, leadsR, signaturesR, activitiesR, managersR] = await Promise.all([
        applyOrg(
          supabase.from('commercial_proposals')
            .select('id, company_inn, company_name, status, total_amount, created_at, last_sent_at, manager_id')
            .is('deleted_at', null)
            .gte('created_at', ninetyDaysAgo)
            .order('created_at', { ascending: false })
            .limit(1000)
        ),
        applyOrg(
          supabase.from('sales_contracts')
            .select('id, company_inn, company_name, status, total_amount, created_at')
            .gte('created_at', ninetyDaysAgo)
            .order('created_at', { ascending: false })
            .limit(1000)
        ),
        applyOrg(
          supabase.from('sales_leads')
            .select('id, org_name, status, last_contact_at, created_at')
            .order('created_at', { ascending: false })
            .limit(1000)
        ),
        applyOrg(
          supabase.from('document_signatures')
            .select('id, document_title, recipient_name, status, sent_at, created_at')
            .in('status', ['sent','viewed','in_review','changes_requested'])
            .order('created_at', { ascending: false })
            .limit(500)
        ),
        applyOrg(
          supabase.from('sales_lead_activities')
            .select('id, type, created_at')
            .gte('created_at', weekAgo)
            .limit(500)
        ),
        // sales_managers — глобальная таблица; для org покажем пусто (если RLS не пустит)
        organizationId
          ? Promise.resolve({ data: [] as any[], error: null }) as any
          : supabase.from('sales_managers').select('id, full_name'),
      ]);

      const proposals = proposalsR.data || [];
      const contracts = contractsR.data || [];
      const leads = leadsR.data || [];
      const signatures = signaturesR.data || [];
      const activities = activitiesR.data || [];
      const managers = managersR.data || [];

      // Plan/fact: paid contracts in current month
      const monthRevenue = contracts
        .filter((c: any) => ['signed','active','paid'].includes(c.status) && c.created_at >= monthStart && c.created_at <= monthEnd)
        .reduce((s: number, c: any) => s + Number(c.total_amount || 0), 0);

      // Funnel
      const leadsAmtAvg = 50000;
      const funnel = {
        leads: leads.length,
        leadsAmt: leads.length * leadsAmtAvg,
        proposals: proposals.filter((p: any) => p.status !== 'rejected').length,
        proposalsAmt: proposals.filter((p: any) => p.status !== 'rejected').reduce((s, p: any) => s + Number(p.total_amount || 0), 0),
        contracts: contracts.filter((c: any) => ['draft','sent','negotiation'].includes(c.status)).length,
        contractsAmt: contracts.filter((c: any) => ['draft','sent','negotiation'].includes(c.status)).reduce((s, c: any) => s + Number(c.total_amount || 0), 0),
        paid: contracts.filter((c: any) => ['signed','active','paid'].includes(c.status)).length,
        paidAmt: contracts.filter((c: any) => ['signed','active','paid'].includes(c.status)).reduce((s, c: any) => s + Number(c.total_amount || 0), 0),
      };

      // Alerts
      const now = new Date();
      const staleProposals = proposals
        .filter((p: any) => p.status === 'sent' && p.last_sent_at)
        .map((p: any) => ({ id: p.id, company_name: p.company_name, total_amount: Number(p.total_amount || 0),
                            days: differenceInDays(now, new Date(p.last_sent_at)) }))
        .filter(p => p.days >= 3)
        .sort((a, b) => b.days - a.days)
        .slice(0, 5);

      const coldLeads = leads
        .filter((l: any) => l.status === 'in_progress')
        .map((l: any) => ({ id: l.id, org_name: l.org_name,
                            days: differenceInDays(now, new Date(l.last_contact_at || l.created_at)) }))
        .filter(l => l.days >= 7)
        .sort((a, b) => b.days - a.days)
        .slice(0, 5);

      const pendingSignatures = signatures
        .map((s: any) => ({ id: s.id, document_title: s.document_title, recipient_name: s.recipient_name,
                            days: differenceInDays(now, new Date(s.sent_at || s.created_at)) }))
        .filter(s => s.days >= 2)
        .sort((a, b) => b.days - a.days)
        .slice(0, 5);

      // Top hot deals
      const dealMap = new Map<string, { name: string; amount: number; stages: number }>();
      proposals.forEach((p: any) => {
        const key = p.company_inn || p.company_name;
        const e = dealMap.get(key) || { name: p.company_name, amount: 0, stages: 0 };
        e.amount += Number(p.total_amount || 0);
        e.stages += 1;
        dealMap.set(key, e);
      });
      contracts.forEach((c: any) => {
        const key = c.company_inn || c.company_name;
        const e = dealMap.get(key) || { name: c.company_name, amount: 0, stages: 0 };
        e.amount += Number(c.total_amount || 0);
        e.stages += 1;
        dealMap.set(key, e);
      });
      const topDeals = Array.from(dealMap.entries())
        .map(([inn, v]) => ({ inn, ...v }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      // Week activity
      const weekActivity = {
        calls: activities.filter((a: any) => a.type === 'call').length,
        emails: activities.filter((a: any) => a.type === 'email').length,
        meetings: activities.filter((a: any) => a.type === 'meeting').length,
      };

      // Leaderboard
      const mgrMap = new Map<string, { name: string; deals: number; revenue: number }>();
      managers.forEach((m: any) => mgrMap.set(m.id, { name: m.full_name, deals: 0, revenue: 0 }));
      proposals.forEach((p: any) => {
        if (!p.manager_id) return;
        const e = mgrMap.get(p.manager_id);
        if (e && p.status === 'accepted') { e.deals += 1; e.revenue += Number(p.total_amount || 0); }
      });
      const leaderboard = Array.from(mgrMap.entries())
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      setData({
        monthRevenue, monthPlan: MONTH_PLAN_DEFAULT,
        funnel, alerts: { staleProposals, coldLeads, pendingSignatures },
        topDeals, weekActivity, leaderboard,
      });
    } catch (e) {
      console.error('SalesOverview load', e);
    } finally {
      setLoading(false);
    }
  }

  if (loading || !data) {
    return <div className="flex justify-center py-12"><SigmaSpinner size="lg" /></div>;
  }

  const planPct = Math.min(100, Math.round((data.monthRevenue / data.monthPlan) * 100));
  const totalAlerts = data.alerts.staleProposals.length + data.alerts.coldLeads.length + data.alerts.pendingSignatures.length;
  const hideLeaderboard = !!organizationId && data.leaderboard.length === 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          Обзор продаж
        </h2>
        <p className="text-sm text-muted-foreground">Главное по продажам на сегодня</p>
      </div>

      {/* Top row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="rounded-2xl">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">План на месяц</span>
              <Badge variant={planPct >= 100 ? 'default' : 'secondary'} className="rounded-lg">
                {planPct}%
              </Badge>
            </div>
            <div>
              <div className="text-3xl font-semibold">{data.monthRevenue.toLocaleString('ru-RU')} ₽</div>
              <div className="text-xs text-muted-foreground mt-1">из {data.monthPlan.toLocaleString('ru-RU')} ₽</div>
            </div>
            <Progress value={planPct} className="h-2" />
            <div className="text-xs text-muted-foreground">
              {format(new Date(), 'LLLL yyyy', { locale: ru })}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl lg:col-span-2">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Воронка денег</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <FunnelStage icon={FileText} label="Лиды" count={data.funnel.leads} amount={data.funnel.leadsAmt} tone="muted" />
              <FunnelStage icon={FileText} label="КП" count={data.funnel.proposals} amount={data.funnel.proposalsAmt} tone="info" />
              <FunnelStage icon={ScrollText} label="Договоры" count={data.funnel.contracts} amount={data.funnel.contractsAmt} tone="amber" />
              <FunnelStage icon={Wallet} label="Оплачено" count={data.funnel.paid} amount={data.funnel.paidAmt} tone="success" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Middle row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="rounded-2xl">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-medium">Требуют действия сегодня</span>
              </div>
              <Badge variant="outline" className="rounded-lg">{totalAlerts}</Badge>
            </div>
            <ScrollArea className="h-[260px]">
              <div className="space-y-2 pr-2">
                {data.alerts.staleProposals.map(p => (
                  <AlertRow key={p.id}
                    title={p.company_name}
                    subtitle={`КП без ответа ${p.days} ${pluralDays(p.days)} • ${p.total_amount.toLocaleString('ru-RU')} ₽`}
                    icon={FileText} tone="amber"
                    onClick={() => safeJump('proposals')}
                  />
                ))}
                {data.alerts.coldLeads.map(l => (
                  <AlertRow key={l.id}
                    title={l.org_name}
                    subtitle={`Без касания ${l.days} ${pluralDays(l.days)}`}
                    icon={Clock} tone="rose"
                    onClick={() => safeJump('companies')}
                  />
                ))}
                {data.alerts.pendingSignatures.map(s => (
                  <AlertRow key={s.id}
                    title={s.document_title}
                    subtitle={`${s.recipient_name} • на подписи ${s.days} ${pluralDays(s.days)}`}
                    icon={PenTool} tone="info"
                    onClick={() => safeJump('signing')}
                  />
                ))}
                {totalAlerts === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    🎉 Нет просроченных дел
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-medium">Топ-5 горячих сделок</span>
            </div>
            <ScrollArea className="h-[260px]">
              <div className="space-y-2 pr-2">
                {data.topDeals.map((d, i) => (
                  <button key={d.inn}
                    onClick={() => safeJump('deals')}
                    className="w-full text-left p-3 rounded-xl border hover:bg-muted/30 transition-colors flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold shrink-0",
                      i === 0 ? "bg-amber-500/10 text-amber-600" :
                      i === 1 ? "bg-slate-400/20 text-slate-600 dark:text-slate-300" :
                      i === 2 ? "bg-orange-500/10 text-orange-600" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{d.name}</div>
                      <div className="text-xs text-muted-foreground">{d.stages} этапов</div>
                    </div>
                    <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                      {d.amount.toLocaleString('ru-RU')} ₽
                    </div>
                  </button>
                ))}
                {data.topDeals.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">Пока нет сделок</div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className={cn("grid grid-cols-1 gap-4", !hideLeaderboard && "lg:grid-cols-2")}>
        <Card className="rounded-2xl">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Активность за неделю</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <ActivityStat label="Звонки" value={data.weekActivity.calls} />
              <ActivityStat label="Письма" value={data.weekActivity.emails} />
              <ActivityStat label="Встречи" value={data.weekActivity.meetings} />
            </div>
          </CardContent>
        </Card>

        {!hideLeaderboard && (
          <Card className="rounded-2xl">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium">Лидерборд менеджеров</span>
              </div>
              <div className="space-y-1.5">
                {data.leaderboard.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-6">Нет данных по менеджерам</div>
                )}
                {data.leaderboard.map((m, i) => (
                  <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/30">
                    <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                    <span className="text-sm flex-1 truncate">{m.name}</span>
                    <span className="text-xs text-muted-foreground">{m.deals} сделок</span>
                    <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                      {m.revenue.toLocaleString('ru-RU')} ₽
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function FunnelStage({ icon: Icon, label, count, amount, tone }:
  { icon: any; label: string; count: number; amount: number; tone: 'muted' | 'info' | 'amber' | 'success' }) {
  const toneCls = {
    muted: 'bg-muted/50 border-border',
    info: 'bg-blue-500/10 border-blue-500/30',
    amber: 'bg-amber-500/10 border-amber-500/30',
    success: 'bg-emerald-500/10 border-emerald-500/30',
  }[tone];
  const iconCls = {
    muted: 'text-muted-foreground',
    info: 'text-blue-600 dark:text-blue-400',
    amber: 'text-amber-600 dark:text-amber-400',
    success: 'text-emerald-600 dark:text-emerald-400',
  }[tone];
  return (
    <div className={cn("p-3 rounded-xl border space-y-1", toneCls)}>
      <Icon className={cn("w-4 h-4", iconCls)} />
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{count}</div>
      <div className="text-[11px] text-muted-foreground truncate">
        {amount > 0 ? `${(amount / 1000).toFixed(0)} тыс ₽` : '—'}
      </div>
    </div>
  );
}

function AlertRow({ title, subtitle, icon: Icon, tone, onClick }:
  { title: string; subtitle: string; icon: any; tone: 'amber' | 'rose' | 'info'; onClick?: () => void }) {
  const toneCls = {
    amber: 'border-amber-500/20 hover:bg-amber-500/5',
    rose: 'border-rose-500/20 hover:bg-rose-500/5',
    info: 'border-blue-500/20 hover:bg-blue-500/5',
  }[tone];
  const iconCls = {
    amber: 'text-amber-600 dark:text-amber-400',
    rose: 'text-rose-600 dark:text-rose-400',
    info: 'text-blue-600 dark:text-blue-400',
  }[tone];
  return (
    <button onClick={onClick}
      className={cn("w-full text-left p-2.5 rounded-xl border transition-colors flex items-start gap-2.5", toneCls)}>
      <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", iconCls)} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground mt-1 shrink-0" />
    </button>
  );
}

function ActivityStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center p-3 rounded-xl bg-muted/30 border border-border">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function pluralDays(n: number) {
  const m = Math.abs(n) % 100;
  const last = m % 10;
  if (m >= 11 && m <= 14) return 'дн.';
  if (last === 1) return 'день';
  if (last >= 2 && last <= 4) return 'дня';
  return 'дн.';
}
