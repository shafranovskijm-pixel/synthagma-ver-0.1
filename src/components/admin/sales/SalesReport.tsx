import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Download, TrendingUp, Users, FileText, Coins } from 'lucide-react';
import { useSalesManager } from '@/hooks/useSalesManager';
import { supabase } from '@/integrations/supabase/client';
import { exportToExcel } from '@/utils/xlsxHelper';
import { toast } from 'sonner';

interface TaskRow { manager_id: string | null; assigned_user_id: string | null; status: string; created_at: string }
interface ActivityRow { manager_id: string | null; activity_type: string; created_at: string }

function startOfMonth(): string {
  const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d.toISOString().slice(0,10);
}
function todayIso(): string {
  return new Date().toISOString().slice(0,10);
}

export function SalesReport() {
  const { managers, leads, proposals, fetchManagers, fetchLeads, fetchProposals } = useSalesManager();
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(todayIso());
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);

  useEffect(() => { fetchManagers(); fetchLeads(); fetchProposals(); }, [fetchManagers, fetchLeads, fetchProposals]);

  useEffect(() => {
    (async () => {
      const fromIso = new Date(from).toISOString();
      const toIso = new Date(new Date(to).getTime() + 86400000).toISOString();
      const [{ data: t }, { data: a }] = await Promise.all([
        (supabase as any).from('sales_tasks').select('manager_id,assigned_user_id,status,created_at')
          .gte('created_at', fromIso).lt('created_at', toIso),
        (supabase as any).from('sales_activities').select('manager_id,activity_type,created_at')
          .gte('created_at', fromIso).lt('created_at', toIso),
      ]);
      setTasks(t || []);
      setActivities(a || []);
    })();
  }, [from, to]);

  const inRange = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= new Date(from).getTime() && t < new Date(to).getTime() + 86400000;
  };

  const rows = useMemo(() => managers.map(m => {
    const mLeads = leads.filter(l => l.assigned_manager_id === m.id);
    const mLeadsInRange = mLeads.filter(l => inRange(l.created_at));
    const mProps = proposals.filter(p => p.manager_id === m.id && inRange(p.created_at));
    const won = mProps.filter(p => (p.status || '').toLowerCase() === 'accepted' || (p.status || '').toLowerCase() === 'signed');
    const revenue = won.reduce((s, p) => s + Number(p.total_amount || 0), 0);
    const mTasks = tasks.filter(t => t.manager_id === m.id);
    const mTasksDone = mTasks.filter(t => t.status === 'done').length;
    const calls = activities.filter(a => a.manager_id === m.id && a.activity_type === 'call').length;
    const conversion = mProps.length ? Math.round((won.length / mProps.length) * 100) : 0;
    return {
      manager: m.full_name,
      leads_total: mLeads.length,
      leads_new: mLeadsInRange.length,
      calls,
      proposals: mProps.length,
      won: won.length,
      conversion,
      revenue,
      tasks: mTasks.length,
      tasks_done: mTasksDone,
    };
  }), [managers, leads, proposals, tasks, activities, from, to]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    leads_new: acc.leads_new + r.leads_new,
    calls: acc.calls + r.calls,
    proposals: acc.proposals + r.proposals,
    won: acc.won + r.won,
    revenue: acc.revenue + r.revenue,
  }), { leads_new: 0, calls: 0, proposals: 0, won: 0, revenue: 0 }), [rows]);

  const exportXlsx = async () => {
    try {
      await exportToExcel(
        rows.map(r => ({
          'Менеджер': r.manager,
          'Всего лидов': r.leads_total,
          'Новых за период': r.leads_new,
          'Звонков': r.calls,
          'КП создано': r.proposals,
          'КП выиграно': r.won,
          'Конверсия, %': r.conversion,
          'Выручка, ₽': r.revenue,
          'Задач': r.tasks,
          'Задач выполнено': r.tasks_done,
        })),
        'Отчёт по продажам',
        `sales-report_${from}_${to}.xlsx`,
        [{ wch: 30 }, { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 16 }]
      );
      toast.success('Отчёт выгружен');
    } catch (e) {
      toast.error('Не удалось выгрузить отчёт');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <Label className="text-xs">Период с</Label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" />
        </div>
        <div>
          <Label className="text-xs">по</Label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40" />
        </div>
        <div className="ml-auto">
          <Button size="sm" onClick={exportXlsx}><Download className="w-4 h-4 mr-2" />Выгрузить Excel</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard icon={<Users className="w-4 h-4" />} label="Новых лидов" value={totals.leads_new} />
        <KpiCard icon={<TrendingUp className="w-4 h-4" />} label="Звонков" value={totals.calls} />
        <KpiCard icon={<FileText className="w-4 h-4" />} label="КП создано" value={totals.proposals} />
        <KpiCard icon={<FileText className="w-4 h-4" />} label="КП выиграно" value={totals.won} />
        <KpiCard icon={<Coins className="w-4 h-4" />} label="Выручка, ₽" value={totals.revenue.toLocaleString('ru-RU')} />
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-3">Менеджер</th>
                <th className="p-3 text-right">Лидов</th>
                <th className="p-3 text-right">Новых</th>
                <th className="p-3 text-right">Звонков</th>
                <th className="p-3 text-right">КП</th>
                <th className="p-3 text-right">Выиграно</th>
                <th className="p-3 text-right">Конверсия</th>
                <th className="p-3 text-right">Выручка ₽</th>
                <th className="p-3 text-right">Задач</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.manager} className="border-t">
                  <td className="p-3 font-medium">{r.manager}</td>
                  <td className="p-3 text-right">{r.leads_total}</td>
                  <td className="p-3 text-right">{r.leads_new}</td>
                  <td className="p-3 text-right">{r.calls}</td>
                  <td className="p-3 text-right">{r.proposals}</td>
                  <td className="p-3 text-right">{r.won}</td>
                  <td className="p-3 text-right">
                    <Badge variant={r.conversion >= 30 ? 'default' : 'secondary'}>{r.conversion}%</Badge>
                  </td>
                  <td className="p-3 text-right">{r.revenue.toLocaleString('ru-RU')}</td>
                  <td className="p-3 text-right text-muted-foreground">{r.tasks_done}/{r.tasks}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Нет менеджеров</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="mt-1 text-xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
