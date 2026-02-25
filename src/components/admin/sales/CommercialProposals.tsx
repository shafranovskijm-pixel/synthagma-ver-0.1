import { useState, useEffect } from 'react';
import { Plus, Eye, Trash2, Send, FileText, Link2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSalesManager, type CommercialProposal, type ProposalServiceItem } from '@/hooks/useSalesManager';
import { ProposalEditor } from './ProposalEditor';
import { ProposalPreview } from './ProposalPreview';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from '@/hooks/use-toast';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Черновик', variant: 'secondary' },
  sent: { label: 'Отправлено', variant: 'default' },
  negotiation: { label: 'Переговоры', variant: 'outline' },
  accepted: { label: 'Принято', variant: 'default' },
  rejected: { label: 'Отклонено', variant: 'destructive' },
};

export function CommercialProposals() {
  const { proposals, fetchProposals, updateProposalStatus, deleteProposal, getProposalServices, managers, fetchManagers } = useSalesManager();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProposal, setEditingProposal] = useState<CommercialProposal | null>(null);
  const [editingServices, setEditingServices] = useState<ProposalServiceItem[]>([]);
  const [previewProposal, setPreviewProposal] = useState<CommercialProposal | null>(null);
  const [previewServices, setPreviewServices] = useState<ProposalServiceItem[]>([]);

  useEffect(() => { fetchProposals(); fetchManagers(); }, [fetchProposals, fetchManagers]);

  const filtered = statusFilter === 'all' ? proposals : proposals.filter(p => p.status === statusFilter);

  const getManagerName = (managerId: string | null) => {
    if (!managerId) return '—';
    return managers.find(m => m.id === managerId)?.full_name || '—';
  };

  const openPreview = async (p: CommercialProposal) => {
    const svcs = await getProposalServices(p.id);
    setPreviewServices(svcs);
    setPreviewProposal(p);
  };

  const openEdit = async (p: CommercialProposal) => {
    const svcs = await getProposalServices(p.id);
    setEditingProposal(p);
    setEditingServices(svcs);
    setEditorOpen(true);
  };

  const handleCloseEditor = () => {
    setEditorOpen(false);
    setEditingProposal(null);
    setEditingServices([]);
    fetchProposals();
  };

  const copyLink = (p: CommercialProposal) => {
    const url = `${window.location.origin}/proposal/${p.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Ссылка скопирована', description: url });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold">Коммерческие предложения</h3>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              {Object.entries(STATUS_MAP).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => { setEditingProposal(null); setEditingServices([]); setEditorOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />Создать КП
          </Button>
        </div>
      </div>

      {editorOpen && (
        <ProposalEditor
          onClose={handleCloseEditor}
          editProposal={editingProposal}
          editServices={editingServices}
        />
      )}

      <div className="space-y-2">
        {filtered.map(p => {
          const st = STATUS_MAP[p.status] || STATUS_MAP.draft;
          return (
            <Card key={p.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-4 h-4 text-primary" />
                      <span className="font-medium">{p.company_name}</span>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-0.5">
                      {p.company_inn && <p>ИНН: {p.company_inn}</p>}
                      {p.contact_person && <p>Контакт: {p.contact_person}</p>}
                      {p.tariff_plan && <p>Тариф: {p.tariff_plan}</p>}
                      <p>Менеджер: {getManagerName(p.manager_id)}</p>
                      <p>Создано: {format(new Date(p.created_at), 'dd MMM yyyy', { locale: ru })}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="font-bold text-lg">{p.total_amount.toLocaleString('ru-RU')} ₽</span>
                    {p.discount_percent > 0 && (
                      <Badge variant="outline" className="text-destructive border-destructive/30">−{p.discount_percent}%</Badge>
                    )}
                    <div className="flex gap-1">
                      <Button variant="outline" size="icon" title="Предпросмотр" onClick={() => openPreview(p)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="icon" title="Редактировать" onClick={() => openEdit(p)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="icon" title="Скопировать ссылку" onClick={() => copyLink(p)}>
                        <Link2 className="w-4 h-4" />
                      </Button>
                      {p.status === 'draft' && (
                        <Button variant="outline" size="sm" onClick={() => updateProposalStatus(p.id, 'sent')}>
                          <Send className="w-3 h-3 mr-1" />Отправить
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => deleteProposal(p.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">Нет коммерческих предложений</p>}
      </div>

      {previewProposal && (
        <ProposalPreview
          open={!!previewProposal}
          onClose={() => setPreviewProposal(null)}
          proposal={previewProposal}
          services={previewServices}
          discountPercent={previewProposal.discount_percent || 0}
          senderName={previewProposal.sender_name || undefined}
          senderEmail={previewProposal.sender_email || undefined}
          senderWebsite={previewProposal.sender_website || undefined}
        />
      )}
    </div>
  );
}
