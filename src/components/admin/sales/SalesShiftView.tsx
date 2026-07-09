import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSalesManager, type SalesLead } from '@/hooks/useSalesManager';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationNext, PaginationPrevious,
} from '@/components/ui/pagination';
import { Clock, MapPin, Sparkles, CheckCircle2, Stethoscope } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ColdCallScriptCard } from './ColdCallScriptCard';
import { CompanyDrawer } from './CompanyDrawer';
import { TestCallDialog } from './TestCallDialog';
import { buildShiftQueue, parseDailyPlan, planForManager } from '@/utils/salesShiftQueue';
import { getAdminSalesView } from '@/utils/adminViewMode';

const DOZVON_MIN_SEC = 15;
const PAGE_SIZE = 10;

/** Статусы, которые считаем «финальной обработкой сегодня». */
const PROCESSED_STATUSES = new Set([
  'not_interested', 'proposal_sent', 'contract_sent',
  'won', 'lost', 'demo_scheduled', 'callback_later',
]);

interface Props {
  onCreateProposal?: (c: { name: string; inn: string }) => void;
  onCreateContract?: (c: { name: string; inn: string }) => void;
}

export function SalesShiftView({ onCreateProposal, onCreateContract }: Props) {
  const { user } = useAuth();
  const { leads, fetchLeads } = useSalesManager();
  const viewAs = useMemo(() => getAdminSalesView(), []);

  const [managerId, setManagerId] = useState<string | null>(null);
  const [managerName, setManagerName] = useState<string>('');
  const [managerPhone, setManagerPhone] = useState<string>('');
  const [dailyPlan, setDailyPlan] = useState<number>(80);
  const [dozvonyToday, setDozvonyToday] = useState<number>(0);
  const [callsToday, setCallsToday] = useState<number>(0);
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());
  const [touchHistory, setTouchHistory] = useState<Map<string, Array<{ type: string; desc: string; at: string }>>>(new Map());
  const [testCallOpen, setTestCallOpen] = useState(false);
  const [tab, setTab] = useState<'active' | 'done'>('done');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SalesLead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 1. Загрузка лидов
  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // Эффективный user_id для счётчиков — под impersonation это менеджер, иначе сам user.
  const effectiveUserId = viewAs?.userId || user?.id || null;

  // 2. Профиль менеджера + план + счётчики
  useEffect(() => {
    if (!user) return;
    (async () => {
      // Если админ импресонирует — берём данные менеджера напрямую.
      if (viewAs?.managerId) {
        const [mgrR, planR, profR] = await Promise.all([
          (supabase as any).from('sales_managers').select('id, full_name, phone').eq('id', viewAs.managerId).maybeSingle(),
          (supabase as any).from('app_settings').select('setting_value').eq('setting_key', 'sales_daily_plan').maybeSingle(),
          viewAs.userId
            ? (supabase as any).from('profiles').select('full_name, phone').eq('user_id', viewAs.userId).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        const mgr = mgrR?.data;
        const prof = profR?.data;
        setManagerId(viewAs.managerId);
        const rawName = (mgr?.full_name || prof?.full_name || viewAs.fullName || '').trim();
        setManagerName(rawName.split(/\s+/)[0] || '');
        setManagerPhone(mgr?.phone || prof?.phone || '');
        const cfg = parseDailyPlan(planR?.data?.setting_value);
        setDailyPlan(planForManager(cfg, viewAs.managerId));
        await refreshCounters(viewAs.managerId, viewAs.userId || user.id);
        await loadProcessed(viewAs.managerId);
        return;
      }

      const [mgrR, planR, profR] = await Promise.all([
        (supabase as any).from('sales_managers').select('id, full_name, phone').eq('user_id', user.id).maybeSingle(),
        (supabase as any).from('app_settings').select('setting_value').eq('setting_key', 'sales_daily_plan').maybeSingle(),
        (supabase as any).from('profiles').select('full_name, phone').eq('user_id', user.id).maybeSingle(),
      ]);

      const mgr = mgrR?.data;
      const prof = profR?.data;
      if (mgr) setManagerId(mgr.id);

      const rawName = (mgr?.full_name || prof?.full_name || '').trim()
        || (user.email ? user.email.split('@')[0] : '');
      const firstName = rawName.split(/\s+/)[0] || '';
      setManagerName(firstName);
      setManagerPhone(mgr?.phone || prof?.phone || '');

      const cfg = parseDailyPlan(planR?.data?.setting_value);
      setDailyPlan(planForManager(cfg, mgr?.id || null));

      await refreshCounters(mgr?.id || null, user.id);
      await loadProcessed(mgr?.id || null);
    })();
  }, [user, viewAs?.managerId, viewAs?.userId]);

  const refreshCounters = async (mid: string | null, uid: string) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const iso = startOfDay.toISOString();

    // Кол-во инициированных звонков за день считаем по call_logs (без тестовых).
    // Раньше считали по sales_lead_activities → задвоения от ручных заметок в диалоге «Результат звонка».
    const { count: callsCount } = await (supabase as any)
      .from('call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('manager_user_id', uid)
      .gte('started_at', iso)
      .or('notes.is.null,notes.neq.__test_call__');
    setCallsToday(callsCount || 0);

    const { count: dz } = await (supabase as any)
      .from('call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('manager_user_id', uid)
      .gte('started_at', iso)
      .gte('duration_sec', DOZVON_MIN_SEC)
      .or('notes.is.null,notes.neq.__test_call__');
    setDozvonyToday(dz || 0);
  };

  const loadProcessed = useCallback(async (mid: string | null) => {
    if (!mid) { setProcessedIds(new Set()); setTouchHistory(new Map()); return; }
    const { data } = await (supabase as any)
      .from('sales_lead_activities')
      .select('lead_id, activity_type, description, created_at')
      .eq('manager_id', mid)
      .order('created_at', { ascending: false })
      .limit(5000);
    const ids = new Set<string>();
    const map = new Map<string, Array<{ type: string; desc: string; at: string }>>();
    (data || []).forEach((r: any) => {
      if (!r.lead_id) return;
      ids.add(r.lead_id);
      const list = map.get(r.lead_id) || [];
      if (list.length < 8) list.push({ type: r.activity_type, desc: r.description || '', at: r.created_at });
      map.set(r.lead_id, list);
    });
    setProcessedIds(ids);
    setTouchHistory(map);
  }, []);

  // Realtime
  useEffect(() => {
    if (!effectiveUserId) return;
    const ch = supabase
      .channel(`sales-shift-counters-${effectiveUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_logs', filter: `manager_user_id=eq.${effectiveUserId}` },
        () => refreshCounters(managerId, effectiveUserId))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales_lead_activities' },
        () => { refreshCounters(managerId, effectiveUserId); loadProcessed(managerId); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [effectiveUserId, managerId, loadProcessed]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const queue = useMemo(() => {
    void tick;
    const mine = managerId
      ? leads.filter(l => !l.assigned_manager_id || l.assigned_manager_id === managerId)
      : leads;
    const built = buildShiftQueue(mine);
    const isTest = (name?: string | null) => !!name && /\(тест\)/i.test(name);
    const pinned = built.filter(q => isTest(q.lead.org_name));
    const rest = built.filter(q => !isTest(q.lead.org_name));
    return [...pinned, ...rest];
  }, [leads, managerId, tick]);

  const isProcessed = useCallback((l: SalesLead) => {
    if (processedIds.has(l.id)) return true;
    // Финальные статусы считаем обработанными независимо от даты
    if (PROCESSED_STATUSES.has(l.status)) return true;
    return false;
  }, [processedIds]);

  const activeQueue = useMemo(() => queue.filter(q => !isProcessed(q.lead)), [queue, isProcessed]);
  // Обработанные показываем из ВСЕХ моих лидов (не ограничиваясь рабочим окном 09–18),
  // чтобы после перезахода менеджер видел ранее отработанные компании.
  const doneQueue = useMemo(() => {
    const mine = managerId
      ? leads.filter(l => !l.assigned_manager_id || l.assigned_manager_id === managerId)
      : leads;
    return mine
      .filter(l => isProcessed(l))
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
      .map(l => ({ lead: l, localTime: null, mskLabel: null, minutesUntilClose: Infinity, hasTimezone: false }));
  }, [leads, managerId, isProcessed]);

  const currentList = tab === 'active' ? activeQueue : doneQueue;
  const totalPages = Math.max(1, Math.ceil(currentList.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = currentList.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [tab]);

  const remaining = Math.max(0, dailyPlan - dozvonyToday);
  const progressPct = Math.min(100, Math.round((dozvonyToday / Math.max(1, dailyPlan)) * 100));

  const firstLead = activeQueue[0]?.lead ?? null;

  const openLead = (lead: SalesLead) => {
    setSelected(lead);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className={cn(drawerOpen && 'hidden')}>
      {/* Приветствие + план */}

      <Card className="rounded-2xl border-primary/10 bg-gradient-to-br from-primary/5 via-transparent to-transparent">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl lg:text-2xl font-semibold">
                Привет{managerName ? `, ${managerName}` : ''}! <span className="text-muted-foreground font-normal">👋</span>
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Сегодня у тебя <strong className="text-foreground">{dailyPlan}</strong> дозвонов ·
                сделано <strong className="text-foreground">{dozvonyToday}</strong> ·
                осталось <strong className="text-foreground">{remaining}</strong>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Звонков за день: <strong className="text-foreground">{callsToday}</strong>
                <span className="mx-1">·</span>
                дозвон = разговор от {DOZVON_MIN_SEC} сек
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="rounded-full text-xs">
                <Sparkles className="w-3 h-3 mr-1" /> Смена
              </Badge>
            </div>
          </div>
          <div>
            <Progress value={progressPct} className="h-2" />
            <div className="mt-1 text-[11px] text-muted-foreground text-right">{progressPct}%</div>
          </div>
        </CardContent>
      </Card>

      <TestCallDialog
        open={testCallOpen}
        onOpenChange={setTestCallOpen}
        defaultPhone={managerPhone}
      />

      {/* Скрипт первого касания */}
      <ColdCallScriptCard
        leadName={firstLead?.org_name}
        managerName={managerName}
      />

      {/* Лента */}
      <Card className="rounded-2xl">
        <CardContent className="p-4 lg:p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div>
              <h3 className="text-base font-semibold">
                {tab === 'active' ? 'Кому звонить сейчас' : 'Обработано сегодня'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {tab === 'active'
                  ? 'Отсортировано по местному времени 09:00–18:00 · нажмите на карточку, чтобы открыть'
                  : 'Лиды, по которым сегодня уже была активность'}
              </p>
            </div>
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'active' | 'done')}>
              <TabsList>
                <TabsTrigger value="active">В работе · {activeQueue.length}</TabsTrigger>
                <TabsTrigger value="done">Обработано · {doneQueue.length}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {currentList.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {tab === 'active'
                ? 'Пока никого — либо ещё рано, либо все регионы уже закрылись. Загляни в «Компании», чтобы взять новые лиды в работу.'
                : 'Сегодня пока не обработано ни одного лида.'}
            </div>
          ) : (
            <ScrollArea className="max-h-[520px]">
              <div className="space-y-2">
                {pageItems.map(({ lead, localTime, mskLabel, minutesUntilClose, hasTimezone }, idx) => {
                  const isHot = tab === 'active' && hasTimezone && minutesUntilClose <= 90;
                  const done = tab === 'done';
                  return (
                    <div
                      key={lead.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openLead(lead)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openLead(lead);
                        }
                      }}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border p-3 transition cursor-pointer',
                        'hover:bg-muted/50 hover:border-primary/40 hover:shadow-sm',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                        isHot && 'border-amber-500/40 bg-amber-500/5',
                        done && 'opacity-80'
                      )}
                    >
                      <div className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium shrink-0',
                        done ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'
                      )}>
                        {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : (currentPage - 1) * PAGE_SIZE + idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="font-medium truncate">{lead.org_name}</div>
                          <TouchDots touches={touchHistory.get(lead.id)} />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                          {lead.region && (
                            <span className="flex items-center gap-1 truncate max-w-[200px]">
                              <MapPin className="w-3 h-3 shrink-0" />{lead.region}
                            </span>
                          )}
                          {localTime && (
                            <Badge
                              variant={isHot ? 'destructive' : 'secondary'}
                              className="rounded-full h-5 px-2 text-[10px] font-medium"
                            >
                              <Clock className="w-3 h-3 mr-1" />
                              {localTime} · {mskLabel}
                              {isHot && ` · до конца ${minutesUntilClose} мин`}
                            </Badge>
                          )}
                          {done && lead.status && (
                            <Badge variant="outline" className="rounded-full h-5 px-2 text-[10px] font-medium">
                              {lead.status}
                            </Badge>
                          )}
                          {lead.phone && <span className="truncate">{lead.phone}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex justify-center">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={(e) => { e.preventDefault(); setPage(p => Math.max(1, p - 1)); }}
                      className={cn(currentPage === 1 && 'pointer-events-none opacity-50', 'cursor-pointer')}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }).slice(0, 7).map((_, i) => {
                    const n = i + 1;
                    return (
                      <PaginationItem key={n}>
                        <PaginationLink
                          isActive={n === currentPage}
                          onClick={(e) => { e.preventDefault(); setPage(n); }}
                          className="cursor-pointer"
                        >
                          {n}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  <PaginationItem>
                    <PaginationNext
                      onClick={(e) => { e.preventDefault(); setPage(p => Math.min(totalPages, p + 1)); }}
                      className={cn(currentPage === totalPages && 'pointer-events-none opacity-50', 'cursor-pointer')}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>
      </div>

      <CompanyDrawer

        lead={selected}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        managerName={managerName}
        managerPhone={managerPhone}
        onCreateProposal={onCreateProposal ? (l) => onCreateProposal({ name: l.org_name, inn: l.inn || '' }) : undefined}
        onCreateContract={onCreateContract ? (l) => onCreateContract({ name: l.org_name, inn: l.inn || '' }) : undefined}
        onSaveAndNext={() => {
          setCallsToday(x => x + 1);
          setDrawerOpen(false);
          // realtime подтянет processedIds — но локально сразу пометим как обработанный
          if (selected) {
            setProcessedIds(prev => {
              const next = new Set(prev);
              next.add(selected.id);
              return next;
            });
          }
        }}
      />
    </div>
  );
}
