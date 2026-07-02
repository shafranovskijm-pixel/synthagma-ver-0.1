import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSalesManager, type SalesLead } from '@/hooks/useSalesManager';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationNext, PaginationPrevious,
} from '@/components/ui/pagination';
import { Phone, ExternalLink, Clock, MapPin, Sparkles, PhoneCall } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ColdCallScriptCard } from './ColdCallScriptCard';
import { CompanyDrawer } from './CompanyDrawer';
import { buildShiftQueue, parseDailyPlan, planForManager } from '@/utils/salesShiftQueue';
import { toast } from 'sonner';


const PAGE_SIZE = 10;

interface Props {
  onCreateProposal?: (c: { name: string; inn: string }) => void;
  onCreateContract?: (c: { name: string; inn: string }) => void;
}

export function SalesShiftView({ onCreateProposal, onCreateContract }: Props) {
  const { user } = useAuth();
  const { leads, fetchLeads } = useSalesManager();

  const [managerId, setManagerId] = useState<string | null>(null);
  const [managerName, setManagerName] = useState<string>('коллега');
  const [dailyPlan, setDailyPlan] = useState<number>(80);
  const [doneToday, setDoneToday] = useState<number>(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SalesLead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 1. Загрузка лидов
  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // 2. Профиль менеджера + план + сделанные сегодня
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [mgrR, planR] = await Promise.all([
        (supabase as any).from('sales_managers').select('id, full_name').eq('user_id', user.id).maybeSingle(),
        (supabase as any).from('app_settings').select('setting_value').eq('setting_key', 'sales_daily_plan').maybeSingle(),
      ]);

      const mgr = mgrR?.data;
      if (mgr) {
        setManagerId(mgr.id);
        // короткое имя — до первого пробела
        const firstName = (mgr.full_name || '').trim().split(/\s+/)[0] || 'коллега';
        setManagerName(firstName);
      }
      const cfg = parseDailyPlan(planR?.data?.setting_value);
      setDailyPlan(planForManager(cfg, mgr?.id || null));

      // Сколько звонков сегодня
      if (mgr?.id) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const { count } = await (supabase as any)
          .from('sales_lead_activities')
          .select('id', { count: 'exact', head: true })
          .eq('manager_id', mgr.id)
          .eq('activity_type', 'call')
          .gte('created_at', startOfDay.toISOString());
        setDoneToday(count || 0);
      }
    })();
  }, [user]);

  // 3. Очередь на сейчас — пересчитывается каждую минуту (для местного времени)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const queue = useMemo(() => {
    void tick;
    // Только «мои» лиды (или неназначенные) — если у меня есть managerId.
    const mine = managerId
      ? leads.filter(l => !l.assigned_manager_id || l.assigned_manager_id === managerId)
      : leads;
    return buildShiftQueue(mine);
  }, [leads, managerId, tick]);

  const totalPages = Math.max(1, Math.ceil(queue.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = queue.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const remaining = Math.max(0, dailyPlan - doneToday);
  const progressPct = Math.min(100, Math.round((doneToday / Math.max(1, dailyPlan)) * 100));

  const firstLead = pageItems[0]?.lead ?? null;

  const openLead = (lead: SalesLead) => {
    setSelected(lead);
    setDrawerOpen(true);
  };

  const handleCall = async (lead: SalesLead) => {
    if (!lead.phone) { openLead(lead); return; }
    try {
      const { data, error } = await supabase.functions.invoke("novofon-call-start", {
        body: {
          to_number: lead.phone,
          lead_id: lead.id,
          company_inn: lead.inn ?? null,
          company_name: lead.org_name ?? null,
        },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success("Звоним", { description: "Ответьте на своём телефоне — Novofon соединит с клиентом." });
      } else {
        toast.error("Не удалось запустить звонок", { description: data?.novofon?.message || "Проверьте настройки Novofon" });
      }
    } catch (e) {
      toast.error("Ошибка звонка", { description: e instanceof Error ? e.message : String(e) });
    }
    openLead(lead);
  };


  return (
    <div className="space-y-4">
      {/* Приветствие + план */}
      <Card className="rounded-2xl border-primary/10 bg-gradient-to-br from-primary/5 via-transparent to-transparent">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl lg:text-2xl font-semibold">
                Привет, {managerName}! <span className="text-muted-foreground font-normal">👋</span>
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Сегодня у тебя <strong className="text-foreground">{dailyPlan}</strong> дозвонов ·
                сделано <strong className="text-foreground">{doneToday}</strong> ·
                осталось <strong className="text-foreground">{remaining}</strong>
              </p>
            </div>
            <Badge variant="secondary" className="rounded-full text-xs">
              <Sparkles className="w-3 h-3 mr-1" /> Смена
            </Badge>
          </div>
          <div>
            <Progress value={progressPct} className="h-2" />
            <div className="mt-1 text-[11px] text-muted-foreground text-right">{progressPct}%</div>
          </div>
        </CardContent>
      </Card>

      {/* Скрипт первого касания */}
      <ColdCallScriptCard
        leadName={firstLead?.org_name}
        managerName={managerName}
      />

      {/* Лента «Кому звонить сейчас» */}
      <Card className="rounded-2xl">
        <CardContent className="p-4 lg:p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div>
              <h3 className="text-base font-semibold">Кому звонить сейчас</h3>
              <p className="text-xs text-muted-foreground">
                Отсортировано по местному времени 09:00–18:00 · сначала где день скоро закончится
              </p>
            </div>
            <Badge variant="outline" className="rounded-full">
              {queue.length} в очереди
            </Badge>
          </div>

          {queue.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Пока никого — либо ещё рано, либо все регионы уже закрылись.
              Загляни в раздел «Компании», чтобы взять новые лиды в работу.
            </div>
          ) : (
            <ScrollArea className="max-h-[520px]">
              <div className="space-y-2">
                {pageItems.map(({ lead, localTime, mskLabel, minutesUntilClose, hasTimezone }, idx) => {
                  const isHot = hasTimezone && minutesUntilClose <= 90;
                  return (
                    <div
                      key={lead.id}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border p-3 hover:bg-muted/40 transition',
                        isHot && 'border-amber-500/40 bg-amber-500/5'
                      )}
                    >
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[11px] font-medium text-muted-foreground shrink-0">
                        {(currentPage - 1) * PAGE_SIZE + idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{lead.org_name}</div>
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
                          {lead.phone && <span className="truncate">{lead.phone}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant="default"
                          className="rounded-lg h-8"
                          onClick={() => handleCall(lead)}
                          disabled={!lead.phone}
                        >
                          <Phone className="w-3.5 h-3.5 mr-1" />
                          Позвонить
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-lg h-8"
                          onClick={() => openLead(lead)}
                          aria-label="Открыть карточку"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          {/* Пагинация по 10 */}
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

      <CompanyDrawer
        lead={selected}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        managerName={managerName}
        onCreateProposal={onCreateProposal ? (l) => onCreateProposal({ name: l.org_name, inn: l.inn || '' }) : undefined}
        onCreateContract={onCreateContract ? (l) => onCreateContract({ name: l.org_name, inn: l.inn || '' }) : undefined}
        onSaveAndNext={() => {
          // Обновим счётчик сделанных звонков и перейдём к следующему
          setDoneToday(x => x + 1);
          setDrawerOpen(false);
          // если на текущей странице ещё есть лиды — просто закроем drawer;
          // иначе перейдём на следующую
          const remainingOnPage = pageItems.length - 1;
          if (remainingOnPage <= 0 && currentPage < totalPages) setPage(currentPage + 1);
        }}
      />
    </div>
  );
}
