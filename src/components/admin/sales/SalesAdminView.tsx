import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Users, PhoneCall, FileText, Database, Save } from 'lucide-react';
import { toast } from 'sonner';
import { SalesManagersList } from './SalesManagersList';
import { LeadsManager } from './LeadsManager';
import { useSalesManager } from '@/hooks/useSalesManager';
import { parseDailyPlan, planForManager, type DailyPlanConfig } from '@/utils/salesShiftQueue';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

/**
 * Простой админский экран «Продажи» для /admin.
 *
 * Здесь НЕТ shift-виджета менеджера — только то, что нужно админу:
 *  - KPI по продажам сегодня
 *  - редактор плана дозвонов (общий и по каждому менеджеру)
 *  - список менеджеров с логинами / сбросом пароля / «войти как»
 *  - счётчик базы лидов и быстрый вход в полный список
 */
export function SalesAdminView() {
  const { managers, fetchManagers, leads, fetchLeads, proposals, fetchProposals } = useSalesManager();
  const [plan, setPlan] = useState<DailyPlanConfig>({ default: 80, byManager: {} });
  const [defaultPlanInput, setDefaultPlanInput] = useState<string>('80');
  const [perManagerInput, setPerManagerInput] = useState<Record<string, string>>({});
  const [savingPlan, setSavingPlan] = useState(false);
  const [callsToday, setCallsToday] = useState(0);
  const [leadsSheetOpen, setLeadsSheetOpen] = useState(false);

  useEffect(() => { fetchManagers(); fetchLeads(); fetchProposals(); }, [fetchManagers, fetchLeads, fetchProposals]);

  // Загрузить план дозвонов
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from('app_settings').select('setting_value').eq('setting_key', 'sales_daily_plan').maybeSingle();
      const cfg = parseDailyPlan(data?.setting_value);
      setPlan(cfg);
      setDefaultPlanInput(String(cfg.default));
      setPerManagerInput(Object.fromEntries(Object.entries(cfg.byManager).map(([k, v]) => [k, String(v)])));
    })();
  }, []);

  // Дозвоны за сегодня
  useEffect(() => {
    (async () => {
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const { count } = await (supabase as any)
        .from('call_logs').select('id', { count: 'exact', head: true })
        .gte('started_at', startOfDay.toISOString())
        .gte('duration_sec', 15)
        .or('notes.is.null,notes.neq.__test_call__');
      setCallsToday(count || 0);
    })();
  }, []);

  const activeManagers = useMemo(() => managers.filter(m => m.is_active), [managers]);

  const leadsStats = useMemo(() => {
    const total = leads.length;
    const assigned = leads.filter(l => l.assigned_manager_id).length;
    const free = total - assigned;
    return { total, assigned, free };
  }, [leads]);

  const proposalsThisWeek = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    return proposals.filter((p: any) => new Date(p.created_at).getTime() >= weekAgo).length;
  }, [proposals]);

  const savePlan = async () => {
    setSavingPlan(true);
    try {
      const value: DailyPlanConfig = {
        default: Math.max(1, Math.min(1000, Number(defaultPlanInput) || 80)),
        byManager: Object.fromEntries(
          Object.entries(perManagerInput)
            .map(([k, v]) => [k, Math.max(0, Math.min(1000, Number(v) || 0))])
            .filter(([, v]) => Number(v) > 0)
        ),
      };
      const { error } = await (supabase as any)
        .from('app_settings')
        .upsert({ setting_key: 'sales_daily_plan', setting_value: value }, { onConflict: 'setting_key' });
      if (error) throw error;
      setPlan(value);
      toast.success('План дозвонов сохранён');
    } catch (e: any) {
      toast.error('Не удалось сохранить план', { description: e?.message });
    } finally {
      setSavingPlan(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={<Users className="w-4 h-4" />} label="Менеджеров активно" value={activeManagers.length} />
        <KpiCard icon={<Database className="w-4 h-4" />} label="Лидов в базе" value={leadsStats.total} sub={`свободно ${leadsStats.free} · назначено ${leadsStats.assigned}`} />
        <KpiCard icon={<PhoneCall className="w-4 h-4" />} label="Дозвонов сегодня" value={callsToday} sub={`≥ 15 сек — реальные разговоры`} />
        <KpiCard icon={<FileText className="w-4 h-4" />} label="КП за неделю" value={proposalsThisWeek} />
      </div>

      {/* План дозвонов */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PhoneCall className="w-4 h-4" /> План дозвонов на день
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <Label className="text-xs text-muted-foreground">По умолчанию для всех</Label>
              <Input
                type="number"
                min={1}
                max={1000}
                value={defaultPlanInput}
                onChange={e => setDefaultPlanInput(e.target.value)}
                className="w-32"
              />
            </div>
            <Button onClick={savePlan} disabled={savingPlan} size="sm">
              <Save className="w-4 h-4 mr-1" />{savingPlan ? 'Сохраняю…' : 'Сохранить'}
            </Button>
          </div>

          {managers.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Индивидуальный план (перекрывает «по умолчанию»). Оставьте 0, чтобы использовать общий план.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {managers.map(m => (
                  <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{m.full_name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        сейчас: {planForManager(plan, m.id)} дозвонов/день
                      </div>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={1000}
                      value={perManagerInput[m.id] ?? ''}
                      placeholder="0"
                      onChange={e => setPerManagerInput(prev => ({ ...prev, [m.id]: e.target.value }))}
                      className="w-24"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Менеджеры (логины, пароли, история, войти как) */}
      <Card>
        <CardContent className="pt-6">
          <SalesManagersList />
        </CardContent>
      </Card>

      {/* База лидов */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4" /> База лидов
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="secondary">Всего: {leadsStats.total}</Badge>
            <Badge variant="outline">Свободных: {leadsStats.free}</Badge>
            <Badge variant="outline">Назначено: {leadsStats.assigned}</Badge>
          </div>
          <Button onClick={() => setLeadsSheetOpen(true)} className="w-full sm:w-auto">
            Открыть полный список лидов
          </Button>
        </CardContent>
      </Card>

      <Sheet open={leadsSheetOpen} onOpenChange={setLeadsSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-6xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>База лидов</SheetTitle>
          </SheetHeader>
          <LeadsManager />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number | string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}<span>{label}</span>
        </div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}
