import { useState, useEffect } from 'react';
import { Upload, UserPlus, Search, Building2, Phone, Mail, Globe, MapPin, Filter } from 'lucide-react';
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
  const { leads, fetchLeads, assignLeads, managers, fetchManagers, updateLeadStatus, updateLeadNotes, addActivity, activities, fetchActivities } = useSalesManager();
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [managerFilter, setManagerFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [detailLead, setDetailLead] = useState<SalesLead | null>(null);
  const [activityNote, setActivityNote] = useState('');

  // Server-side фильтрация по организации (защита от лимита 1000 строк).
  useEffect(() => {
    fetchLeads(organizationId ? { organizationId } : undefined);
    fetchManagers();
  }, [fetchLeads, fetchManagers, organizationId]);

  const regions = [...new Set(leads.map(l => l.region).filter(Boolean))] as string[];

  const filtered = leads.filter(l => {
    if (search && !l.org_name.toLowerCase().includes(search.toLowerCase()) && !l.inn?.includes(search)) return false;
    if (regionFilter !== 'all' && l.region !== regionFilter) return false;
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

  const openDetail = (lead: SalesLead) => {
    setDetailLead(lead);
    fetchActivities(lead.id);
  };

  const handleAddActivity = async (type: string) => {
    if (!detailLead || !activityNote.trim()) return;
    // Find manager id for current admin (using first manager or self)
    const mgr = managers[0];
    if (mgr) {
      await addActivity(detailLead.id, mgr.id, type, activityNote);
      setActivityNote('');
      fetchActivities(detailLead.id);
    }
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
        <Select value={managerFilter} onValueChange={setManagerFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Менеджер" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все менеджеры</SelectItem>
            {managers.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg">
          <span className="text-sm font-medium">Выбрано: {selectedIds.size}</span>
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
                <p className="text-xs text-muted-foreground">ИНН: {lead.inn || '—'}</p>
              </div>
              <Badge className={`w-28 justify-center ${st.color}`}>{st.label}</Badge>
              <span className="w-32 text-sm truncate">{mgr?.full_name || '—'}</span>
              <span className="w-28 text-sm text-muted-foreground truncate">{lead.region || '—'}</span>
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
