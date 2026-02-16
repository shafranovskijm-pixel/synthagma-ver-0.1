import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Building2, ClipboardList, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SigmaLogo } from '@/components/ui/SigmaLogo';
import { useSalesManager, type SalesLead } from '@/hooks/useSalesManager';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProposalEditor } from '@/components/admin/sales/ProposalEditor';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const LEAD_STATUS_MAP: Record<string, { label: string; color: string }> = {
  new: { label: 'Новый', color: 'bg-blue-500/10 text-blue-500' },
  in_progress: { label: 'В работе', color: 'bg-yellow-500/10 text-yellow-500' },
  contacted: { label: 'Контакт', color: 'bg-purple-500/10 text-purple-500' },
  interested: { label: 'Интерес', color: 'bg-green-500/10 text-green-500' },
  not_interested: { label: 'Отказ', color: 'bg-red-500/10 text-red-500' },
  client: { label: 'Клиент', color: 'bg-emerald-500/10 text-emerald-500' },
};

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Черновик', variant: 'secondary' },
  sent: { label: 'Отправлено', variant: 'default' },
  negotiation: { label: 'Переговоры', variant: 'outline' },
  accepted: { label: 'Принято', variant: 'default' },
  rejected: { label: 'Отклонено', variant: 'destructive' },
};

const SalesDashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const {
    leads, fetchLeads, proposals, fetchProposals, activities, fetchActivities,
    updateLeadStatus, updateLeadNotes, addActivity, managers, fetchManagers
  } = useSalesManager();
  const [editorOpen, setEditorOpen] = useState(false);
  const [detailLead, setDetailLead] = useState<SalesLead | null>(null);
  const [activityNote, setActivityNote] = useState('');

  useEffect(() => { fetchLeads(); fetchProposals(); fetchActivities(); fetchManagers(); }, []);

  const myManagerId = managers.find(m => m.user_id === user?.id)?.id;

  const handleSignOut = async () => { await signOut(); navigate('/login'); };

  const handleAddActivity = async (type: string) => {
    if (!detailLead || !activityNote.trim() || !myManagerId) return;
    await addActivity(detailLead.id, myManagerId, type, activityNote);
    setActivityNote('');
    fetchActivities(detailLead.id);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-4 h-14 max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <SigmaLogo size="sm" showText={false} />
            <span className="font-display font-bold">Кабинет менеджера</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}><LogOut className="w-4 h-4 mr-1" />Выйти</Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4">
        <Tabs defaultValue="leads" className="space-y-4">
          <TabsList>
            <TabsTrigger value="leads"><Building2 className="w-4 h-4 mr-1" />Мои компании</TabsTrigger>
            <TabsTrigger value="proposals"><FileText className="w-4 h-4 mr-1" />Мои КП</TabsTrigger>
            <TabsTrigger value="activity"><ClipboardList className="w-4 h-4 mr-1" />Активность</TabsTrigger>
          </TabsList>

          <TabsContent value="leads">
            <div className="space-y-2">
              {leads.map(lead => {
                const st = LEAD_STATUS_MAP[lead.status] || LEAD_STATUS_MAP.new;
                return (
                  <Card key={lead.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => { setDetailLead(lead); fetchActivities(lead.id); }}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium">{lead.org_name}</p>
                        <p className="text-xs text-muted-foreground">ИНН: {lead.inn || '—'} | {lead.region || '—'}</p>
                      </div>
                      <Badge className={st.color}>{st.label}</Badge>
                    </CardContent>
                  </Card>
                );
              })}
              {leads.length === 0 && <p className="text-center text-muted-foreground py-8">Нет назначенных компаний</p>}
            </div>
          </TabsContent>

          <TabsContent value="proposals">
            <div className="space-y-4">
              <Button size="sm" onClick={() => setEditorOpen(true)}>Создать КП</Button>
              {editorOpen && <ProposalEditor onClose={() => { setEditorOpen(false); fetchProposals(); }} />}
              {proposals.map(p => {
                const st = STATUS_MAP[p.status] || STATUS_MAP.draft;
                return (
                  <Card key={p.id}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium">{p.company_name}</p>
                        <p className="text-xs text-muted-foreground">{p.tariff_plan || '—'} | {format(new Date(p.created_at), 'dd MMM yyyy', { locale: ru })}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{p.total_amount.toLocaleString('ru-RU')} ₽</span>
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="activity">
            <div className="space-y-1">
              {activities.slice(0, 50).map(a => {
                const lead = leads.find(l => l.id === a.lead_id);
                return (
                  <div key={a.id} className="flex items-center gap-2 text-sm py-2 border-b border-border/30">
                    <span>{a.activity_type === 'call' ? '📞' : a.activity_type === 'email' ? '📧' : a.activity_type === 'meeting' ? '🤝' : '📝'}</span>
                    <span className="flex-1 truncate">{lead?.org_name || '—'}: {a.description || '—'}</span>
                    <span className="text-xs text-muted-foreground">{format(new Date(a.created_at), 'dd.MM HH:mm')}</span>
                  </div>
                );
              })}
              {activities.length === 0 && <p className="text-center text-muted-foreground py-8">Нет активностей</p>}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Lead detail dialog */}
      <Dialog open={!!detailLead} onOpenChange={o => { if (!o) setDetailLead(null); }}>
        <DialogContent className="max-w-lg">
          {detailLead && (
            <>
              <DialogHeader><DialogTitle>{detailLead.org_name}</DialogTitle></DialogHeader>
              <div className="space-y-3 text-sm">
                {detailLead.inn && <p><strong>ИНН:</strong> {detailLead.inn}</p>}
                {detailLead.phone && <p>📞 {detailLead.phone}</p>}
                {detailLead.email && <p>📧 {detailLead.email}</p>}
                {detailLead.address && <p>📍 {detailLead.address}</p>}

                <Select value={detailLead.status} onValueChange={v => { updateLeadStatus(detailLead.id, v); setDetailLead({ ...detailLead, status: v }); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(LEAD_STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Textarea value={detailLead.notes || ''} onChange={e => setDetailLead({ ...detailLead, notes: e.target.value })} onBlur={() => updateLeadNotes(detailLead.id, detailLead.notes || '')} placeholder="Заметки..." />

                <div className="pt-2 border-t">
                  <Textarea value={activityNote} onChange={e => setActivityNote(e.target.value)} placeholder="Описание действия..." />
                  <div className="flex gap-1 mt-2">
                    <Button size="sm" variant="outline" onClick={() => handleAddActivity('call')}>📞 Звонок</Button>
                    <Button size="sm" variant="outline" onClick={() => handleAddActivity('email')}>📧 Письмо</Button>
                    <Button size="sm" variant="outline" onClick={() => handleAddActivity('meeting')}>🤝 Встреча</Button>
                  </div>
                </div>

                {activities.filter(a => a.lead_id === detailLead.id).map(a => (
                  <div key={a.id} className="text-xs p-2 bg-secondary/30 rounded">
                    {a.activity_type === 'call' ? '📞' : a.activity_type === 'email' ? '📧' : '📝'} {a.description}
                    <span className="text-muted-foreground ml-2">{format(new Date(a.created_at), 'dd.MM HH:mm')}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SalesDashboard;
