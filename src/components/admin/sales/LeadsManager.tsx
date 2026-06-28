import { useState, useEffect, useMemo } from 'react';
import { Upload, Search, Building2, Phone, Mail, Globe, MapPin, MessageSquare, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSalesManager, type SalesLead } from '@/hooks/useSalesManager';
import { LeadsImportDialog } from './LeadsImportDialog';
import { getRegionLocalTime, isBusinessHours } from '@/utils/regionTimezones';

const LEAD_STATUS_MAP: Record<string, { label: string; color: string }> = {
  new: { label: 'Новый', color: 'bg-blue-500/10 text-blue-500' },
  in_progress: { label: 'В работе', color: 'bg-yellow-500/10 text-yellow-500' },
  contacted: { label: 'Контакт', color: 'bg-purple-500/10 text-purple-500' },
  interested: { label: 'Интерес', color: 'bg-green-500/10 text-green-500' },
  not_interested: { label: 'Отказ', color: 'bg-red-500/10 text-red-500' },
  client: { label: 'Клиент', color: 'bg-emerald-500/10 text-emerald-500' },
};

interface LeadsManagerProps {
  organizationId?: string;
}

export function LeadsManager({ organizationId }: LeadsManagerProps = {}) {
  const { leads, fetchLeads, assignLeads, claimLeads, managers, fetchManagers, updateLeadStatus, updateLeadNotes, addActivity, activities, fetchActivities } = useSalesManager();
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [managerFilter, setManagerFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [detailLead, setDetailLead] = useState<SalesLead | null>(null);
  const [activityNote, setActivityNote] = useState('');
  // tick раз в минуту, чтобы локальное время регионов оставалось актуальным
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Server-side фильтрация по организации (защита от лимита 1000 строк).
  useEffect(() => {
    fetchLeads(organizationId ? { organizationId } : undefined);
    fetchManagers();
  }, [fetchLeads, fetchManagers, organizationId]);

  const regionCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leads) {
      const r = l.region || 'Без региона';
      m.set(r, (m.get(r) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [leads]);
  const regions = regionCounts.map(([r]) => r);

  const filtered = leads.filter(l => {
    if (search && !l.org_name.toLowerCase().includes(search.toLowerCase()) && !l.inn?.includes(search)) return false;
    if (regionFilter !== 'all' && (l.region || 'Без региона') !== regionFilter) return false;
    if (statusFilter !== 'all' && l.status !== statusFilter) return false;
    if (managerFilter !== 'all' && l.assigned_manager_id !== managerFilter) return false;
    return true;
  });

  const hasManagers = managers.length > 0;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(l => l.id)));
  };

  const handleAssign = async (managerId: string) => {
    await assignLeads([...selectedIds], managerId);
    setSelectedIds(new Set());
  };

  const handleUnassign = async () => {
    await assignLeads([...selectedIds], null as any);
    setSelectedIds(new Set());
  };

  const handleClaim = async (ids: string[]) => {
    const n = await claimLeads(ids);
    if (n > 0) setSelectedIds(new Set());
  };



  const openDetail = (lead: SalesLead) => {
    setDetailLead(lead);
    fetchActivities(lead.id);
  };

  const handleAddActivity = async (type: string) => {
    if (!detailLead || !activityNote.trim()) return;
    const ok = await addActivity(detailLead.id, null, type, activityNote);
    if (ok) {
      setActivityNote('');
      fetchActivities(detailLead.id);
    }
  };

  // Quick call from row: открыть tel: и сразу создать запись «звонок»
  const handleQuickCall = async (lead: SalesLead) => {
    if (lead.phone) {
      try { window.location.href = `tel:${lead.phone.replace(/\s/g, '')}`; } catch {}
    }
    openDetail(lead);
    await addActivity(lead.id, null, 'call', `Исходящий звонок на ${lead.phone || 'номер не указан'}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold">База компаний ({leads.length})</h3>
        <Button size="sm" onClick={() => setImportOpen(true)}>
          <Upload className="w-4 h-4 mr-2" />Импорт из Excel
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по названию или ИНН..." />
        </div>
        <Select value={regionFilter} onValueChange={setRegionFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Регион" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все регионы</SelectItem>
            {regions.sort().map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Статус" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            {Object.entries(LEAD_STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasManagers && (
          <Select value={managerFilter} onValueChange={setManagerFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Менеджер" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все менеджеры</SelectItem>
              {managers.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Region chips with local time */}
      {regionCounts.length > 0 && (
        <div className="space-y-2">
          {regionFilter !== 'all' && (() => {
            const lt = getRegionLocalTime(regionFilter);
            if (!lt) return null;
            const ok = isBusinessHours(regionFilter);
            return (
              <div className={`inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-xl border ${ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'}`}>
                <Clock className="w-4 h-4" />
                <span className="font-medium">{regionFilter}:</span>
                <span className="font-mono">{lt.time}</span>
                <span className="text-xs opacity-70">({lt.mskOffsetLabel})</span>
                <span className="text-xs">· {ok ? 'удобно звонить' : 'не рабочее время'}</span>
              </div>
            );
          })()}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setRegionFilter('all')}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${regionFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-secondary border-border'}`}
            >
              Все · {leads.length}
            </button>
            {regionCounts.map(([r, c]) => {
              const lt = getRegionLocalTime(r);
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRegionFilter(r)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition inline-flex items-center gap-1.5 ${regionFilter === r ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-secondary border-border'}`}
                  title={lt ? `Местное время: ${lt.time} (${lt.mskOffsetLabel})` : undefined}
                >
                  <span>{r} · {c}</span>
                  {lt && (
                    <span className={`font-mono text-[10px] opacity-80 ${regionFilter === r ? '' : 'text-muted-foreground'}`}>
                      {lt.time}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg flex-wrap">
          <span className="text-sm font-medium">Выбрано: {selectedIds.size}</span>
          <Button size="sm" onClick={() => handleClaim([...selectedIds])}>Взять в работу</Button>
          <Select onValueChange={handleAssign}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Назначить менеджеру..." /></SelectTrigger>
            <SelectContent>
              {managers.filter(m => m.is_active).map(m => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleUnassign}>Снять назначение</Button>
        </div>
      )}

      {/* Leads list */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
          <Checkbox checked={selectedIds.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
          <span className="flex-1">Компания</span>
          <span className="w-28">Статус</span>
          <span className="w-32">Менеджер</span>
          <span className="w-28">Регион</span>
        </div>
        {filtered.slice(0, 100).map(lead => {
          const st = LEAD_STATUS_MAP[lead.status] || LEAD_STATUS_MAP.new;
          const mgr = managers.find(m => m.id === lead.assigned_manager_id);
          return (
            <div key={lead.id} className="flex items-center gap-2 px-4 py-3 rounded-lg hover:bg-secondary/50 cursor-pointer border border-transparent hover:border-border" onClick={() => openDetail(lead)}>
              <Checkbox checked={selectedIds.has(lead.id)} onCheckedChange={() => toggleSelect(lead.id)} onClick={e => e.stopPropagation()} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{lead.org_name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  ИНН: {lead.inn || '—'}
                  {lead.phone && <> · <span className="text-foreground">{lead.phone}</span></>}
                </p>
              </div>
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <Button size="sm" variant="outline" disabled={!lead.phone} onClick={() => handleQuickCall(lead)} title={lead.phone || 'Нет номера'}>
                  <Phone className="w-3.5 h-3.5 mr-1" />Позвонить
                </Button>
                <Button size="sm" variant="ghost" onClick={() => openDetail(lead)}>
                  <MessageSquare className="w-3.5 h-3.5 mr-1" />Заметка
                </Button>
              </div>
              <Badge className={`w-24 justify-center ${st.color}`}>{st.label}</Badge>
              <span className="w-28 text-sm truncate hidden md:inline">{mgr?.full_name || '—'}</span>
              <span className="w-32 text-xs text-muted-foreground truncate hidden lg:flex flex-col leading-tight">
                <span className="truncate">{lead.region || '—'}</span>
                {(() => { const lt = getRegionLocalTime(lead.region); return lt ? <span className="font-mono text-[10px] opacity-70">🕐 {lt.time} {lt.mskOffsetLabel}</span> : null; })()}
              </span>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">Нет компаний</p>}
        {filtered.length > 100 && <p className="text-center text-muted-foreground py-2 text-sm">Показано 100 из {filtered.length}. Используйте фильтры.</p>}
      </div>

      <LeadsImportDialog open={importOpen} onOpenChange={setImportOpen} />

      {/* Lead detail dialog */}
      <Dialog open={!!detailLead} onOpenChange={o => { if (!o) setDetailLead(null); }}>
        <DialogContent className="max-w-lg">
          {detailLead && (
            <>
              <DialogHeader><DialogTitle>{detailLead.org_name}</DialogTitle></DialogHeader>
              <div className="space-y-3 text-sm">
                {detailLead.inn && <p><strong>ИНН:</strong> {detailLead.inn}</p>}
                {detailLead.ogrn && <p><strong>ОГРН:</strong> {detailLead.ogrn}</p>}
                {detailLead.license_number && <p><strong>Лицензия:</strong> {detailLead.license_number}</p>}
                {detailLead.address && <p className="flex gap-1"><MapPin className="w-3 h-3 mt-0.5 shrink-0" />{detailLead.address}</p>}
                {detailLead.phone && <p className="flex gap-1"><Phone className="w-3 h-3 mt-0.5" />{detailLead.phone}</p>}
                {detailLead.email && <p className="flex gap-1"><Mail className="w-3 h-3 mt-0.5" />{detailLead.email}</p>}
                {detailLead.website && <p className="flex gap-1"><Globe className="w-3 h-3 mt-0.5" />{detailLead.website}</p>}

                <div>
                  <strong>Статус:</strong>
                  <Select value={detailLead.status} onValueChange={v => { updateLeadStatus(detailLead.id, v); setDetailLead({ ...detailLead, status: v }); }}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(LEAD_STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <strong>Заметки:</strong>
                  <Textarea value={detailLead.notes || ''} onChange={e => { setDetailLead({ ...detailLead, notes: e.target.value }); }} onBlur={() => updateLeadNotes(detailLead.id, detailLead.notes || '')} className="mt-1" />
                </div>

                {/* Activity log */}
                <div className="pt-2 border-t border-border">
                  <strong>Добавить активность:</strong>
                  <Textarea value={activityNote} onChange={e => setActivityNote(e.target.value)} placeholder="Описание..." className="mt-1" />
                  <div className="flex gap-1 mt-2">
                    <Button size="sm" variant="outline" onClick={() => handleAddActivity('call')}>📞 Звонок</Button>
                    <Button size="sm" variant="outline" onClick={() => handleAddActivity('email')}>📧 Письмо</Button>
                    <Button size="sm" variant="outline" onClick={() => handleAddActivity('meeting')}>🤝 Встреча</Button>
                    <Button size="sm" variant="outline" onClick={() => handleAddActivity('note')}>📝 Заметка</Button>
                  </div>
                </div>

                {activities.filter(a => a.lead_id === detailLead.id).length > 0 && (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {activities.filter(a => a.lead_id === detailLead.id).map(a => (
                      <div key={a.id} className="text-xs p-2 bg-secondary/30 rounded">
                        <span className="font-medium">{a.activity_type}</span> — {a.description}
                        <span className="text-muted-foreground ml-2">{new Date(a.created_at).toLocaleDateString('ru-RU')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
