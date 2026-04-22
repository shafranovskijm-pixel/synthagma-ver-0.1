import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Send, FileText, Mail, Briefcase } from "lucide-react";
import { useOrgProposals, type OrgProposal, type OrgProposalServiceItem } from "@/hooks/useOrgProposals";
import { useOrgServices } from "@/hooks/useOrgServices";
import { useEmailTemplates } from "@/hooks/useEmailTemplates";
import { useOrgSmtp } from "@/hooks/useOrgSmtp";
import { CreateContractDialog } from "./CreateContractDialog";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Черновик", variant: "secondary" },
  sent: { label: "Отправлено", variant: "default" },
  viewed: { label: "Просмотрено", variant: "default" },
  accepted: { label: "Принято", variant: "default" },
  rejected: { label: "Отклонено", variant: "destructive" },
};

interface Props {
  organizationId: string;
  onGoToSmtp?: () => void;
}

export function OrgProposalsManager({ organizationId, onGoToSmtp }: Props) {
  const { proposals, loading, getServices, upsertProposal, remove, sendByEmail } = useOrgProposals(organizationId);
  const { services } = useOrgServices(organizationId);
  const { templates } = useEmailTemplates("org", organizationId);
  const { settings: smtp } = useOrgSmtp(organizationId);

  const [editor, setEditor] = useState<{ proposal: Partial<OrgProposal>; items: OrgProposalServiceItem[] } | null>(null);
  const [sendDialog, setSendDialog] = useState<{ proposal: OrgProposal; email: string; templateId: string } | null>(null);
  const [contractFromCP, setContractFromCP] = useState<OrgProposal | null>(null);
  const [busy, setBusy] = useState(false);

  const proposalTemplates = templates.filter(t => t.category === "proposal");

  const openCreate = () => {
    setEditor({
      proposal: { company_name: "", company_email: "", company_inn: "", contact_person: "", custom_note: "", discount_percent: 0, total_amount: 0 },
      items: [],
    });
  };

  const openEdit = async (p: OrgProposal) => {
    const items = await getServices(p.id);
    setEditor({ proposal: p, items });
  };

  const handleSave = async () => {
    if (!editor) return;
    const subtotal = editor.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const discount = (editor.proposal.discount_percent || 0) / 100;
    const total = Math.round(subtotal * (1 - discount));
    setBusy(true);
    await upsertProposal({ ...(editor.proposal as any), total_amount: total }, editor.items);
    setBusy(false);
    setEditor(null);
  };

  const openSend = (p: OrgProposal) => {
    if (!smtp) {
      onGoToSmtp();
      return;
    }
    setSendDialog({
      proposal: p,
      email: p.company_email || "",
      templateId: proposalTemplates[0]?.id || "",
    });
  };

  const handleSend = async () => {
    if (!sendDialog) return;
    setBusy(true);
    const ok = await sendByEmail(sendDialog.proposal.id, sendDialog.email, sendDialog.templateId || null);
    setBusy(false);
    if (ok) setSendDialog(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Коммерческие предложения</h3>
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Создать КП</Button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Загрузка...</p>}

      <div className="space-y-2">
        {proposals.map(p => {
          const st = STATUS[p.status] || STATUS.draft;
          return (
            <Card key={p.id}>
              <CardContent className="p-4 flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="font-medium">{p.company_name}</span>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {p.company_inn && <p>ИНН: {p.company_inn}</p>}
                    {p.contact_person && <p>Контакт: {p.contact_person}</p>}
                    <p>Создано: {format(new Date(p.created_at), "dd MMM yyyy", { locale: ru })}</p>
                    {p.last_sent_at && <p>Отправлено: {format(new Date(p.last_sent_at), "dd MMM yyyy HH:mm", { locale: ru })}</p>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="font-bold text-lg">{Number(p.total_amount).toLocaleString("ru-RU")} ₽</span>
                  <div className="flex gap-1">
                    <Button size="icon" variant="outline" onClick={() => openEdit(p)} title="Редактировать"><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="outline" onClick={() => openSend(p)} title="Отправить"><Mail className="w-4 h-4" /></Button>
                    <Button size="icon" variant="outline" onClick={() => setContractFromCP(p)} title="Создать договор по КП"><Briefcase className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {!loading && proposals.length === 0 && <p className="text-center text-muted-foreground py-8">Нет КП. Создайте первое.</p>}
      </div>

      {/* Editor */}
      {editor && (
        <Dialog open={true} onOpenChange={(o) => !o && setEditor(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editor.proposal.id ? "Редактировать КП" : "Новое КП"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Название компании</Label><Input value={editor.proposal.company_name || ""} onChange={e => setEditor(s => s && ({ ...s, proposal: { ...s.proposal, company_name: e.target.value } }))} /></div>
                <div><Label>ИНН</Label><Input value={editor.proposal.company_inn || ""} onChange={e => setEditor(s => s && ({ ...s, proposal: { ...s.proposal, company_inn: e.target.value } }))} /></div>
                <div><Label>Email</Label><Input type="email" value={editor.proposal.company_email || ""} onChange={e => setEditor(s => s && ({ ...s, proposal: { ...s.proposal, company_email: e.target.value } }))} /></div>
                <div><Label>Контактное лицо</Label><Input value={editor.proposal.contact_person || ""} onChange={e => setEditor(s => s && ({ ...s, proposal: { ...s.proposal, contact_person: e.target.value } }))} /></div>
                <div><Label>Скидка (%)</Label><Input type="number" min={0} max={100} value={editor.proposal.discount_percent || 0} onChange={e => setEditor(s => s && ({ ...s, proposal: { ...s.proposal, discount_percent: Number(e.target.value) } }))} /></div>
              </div>
              <div><Label>Примечание</Label><Textarea rows={2} value={editor.proposal.custom_note || ""} onChange={e => setEditor(s => s && ({ ...s, proposal: { ...s.proposal, custom_note: e.target.value } }))} /></div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Услуги</Label>
                  <div className="flex gap-1">
                    <Select onValueChange={(serviceId) => {
                      const svc = services.find(s => s.id === serviceId);
                      if (!svc) return;
                      setEditor(s => s && ({ ...s, items: [...s.items, { service_id: svc.id, custom_name: svc.name, custom_description: svc.description, price: svc.price, quantity: 1, sort_order: s.items.length }] }));
                    }}>
                      <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue placeholder="Из каталога" /></SelectTrigger>
                      <SelectContent>
                        {services.filter(s => s.is_active).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" onClick={() => setEditor(s => s && ({ ...s, items: [...s.items, { service_id: null, custom_name: "Услуга", custom_description: "", price: 0, quantity: 1, sort_order: s.items.length }] }))}>
                      <Plus className="w-3 h-3 mr-1" />Своя
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  {editor.items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end p-2 border rounded-md">
                      <div className="col-span-5"><Label className="text-xs">Название</Label><Input value={it.custom_name} onChange={e => setEditor(s => s && ({ ...s, items: s.items.map((x, i) => i === idx ? { ...x, custom_name: e.target.value } : x) }))} /></div>
                      <div className="col-span-3"><Label className="text-xs">Цена</Label><Input type="number" value={it.price} onChange={e => setEditor(s => s && ({ ...s, items: s.items.map((x, i) => i === idx ? { ...x, price: Number(e.target.value) } : x) }))} /></div>
                      <div className="col-span-2"><Label className="text-xs">Кол-во</Label><Input type="number" value={it.quantity} onChange={e => setEditor(s => s && ({ ...s, items: s.items.map((x, i) => i === idx ? { ...x, quantity: Number(e.target.value) } : x) }))} /></div>
                      <div className="col-span-1 text-right text-sm font-semibold">{(it.price * it.quantity).toLocaleString("ru-RU")}</div>
                      <Button size="icon" variant="ghost" className="col-span-1" onClick={() => setEditor(s => s && ({ ...s, items: s.items.filter((_, i) => i !== idx) }))}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  ))}
                  {editor.items.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Добавьте услуги</p>}
                </div>
                <div className="text-right text-base font-bold mt-2">
                  Итого: {Math.round(editor.items.reduce((s, i) => s + i.price * i.quantity, 0) * (1 - (editor.proposal.discount_percent || 0) / 100)).toLocaleString("ru-RU")} ₽
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditor(null)}>Отмена</Button>
              <Button onClick={handleSave} disabled={busy || !editor.proposal.company_name}>Сохранить</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Send dialog */}
      {sendDialog && (
        <Dialog open={true} onOpenChange={(o) => !o && setSendDialog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Отправить КП</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Email получателя</Label><Input type="email" value={sendDialog.email} onChange={e => setSendDialog(s => s && ({ ...s, email: e.target.value }))} /></div>
              <div>
                <Label>Шаблон письма</Label>
                <Select value={sendDialog.templateId} onValueChange={v => setSendDialog(s => s && ({ ...s, templateId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                  <SelectContent>
                    {proposalTemplates.length === 0 && <SelectItem value="-" disabled>Нет шаблонов категории «Отправка КП»</SelectItem>}
                    {proposalTemplates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">Письмо отправится через ваш SMTP. КП и договоры не подпадают под лимиты прогрева.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSendDialog(null)}>Отмена</Button>
              <Button onClick={handleSend} disabled={busy || !sendDialog.email.includes("@") || !sendDialog.templateId}><Send className="w-4 h-4 mr-2" />Отправить</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* CP → Contract */}
      {contractFromCP && (
        <CreateContractDialog
          open={true}
          onOpenChange={(o) => !o && setContractFromCP(null)}
          organizationId={organizationId}
          prefill={{
            documentTitle: `Договор оказания услуг для ${contractFromCP.company_name}`,
            recipientName: contractFromCP.contact_person || contractFromCP.company_name,
            recipientEmail: contractFromCP.company_email || "",
            linkedProposalId: contractFromCP.id,
          }}
        />
      )}
    </div>
  );
}
