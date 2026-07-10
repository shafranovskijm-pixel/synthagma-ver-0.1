import { useState, useEffect, useMemo } from 'react';
import { Upload, Download, Search, Phone, MoreHorizontal, Filter as FilterIcon, X, MessageSquare, Inbox, ChevronDown } from 'lucide-react';
import { exportToExcel } from '@/utils/xlsxHelper';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useSalesManager, type SalesLead } from '@/hooks/useSalesManager';
import { useSalesTasks } from '@/hooks/useSalesTasks';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { LeadsImportDialog } from './LeadsImportDialog';
import { getRegionLocalTime } from '@/utils/regionTimezones';
import { PriorityKpiStrip, type PriorityFilterKey } from './PriorityKpiStrip';
import { CompanyDrawer } from './CompanyDrawer';
import { cn } from '@/lib/utils';

const LEAD_STATUS_MAP: Record<string, { label: string; color: string }> = {
  new: { label: 'Новый', color: 'bg-blue-500/10 text-blue-600' },
  in_progress: { label: 'В работе', color: 'bg-yellow-500/10 text-yellow-600' },
  contacted: { label: 'Контакт', color: 'bg-purple-500/10 text-purple-600' },
  interested: { label: 'Есть интерес', color: 'bg-emerald-500/10 text-emerald-600' },
  not_interested: { label: 'Отказ', color: 'bg-rose-500/10 text-rose-500' },
  client: { label: 'Клиент', color: 'bg-emerald-500/10 text-emerald-500' },
};

const CHIP_FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'Активные' },
  { key: 'new', label: 'Новые' },
  { key: 'in_progress', label: 'В работе' },
  { key: 'callback_today', label: 'Перезвон сегодня' },
  { key: 'overdue', label: 'Просрочено' },
  { key: 'no_answer', label: 'Без ответа' },
  { key: 'interested', label: 'Есть интерес' },
  { key: 'not_interested', label: 'Отказы' },
];

interface LeadsManagerProps {
  organizationId?: string;
  onCreateProposal?: (c: { name: string; inn: string }) => void;
  onCreateContract?: (c: { name: string; inn: string }) => void;
}

