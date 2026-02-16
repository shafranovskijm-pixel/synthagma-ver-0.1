import { useState, useEffect } from 'react';
import { Plus, Eye, Trash2, Send, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSalesManager, type CommercialProposal } from '@/hooks/useSalesManager';
import { ProposalEditor } from './ProposalEditor';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Черновик', variant: 'secondary' },
  sent: { label: 'Отправлено', variant: 'default' },
  negotiation: { label: 'Переговоры', variant: 'outline' },
  accepted: { label: 'Принято', variant: 'default' },
  rejected: { label: 'Отклонено', variant: 'destructive' },
};

export function CommercialProposals() {
  const { proposals, fetchProposals, updateProposalStatus, deleteProposal, managers, fetchManagers } = useSalesManager();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => { fetchProposals(); fetchManagers(); }, [fetchProposals, fetchManagers]);

  const filtered = statusFilter === 'all' ? proposals : proposals.filter(p => p.status === statusFilter);

  const getManagerName = (managerId: string | null) => {
    if (!managerId) return '—';
    return managers.find(m => m.id === managerId)?.full_name || '—';
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
          <Button size="sm" onClick={() => setEditorOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />Создать КП
          </Button>
        </div>
      </div>

      {editorOpen && (
        <ProposalEditor onClose={() => { setEditorOpen(false); fetchProposals(); }} />
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
                    <div className="flex gap-1">
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
    </div>
  );
}
