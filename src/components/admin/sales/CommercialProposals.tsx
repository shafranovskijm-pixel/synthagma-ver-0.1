import { useState, useEffect } from 'react';
import { getBaseUrl } from '@/utils/getBaseUrl';
import { Plus, Eye, Trash2, Send, FileText, Link2, Pencil, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useSalesManager, type CommercialProposal, type ProposalServiceItem } from '@/hooks/useSalesManager';
import { ProposalEditor } from './ProposalEditor';
import { ProposalPreview } from './ProposalPreview';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { SUBSCRIPTION_PLANS, YEARLY_DISCOUNT, formatStorageSize, type SubscriptionPlan } from '@/constants/subscriptionPlans';
import { toast } from "sonner";

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Черновик', variant: 'secondary' },
  sent: { label: 'Отправлено', variant: 'default' },
  negotiation: { label: 'Переговоры', variant: 'outline' },
  accepted: { label: 'Принято', variant: 'default' },
  rejected: { label: 'Отклонено', variant: 'destructive' },
};

function generateProposalEmailHtml(proposal: CommercialProposal, services: ProposalServiceItem[], discountPercent: number) {
  const senderName = proposal.sender_name || 'СИНТАГМА';
  const senderEmail = proposal.sender_email || 'support@sintagma.com.ru';
  const senderWebsite = proposal.sender_website || 'https://sintagma.com.ru/';
  const subtotal = services.reduce((s, l) => s + l.price * l.quantity, 0) || proposal.total_amount;
  const discountAmount = Math.round(subtotal * discountPercent / 100);
  const total = subtotal - discountAmount;
  const fmt = (n: number) => n.toLocaleString('ru-RU');

  const serviceRows = services.map((s, i) => `
    <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#fff'}">
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${i + 1}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>${s.custom_name}</strong>${s.custom_description ? `<br><span style="font-size:12px;color:#6b7280">${s.custom_description}</span>` : ''}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">${fmt(s.price)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center">${s.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:500">${fmt(s.price * s.quantity)}</td>
    </tr>`).join('');

  const discountRows = discountPercent > 0 ? `
    <tr style="background:#f3f4f6;font-weight:500">
      <td colspan="4" style="padding:8px;text-align:right">Подытог:</td>
      <td style="padding:8px;text-align:right">${fmt(subtotal)} ₽</td>
    </tr>
    <tr style="background:#f3f4f6;font-weight:500;color:#c0392b">
      <td colspan="4" style="padding:8px;text-align:right">Скидка ${discountPercent}%:</td>
      <td style="padding:8px;text-align:right">−${fmt(discountAmount)} ₽</td>
    </tr>` : '';

  const validUntil = proposal.valid_until
    ? `<p>Действительно до: <strong>${format(new Date(proposal.valid_until), 'dd MMMM yyyy', { locale: ru })}</strong></p>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;color:#333;margin:0;padding:20px;background:#fff">
    <div style="max-width:700px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #000;padding-bottom:16px;margin-bottom:24px">
        <div>
          <div style="font-size:20px;font-weight:bold">${senderName}</div>
          <div style="font-size:12px;color:#6b7280">Платформа дистанционного обучения</div>
        </div>
        <div style="text-align:right;font-size:14px;color:#6b7280">
          <div>${senderWebsite}</div>
          <div>${senderEmail}</div>
        </div>
      </div>
      <h1 style="text-align:center;font-size:22px;text-transform:uppercase;letter-spacing:2px;margin-bottom:24px">Коммерческое предложение</h1>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px;font-size:14px">
        <div><span style="color:#6b7280">Кому:</span> <strong>${proposal.company_name}</strong></div>
        ${proposal.company_inn ? `<div><span style="color:#6b7280">ИНН:</span> ${proposal.company_inn}</div>` : ''}
        ${proposal.contact_person ? `<div><span style="color:#6b7280">Контакт:</span> ${proposal.contact_person}</div>` : ''}
        ${proposal.tariff_plan ? `<div><span style="color:#6b7280">Тариф:</span> ${proposal.tariff_plan}</div>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px">
        <thead><tr style="background:#000;color:#fff">
          <th style="padding:8px;text-align:left;width:40px">№</th>
          <th style="padding:8px;text-align:left">Наименование</th>
          <th style="padding:8px;text-align:right;width:90px">Цена, ₽</th>
          <th style="padding:8px;text-align:center;width:50px">Кол.</th>
          <th style="padding:8px;text-align:right;width:110px">Сумма, ₽</th>
        </tr></thead>
        <tbody>${serviceRows}</tbody>
        <tfoot>
          ${discountRows}
          <tr style="background:#000;color:#fff;font-weight:bold">
            <td colspan="4" style="padding:8px;text-align:right">ИТОГО:</td>
            <td style="padding:8px;text-align:right">${fmt(total)} ₽</td>
          </tr>
        </tfoot>
      </table>
      ${proposal.custom_note ? `<div style="background:#f9fafb;border-left:4px solid #000;padding:16px;margin-bottom:24px;font-size:14px"><strong>Примечание:</strong><br>${proposal.custom_note}</div>` : ''}
      <div style="border-top:1px solid #e5e7eb;padding-top:16px;font-size:13px;color:#6b7280">
        ${validUntil}
        <p>Дата: ${format(new Date(proposal.created_at), 'dd MMMM yyyy', { locale: ru })}</p>
        <p style="margin-top:8px">Онлайн-версия: <a href="${getBaseUrl()}/proposal/${proposal.id}">${getBaseUrl()}/proposal/${proposal.id}</a></p>
      </div>
    </div>
  </body></html>`;
}

export function CommercialProposals() {
  const { proposals, fetchProposals, updateProposalStatus, deleteProposal, getProposalServices, managers, fetchManagers } = useSalesManager();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProposal, setEditingProposal] = useState<CommercialProposal | null>(null);
  const [editingServices, setEditingServices] = useState<ProposalServiceItem[]>([]);
  const [previewProposal, setPreviewProposal] = useState<CommercialProposal | null>(null);
  const [previewServices, setPreviewServices] = useState<ProposalServiceItem[]>([]);

  // Send email dialog state
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendProposal, setSendProposal] = useState<CommercialProposal | null>(null);
  const [sendServices, setSendServices] = useState<ProposalServiceItem[]>([]);
  const [sendEmail, setSendEmail] = useState('');
  const [isSending, setIsSending] = useState(false);

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
    const url = `${getBaseUrl()}/proposal/${p.id}`;
    navigator.clipboard.writeText(url);
    toast.success("Ссылка скопирована", { description: url });
  };

  const openSendDialog = async (p: CommercialProposal) => {
    const svcs = await getProposalServices(p.id);
    setSendProposal(p);
    setSendServices(svcs);
    setSendEmail(p.company_email || '');
    setSendDialogOpen(true);
  };

  const handleSendEmail = async () => {
    if (!sendProposal) return;
    if (!sendEmail || !sendEmail.includes('@')) {
      toast.error("Ошибка", { description: Введите корректный email });
      return;
    }
    setIsSending(true);
    try {
      const html = generateProposalEmailHtml(sendProposal, sendServices, sendProposal.discount_percent || 0);
      const { error } = await supabase.functions.invoke('send-email', {
        body: {
          to: sendEmail,
          subject: `Коммерческое предложение — ${sendProposal.company_name}`,
          html,
          from: sendProposal.sender_email || 'support@sintagma.com.ru',
        },
      });
      if (error) throw error;
      await updateProposalStatus(sendProposal.id, 'sent');
      toast.success("КП отправлено", { description: Письмо отправлено на ${sendEmail} });
      setSendDialogOpen(false);
    } catch (err: any) {
      console.error('Error sending proposal email:', err);
      toast.error("Ошибка отправки", { description: err.message || 'Не удалось отправить письмо' });
    } finally {
      setIsSending(false);
    }
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
                      <Button variant="outline" size="icon" title="Отправить на почту" onClick={() => openSendDialog(p)}>
                        <Mail className="w-4 h-4" />
                      </Button>
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

      {/* Send email dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Отправить КП на почту
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="send-email">Email получателя</Label>
              <Input
                id="send-email"
                type="email"
                placeholder="client@company.com"
                value={sendEmail}
                onChange={(e) => setSendEmail(e.target.value)}
              />
            </div>
            {sendProposal && (
              <div className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                <p><strong>КП для:</strong> {sendProposal.company_name}</p>
                <p><strong>Сумма:</strong> {sendProposal.total_amount.toLocaleString('ru-RU')} ₽</p>
                {sendProposal.discount_percent > 0 && <p><strong>Скидка:</strong> {sendProposal.discount_percent}%</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSendEmail} disabled={isSending}>
              {isSending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Отправка...</>
              ) : (
                <><Send className="h-4 w-4 mr-2" />Отправить</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