export function LeadsManager({ organizationId, onCreateProposal, onCreateContract }: LeadsManagerProps = {}) {
  const { user } = useAuth();
  const { leads, fetchLeads, assignLeads, claimLeads, managers, fetchManagers, addActivity } = useSalesManager();
  const { list: tasksQ } = useSalesTasks({ onlyOpen: true, organizationId });
  const tasks = tasksQ.data || [];

  const [search, setSearch] = useState('');
  const [chip, setChip] = useState('all');
  const [priority, setPriority] = useState<PriorityFilterKey | null>(null);
  const [regionFilter, setRegionFilter] = useState('all');
  const [managerFilter, setManagerFilter] = useState('all');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [detailLead, setDetailLead] = useState<SalesLead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [showUnprocessed, setShowUnprocessed] = useState(false);

  const [currentManagerId, setCurrentManagerId] = useState<string | null>(null);
  const [managerFullName, setManagerFullName] = useState<string | undefined>();
  const [managerPhone, setManagerPhone] = useState<string | undefined>();

  useEffect(() => {
    fetchLeads(organizationId ? { organizationId } : undefined);
    fetchManagers();
  }, [fetchLeads, fetchManagers, organizationId]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any).from('sales_managers').select('id, full_name, phone').eq('user_id', user.id).maybeSingle();
      if (data) { setCurrentManagerId(data.id); setManagerFullName(data.full_name); setManagerPhone(data.phone || undefined); }
    })();
  }, [user]);

  // индекс задач по lead_id
  const tasksByLead = useMemo(() => {
    const m = new Map<string, typeof tasks>();
    for (const t of tasks) {
      if (!t.lead_id) continue;
      const arr = m.get(t.lead_id) || [];
      arr.push(t);
      m.set(t.lead_id, arr);
    }
    return m;
  }, [tasks]);

  const now = Date.now();
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
  const sevenDaysAgo = now - 7 * 24 * 3600_000;

  const isOverdue = (leadId: string) => (tasksByLead.get(leadId) || []).some(t => new Date(t.due_date).getTime() < now);
  const isCallbackToday = (leadId: string) => (tasksByLead.get(leadId) || []).some(t => {
    const d = new Date(t.due_date).getTime();
    return d >= startOfToday.getTime() && d <= endOfToday.getTime();
  });
  const nextStep = (leadId: string) => {
    const arr = (tasksByLead.get(leadId) || []).slice().sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
    return arr[0];
  };

  const regionCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leads) {
      const r = l.region || 'Без региона';
      m.set(r, (m.get(r) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [leads]);

  // приоритетные счётчики
  const priorityCounts = useMemo(() => {
    let newToday = 0, overdue = 0, mine = 0, stale = 0, calls = 0;
    for (const l of leads) {
      if (new Date(l.created_at).getTime() >= startOfToday.getTime()) newToday++;
      if (isOverdue(l.id)) overdue++;
      if (currentManagerId && l.assigned_manager_id === currentManagerId) mine++;
      const last = l.last_contact_at ? new Date(l.last_contact_at).getTime() : new Date(l.updated_at).getTime();
      if (last < sevenDaysAgo) stale++;
      if (isCallbackToday(l.id)) calls++;
    }
    return { new_today: newToday, overdue, assigned_to_me: mine, stale_7d: stale, calls_today: calls };
  }, [leads, tasksByLead, currentManagerId]);

  const filtered = useMemo(() => {
    return leads.filter(l => {
      if (search) {
        const q = search.toLowerCase();
        const hay = `${l.org_name} ${l.inn || ''} ${l.phone || ''} ${l.email || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (regionFilter !== 'all' && (l.region || 'Без региона') !== regionFilter) return false;
      if (managerFilter !== 'all' && l.assigned_manager_id !== managerFilter) return false;

      if (chip !== 'all') {
        if (chip === 'callback_today' && !isCallbackToday(l.id)) return false;
        else if (chip === 'overdue' && !isOverdue(l.id)) return false;
        else if (chip === 'no_answer' && l.status !== 'contacted' && l.status !== 'new') return false;
        else if (['new', 'in_progress', 'interested'].includes(chip) && l.status !== chip) return false;
      }

      if (priority) {
        if (priority === 'new_today' && new Date(l.created_at).getTime() < startOfToday.getTime()) return false;
        if (priority === 'overdue' && !isOverdue(l.id)) return false;
        if (priority === 'assigned_to_me' && (!currentManagerId || l.assigned_manager_id !== currentManagerId)) return false;
        if (priority === 'stale_7d') {
          const last = l.last_contact_at ? new Date(l.last_contact_at).getTime() : new Date(l.updated_at).getTime();
          if (last >= sevenDaysAgo) return false;
        }
        if (priority === 'calls_today' && !isCallbackToday(l.id)) return false;
      }
      return true;
    });
  }, [leads, search, chip, priority, regionFilter, managerFilter, tasksByLead, currentManagerId]);

  const untreatedCount = useMemo(
    () => leads.filter(l => l.status === 'new' && !l.assigned_manager_id).length,
    [leads]
  );

  const openDetail = (lead: SalesLead) => { setDetailLead(lead); setDrawerOpen(true); };

  const handleQuickCall = async (lead: SalesLead) => {
    if (lead.phone) window.location.href = `tel:${lead.phone.replace(/\s/g, '')}`;
    await addActivity(lead.id, null, 'call', `Исходящий звонок: ${lead.phone || '—'}`);
    openDetail(lead);
  };

  const openNext = () => {
    if (!detailLead) return;
    const idx = filtered.findIndex(l => l.id === detailLead.id);
    const next = filtered[idx + 1];
    if (next) { setDetailLead(next); setDrawerOpen(true); }
    else setDrawerOpen(false);
  };

  const loading = tasksQ.isLoading && leads.length === 0;

  return (
    <div className="space-y-4">
      <div className={cn(drawerOpen && 'hidden')}>
      {/* Компактная шапка */}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по компании, телефону, ИНН или контакту"
          />
        </div>
        <Button size="sm" variant="outline" className="h-9" onClick={() => setAdvancedOpen(true)}>
          <FilterIcon className="w-3.5 h-3.5 mr-1" />Фильтры
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-9"
          onClick={async () => {
            if (filtered.length === 0) { toast.error('Нет данных для экспорта'); return; }
            const managerName = (id?: string | null) =>
              id ? (managers.find(m => m.id === id)?.full_name || '—') : '—';
            const data = filtered.map(l => ({
              Компания: l.org_name || '',
              ИНН: l.inn || '',
              Телефон: l.phone || '',
              Email: l.email || '',
              Регион: l.region || '',
              Статус: LEAD_STATUS_MAP[l.status]?.label || l.status,
              Менеджер: managerName(l.assigned_manager_id),
              'Последний контакт': l.last_contact_at ? new Date(l.last_contact_at).toLocaleDateString('ru-RU') : '',
              Создан: new Date(l.created_at).toLocaleDateString('ru-RU'),
            }));
            await exportToExcel(data, 'Лиды', `leads-${new Date().toISOString().slice(0,10)}.xlsx`, [
              { wch: 40 }, { wch: 14 }, { wch: 16 }, { wch: 28 }, { wch: 20 }, { wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 14 },
            ]);
            toast.success(`Экспортировано: ${data.length}`);
          }}
        >
          <Download className="w-3.5 h-3.5 mr-1" />Экспорт
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-9"
          onClick={() => {
            if (filtered.length === 0) { toast.error('Нет данных для экспорта'); return; }
            const header = ['first_name','last_name','patronymic','email','phone','personal_manager_id','comment','error'];
            const esc = (v: string) => {
              const s = (v ?? '').toString().replace(/"/g, '""');
              return /[";\n\r]/.test(s) ? `"${s}"` : s;
            };
            let skipped = 0;
            const lines = [header.join(';')];
            for (const l of filtered) {
              const digits = (l.phone || '').replace(/\D/g, '');
              if (digits.length < 6) { skipped++; continue; }
              const commentParts = [
                l.org_name,
                l.inn ? `ИНН ${l.inn}` : null,
                l.region || null,
                LEAD_STATUS_MAP[l.status]?.label ? `Статус: ${LEAD_STATUS_MAP[l.status].label}` : null,
              ].filter(Boolean).join(' • ');
              lines.push([
                esc(l.org_name || ''), // first_name — покажется в звонке
                '',                     // last_name
                '',                     // patronymic
                esc(l.email || ''),
                esc(digits),
                '',                     // personal_manager_id (Novofon internal)
                esc(commentParts),
                '',                     // error
              ].join(';'));
            }
            const csv = '\ufeff' + lines.join('\r\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `novofon-leads-${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
            toast.success(`Экспорт для Новофона: ${lines.length - 1}${skipped ? ` (пропущено без телефона: ${skipped})` : ''}`);
          }}
        >
          <Download className="w-3.5 h-3.5 mr-1" />Новофон CSV
        </Button>
        <Button size="sm" className="h-9" onClick={() => setImportOpen(true)}>
          <Upload className="w-3.5 h-3.5 mr-1" />Импорт из Excel
        </Button>
      </div>

      {/* KPI-полоса */}
      <PriorityKpiStrip counts={priorityCounts} active={priority} onSelect={setPriority} />

      {/* Необработанные базы — компактный аккордеон */}
      {untreatedCount > 0 && (
        <div className="border rounded-xl bg-amber-500/5 border-amber-500/30">
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-sm"
            onClick={() => setShowUnprocessed(!showUnprocessed)}
          >
            <Inbox className="w-4 h-4 text-amber-600" />
            <span className="font-medium">Необработанные загруженные базы</span>
            <Badge className="bg-amber-500 text-white ml-1">{untreatedCount}</Badge>
            <ChevronDown className={cn('ml-auto w-4 h-4 transition', showUnprocessed && 'rotate-180')} />
          </button>
          {showUnprocessed && (
            <div className="px-3 pb-3 text-xs text-muted-foreground">
              Компании со статусом «Новый» без назначенного менеджера. Используйте фильтр «Новые» или назначайте пакетно из списка.
              <Button size="sm" variant="link" className="h-auto p-0 ml-2" onClick={() => { setChip('new'); setShowUnprocessed(false); }}>
                Показать
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Chip-фильтры */}
      <div className="flex flex-wrap gap-1.5">
        {CHIP_FILTERS.map(f => (
          <button
            key={f.key}
            type="button"
            onClick={() => setChip(f.key)}
            className={cn(
              'text-xs px-3 py-1.5 rounded-full border transition',
              chip === f.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-secondary border-border',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Таблица */}
      <div className="border rounded-xl overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Компания</th>
                <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Телефон</th>
                <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">Регион</th>
                <th className="text-left px-3 py-2 font-medium">Статус</th>
                <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Менеджер</th>
                <th className="text-left px-3 py-2 font-medium hidden xl:table-cell">Следующий шаг</th>
                <th className="text-right px-3 py-2 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    <td colSpan={7} className="p-2"><Skeleton className="h-8 w-full" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-sm text-muted-foreground">
                    {leads.length === 0 ? (
                      <>
                        <div className="font-medium text-foreground mb-1">Компаний пока нет</div>
                        <div>Импортируйте базу из Excel или добавьте компанию вручную.</div>
                        <Button className="mt-3" onClick={() => setImportOpen(true)}>
                          <Upload className="w-4 h-4 mr-2" />Импорт из Excel
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="font-medium text-foreground mb-1">Ничего не найдено</div>
                        <Button variant="link" onClick={() => { setSearch(''); setChip('all'); setPriority(null); setRegionFilter('all'); setManagerFilter('all'); }}>
                          Сбросить фильтры
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ) : filtered.slice(0, 150).map(lead => {
                const st = LEAD_STATUS_MAP[lead.status] || LEAD_STATUS_MAP.new;
                const mgr = managers.find(m => m.id === lead.assigned_manager_id);
                const overdue = isOverdue(lead.id);
                const ns = nextStep(lead.id);
                const lt = getRegionLocalTime(lead.region);
                return (
                  <tr
                    key={lead.id}
                    onClick={() => openDetail(lead)}
                    className={cn(
                      'border-t cursor-pointer hover:bg-muted/30',
                      overdue && 'border-l-2 border-l-rose-500',
                    )}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium truncate max-w-[240px]">{lead.org_name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {lead.inn ? `ИНН ${lead.inn}` : '—'}
                        {lead.source && <> · {lead.source}</>}
                      </div>
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell text-muted-foreground">{lead.phone || '—'}</td>
                    <td className="px-3 py-2 hidden lg:table-cell">
                      <div className="text-xs">{lead.region || '—'}</div>
                      {lt && <div className="text-[10px] font-mono text-muted-foreground">{lt.time}</div>}
                    </td>
                    <td className="px-3 py-2">
                      {overdue ? (
                        <Badge className="bg-rose-500/10 text-rose-600">Просрочено</Badge>
                      ) : (
                        <Badge className={st.color}>{st.label}</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell text-xs text-muted-foreground truncate max-w-[140px]">
                      {mgr?.full_name || '—'}
                    </td>
                    <td className="px-3 py-2 hidden xl:table-cell text-xs">
                      {ns ? (
                        <div>
                          <div className="truncate max-w-[180px]">{ns.title}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(ns.due_date).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          disabled={!lead.phone}
                          onClick={() => handleQuickCall(lead)}
                          title={lead.phone || 'Нет номера'}
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openDetail(lead)}>
                              <MessageSquare className="w-3.5 h-3.5 mr-2" />Заметка / детали
                            </DropdownMenuItem>
                            {onCreateProposal && (
                              <DropdownMenuItem onClick={() => onCreateProposal({ name: lead.org_name, inn: lead.inn || '' })}>
                                Создать КП
                              </DropdownMenuItem>
                            )}
                            {onCreateContract && (
                              <DropdownMenuItem onClick={() => onCreateContract({ name: lead.org_name, inn: lead.inn || '' })}>
                                Создать договор
                              </DropdownMenuItem>
                            )}
                            {!lead.assigned_manager_id && (
                              <DropdownMenuItem onClick={() => claimLeads([lead.id])}>
                                Взять в работу
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 150 && (
          <div className="px-3 py-2 text-xs text-muted-foreground text-center border-t">
            Показано 150 из {filtered.length}. Уточните поиск или фильтры.
          </div>
        )}
      </div>

      {/* Расширенные фильтры */}
      <Sheet open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>Фильтры</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-xs text-muted-foreground">Регион</label>
              <Select value={regionFilter} onValueChange={setRegionFilter}>
                <SelectTrigger><SelectValue placeholder="Все регионы" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все регионы</SelectItem>
                  {regionCounts.map(([r, c]) => <SelectItem key={r} value={r}>{r} · {c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {managers.length > 0 && (
              <div>
                <label className="text-xs text-muted-foreground">Менеджер</label>
                <Select value={managerFilter} onValueChange={setManagerFilter}>
                  <SelectTrigger><SelectValue placeholder="Все менеджеры" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все менеджеры</SelectItem>
                    {managers.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => { setRegionFilter('all'); setManagerFilter('all'); setChip('all'); setPriority(null); setSearch(''); }}
            >
              <X className="w-4 h-4 mr-1" />Сбросить всё
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <LeadsImportDialog open={importOpen} onOpenChange={setImportOpen} />
      </div>

      <CompanyDrawer

        lead={detailLead}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        managerName={managerFullName}
        managerPhone={managerPhone}
        onCreateProposal={l => onCreateProposal?.({ name: l.org_name, inn: l.inn || '' })}
        onCreateContract={l => onCreateContract?.({ name: l.org_name, inn: l.inn || '' })}
        onSaveAndNext={openNext}
      />
    </div>
  );
}
