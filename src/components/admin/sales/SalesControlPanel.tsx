import { useState, useEffect, useMemo } from 'react';
import { BarChart3, Phone, Mail, Handshake, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSalesManager } from '@/hooks/useSalesManager';
import { format, subDays, isAfter } from 'date-fns';
import { ru } from 'date-fns/locale';

export function SalesControlPanel() {
  const { managers, fetchManagers, leads, fetchLeads, activities, fetchActivities, proposals, fetchProposals } = useSalesManager();
  const [period, setPeriod] = useState('7');
  const [selectedManager, setSelectedManager] = useState('all');

  useEffect(() => {
    fetchManagers(); fetchLeads(); fetchActivities(); fetchProposals();
  }, [fetchManagers, fetchLeads, fetchActivities, fetchProposals]);

  const cutoff = subDays(new Date(), Number(period));

  const filteredActivities = useMemo(() => {
    let acts = activities.filter(a => isAfter(new Date(a.created_at), cutoff));
    if (selectedManager !== 'all') acts = acts.filter(a => a.manager_id === selectedManager);
    return acts;
  }, [activities, period, selectedManager, cutoff]);

  const stats = useMemo(() => {
    const calls = filteredActivities.filter(a => a.activity_type === 'call').length;
    const emails = filteredActivities.filter(a => a.activity_type === 'email').length;
    const meetings = filteredActivities.filter(a => a.activity_type === 'meeting').length;
    const total = filteredActivities.length;

    const interested = leads.filter(l => l.status === 'interested').length;
    const clients = leads.filter(l => l.status === 'client').length;
    const conversion = leads.length > 0 ? Math.round((clients / leads.length) * 100) : 0;

    return { calls, emails, meetings, total, interested, clients, conversion };
  }, [filteredActivities, leads]);

  const managerStats = useMemo(() => {
    return managers.map(m => {
      const mActs = filteredActivities.filter(a => a.manager_id === m.id);
      const mLeads = leads.filter(l => l.assigned_manager_id === m.id);
      const mProposals = proposals.filter(p => p.manager_id === m.id);
      const calls = mActs.filter(a => a.activity_type === 'call').length;
      const interested = mLeads.filter(l => l.status === 'interested' || l.status === 'client').length;
      return {
        ...m,
        totalActivities: mActs.length,
        calls,
        leadsCount: mLeads.length,
        proposalsCount: mProposals.length,
        interested,
        conversion: mLeads.length > 0 ? Math.round((interested / mLeads.length) * 100) : 0,
      };
    }).sort((a, b) => b.totalActivities - a.totalActivities);
  }, [managers, filteredActivities, leads, proposals]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold">Контроль исполнения</h3>
        <div className="flex gap-2">
          <Select value={selectedManager} onValueChange={setSelectedManager}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Менеджер" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все менеджеры</SelectItem>
              {managers.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 дней</SelectItem>
              <SelectItem value="14">14 дней</SelectItem>
              <SelectItem value="30">30 дней</SelectItem>
              <SelectItem value="90">90 дней</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center">
          <Phone className="w-5 h-5 mx-auto mb-1 text-blue-500" />
          <p className="text-2xl font-bold">{stats.calls}</p>
          <p className="text-xs text-muted-foreground">Звонков</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Mail className="w-5 h-5 mx-auto mb-1 text-purple-500" />
          <p className="text-2xl font-bold">{stats.emails}</p>
          <p className="text-xs text-muted-foreground">Писем</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Handshake className="w-5 h-5 mx-auto mb-1 text-green-500" />
          <p className="text-2xl font-bold">{stats.meetings}</p>
          <p className="text-xs text-muted-foreground">Встреч</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <TrendingUp className="w-5 h-5 mx-auto mb-1 text-primary" />
          <p className="text-2xl font-bold">{stats.conversion}%</p>
          <p className="text-xs text-muted-foreground">Конверсия</p>
        </CardContent></Card>
      </div>

      {/* Manager performance table */}
      <Card>
        <CardHeader><CardTitle className="text-base">Эффективность менеджеров</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-2 text-left">Менеджер</th>
                  <th className="p-2 text-center">Активности</th>
                  <th className="p-2 text-center">Звонки</th>
                  <th className="p-2 text-center">Лиды</th>
                  <th className="p-2 text-center">КП</th>
                  <th className="p-2 text-center">Заинтересованы</th>
                  <th className="p-2 text-center">Конверсия</th>
                </tr>
              </thead>
              <tbody>
                {managerStats.map(m => (
                  <tr key={m.id} className="border-b border-border/50">
                    <td className="p-2 font-medium">{m.full_name}</td>
                    <td className="p-2 text-center">{m.totalActivities}</td>
                    <td className="p-2 text-center">{m.calls}</td>
                    <td className="p-2 text-center">{m.leadsCount}</td>
                    <td className="p-2 text-center">{m.proposalsCount}</td>
                    <td className="p-2 text-center">{m.interested}</td>
                    <td className="p-2 text-center font-semibold">{m.conversion}%</td>
                  </tr>
                ))}
                {managerStats.length === 0 && (
                  <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Нет данных</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Recent activities */}
      <Card>
        <CardHeader><CardTitle className="text-base">Последние действия</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {filteredActivities.slice(0, 50).map(a => {
              const mgr = managers.find(m => m.id === a.manager_id);
              const lead = leads.find(l => l.id === a.lead_id);
              return (
                <div key={a.id} className="flex items-center gap-2 text-sm py-2 border-b border-border/30">
                  <span className="text-lg">{a.activity_type === 'call' ? '📞' : a.activity_type === 'email' ? '📧' : a.activity_type === 'meeting' ? '🤝' : '📝'}</span>
                  <span className="font-medium">{mgr?.full_name || '—'}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="flex-1 truncate">{lead?.org_name || '—'}: {a.description || '—'}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(a.created_at), 'dd.MM HH:mm')}</span>
                </div>
              );
            })}
            {filteredActivities.length === 0 && <p className="text-center text-muted-foreground py-4">Нет активностей за период</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
