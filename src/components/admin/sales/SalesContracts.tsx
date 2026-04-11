import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Eye, Download, Trash2, X } from 'lucide-react';
import { generateSintagmaContract, type ContractCustomService, type ContractData } from '@/constants/contractTemplates';

interface SalesContract {
  id: string;
  company_name: string;
  company_inn: string | null;
  company_kpp: string | null;
  company_address: string | null;
  company_director: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contract_number: string | null;
  contract_date: string | null;
  tariff_plan: string | null;
  contract_duration_months: number;
  total_amount: number;
  prepayment_amount: number;
  custom_services: ContractCustomService[];
  status: string;
  notes: string | null;
  html_content: string | null;
  manager_id: string | null;
  created_at: string;
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Черновик', variant: 'secondary' },
  sent: { label: 'Отправлен', variant: 'default' },
  signed: { label: 'Подписан', variant: 'default' },
  active: { label: 'Активный', variant: 'default' },
  expired: { label: 'Истёк', variant: 'destructive' },
};

const TARIFFS = ['Бесплатный', 'Старт', 'Стандартный', 'Профессиональный', 'Максимальный'];

export function SalesContracts() {
  const [contracts, setContracts] = useState<SalesContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    company_name: '', company_inn: '', company_kpp: '', company_address: '', company_director: '',
    contact_person: '', contact_email: '', contact_phone: '',
    contract_number: '', contract_date: new Date().toISOString().slice(0, 10),
    tariff_plan: 'Стандартный', contract_duration_months: 12,
    total_amount: 0, prepayment_amount: 0, notes: '',
    maxStudents: 200, maxNewStudentsPerMonth: 50, storageLimit: 'Безлимит',
  });
  const [customServices, setCustomServices] = useState<ContractCustomService[]>([]);

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('sales_contracts').select('*').order('created_at', { ascending: false });
    if (data) setContracts(data.map((c: any) => ({ ...c, custom_services: c.custom_services || [] })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);

  const resetForm = () => {
    setForm({
      company_name: '', company_inn: '', company_kpp: '', company_address: '', company_director: '',
      contact_person: '', contact_email: '', contact_phone: '',
      contract_number: '', contract_date: new Date().toISOString().slice(0, 10),
      tariff_plan: 'Стандартный', contract_duration_months: 12,
      total_amount: 0, prepayment_amount: 0, notes: '',
      maxStudents: 200, maxNewStudentsPerMonth: 50, storageLimit: 'Безлимит',
    });
    setCustomServices([]);
  };

  const handleSave = async () => {
    if (!form.company_name) { toast({ title: 'Укажите название компании', variant: 'destructive' }); return; }

    const contractData: ContractData = {
      contractNumber: form.contract_number,
      contractDate: form.contract_date,
      companyName: form.company_name,
      companyInn: form.company_inn,
      companyKpp: form.company_kpp,
      companyAddress: form.company_address,
      companyDirector: form.company_director,
      contactPerson: form.contact_person,
      contactEmail: form.contact_email,
      contactPhone: form.contact_phone,
      tariffPlan: form.tariff_plan,
      durationMonths: form.contract_duration_months,
      totalAmount: form.total_amount,
      prepaymentAmount: form.prepayment_amount,
      customServices,
      notes: form.notes,
      maxStudents: form.maxStudents,
      maxNewStudentsPerMonth: form.maxNewStudentsPerMonth,
      storageLimit: form.storageLimit,
    };

    const html = generateSintagmaContract(contractData);

    const { error } = await supabase.from('sales_contracts').insert({
      ...form,
      custom_services: customServices,
      html_content: html,
    } as any);

    if (error) { toast({ title: 'Ошибка', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Договор создан' });
    setShowForm(false);
    resetForm();
    fetchContracts();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить договор?')) return;
    await supabase.from('sales_contracts').delete().eq('id', id);
    toast({ title: 'Договор удалён' });
    fetchContracts();
  };

  const handleStatusChange = async (id: string, status: string) => {
    await supabase.from('sales_contracts').update({ status } as any).eq('id', id);
    fetchContracts();
  };

  const handleView = (contract: SalesContract) => {
    if (contract.html_content) {
      setPreviewHtml(contract.html_content);
    }
  };

  const handleDownload = (contract: SalesContract) => {
    if (!contract.html_content) return;
    const printHtml = `<!DOCTYPE html><html><head><title>Договор ${contract.contract_number || ''}</title></head><body>${contract.html_content}</body></html>`;
    const blob = new Blob([printHtml], { type: 'text/html; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url);
    if (w) {
      w.onload = () => { setTimeout(() => { w.print(); }, 500); };
    }
  };

  const addCustomService = () => setCustomServices([...customServices, { name: '', price: 0 }]);
  const removeCustomService = (i: number) => setCustomServices(customServices.filter((_, idx) => idx !== i));
  const updateCustomService = (i: number, field: 'name' | 'price', value: string | number) => {
    const updated = [...customServices];
    if (field === 'price') updated[i].price = Number(value);
    else updated[i].name = value as string;
    setCustomServices(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Договоры</h3>
        <Button onClick={() => { resetForm(); setShowForm(true); }} size="sm"><Plus className="w-4 h-4 mr-1" />Создать договор</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Номер</TableHead>
            <TableHead>Компания</TableHead>
            <TableHead>Тариф</TableHead>
            <TableHead>Сумма</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>Дата</TableHead>
            <TableHead>Действия</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contracts.length === 0 && (
            <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Нет договоров</TableCell></TableRow>
          )}
          {contracts.map(c => (
            <TableRow key={c.id}>
              <TableCell className="font-mono text-sm">{c.contract_number || '—'}</TableCell>
              <TableCell>{c.company_name}</TableCell>
              <TableCell>{c.tariff_plan || '—'}</TableCell>
              <TableCell>{Number(c.total_amount).toLocaleString('ru-RU')} ₽</TableCell>
              <TableCell>
                <Select value={c.status} onValueChange={v => handleStatusChange(c.id, v)}>
                  <SelectTrigger className="w-[130px] h-8">
                    <Badge variant={STATUS_MAP[c.status]?.variant || 'secondary'}>{STATUS_MAP[c.status]?.label || c.status}</Badge>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_MAP).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>{c.contract_date ? new Date(c.contract_date).toLocaleDateString('ru-RU') : '—'}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => handleView(c)} disabled={!c.html_content}><Eye className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDownload(c)} disabled={!c.html_content}><Download className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(c.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Create form dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Новый договор на платформу Синтагма</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 grid grid-cols-2 gap-4">
              <div><Label>Номер договора</Label><Input value={form.contract_number} onChange={e => setForm({ ...form, contract_number: e.target.value })} placeholder="С-2026/001" /></div>
              <div><Label>Дата договора</Label><Input type="date" value={form.contract_date} onChange={e => setForm({ ...form, contract_date: e.target.value })} /></div>
            </div>

            <div className="col-span-2"><h4 className="font-semibold text-sm border-b pb-1">Данные заказчика</h4></div>
            <div><Label>Название компании *</Label><Input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} /></div>
            <div><Label>Директор</Label><Input value={form.company_director} onChange={e => setForm({ ...form, company_director: e.target.value })} placeholder="Ф.И.О." /></div>
            <div><Label>ИНН</Label><Input value={form.company_inn} onChange={e => setForm({ ...form, company_inn: e.target.value })} /></div>
            <div><Label>КПП</Label><Input value={form.company_kpp} onChange={e => setForm({ ...form, company_kpp: e.target.value })} /></div>
            <div className="col-span-2"><Label>Адрес</Label><Input value={form.company_address} onChange={e => setForm({ ...form, company_address: e.target.value })} /></div>

            <div className="col-span-2"><h4 className="font-semibold text-sm border-b pb-1">Контактное лицо</h4></div>
            <div><Label>ФИО</Label><Input value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} /></div>
            <div><Label>Email</Label><Input value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} /></div>
            <div><Label>Телефон</Label><Input value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} /></div>

            <div className="col-span-2"><h4 className="font-semibold text-sm border-b pb-1">Условия</h4></div>
            <div>
              <Label>Тариф</Label>
              <Select value={form.tariff_plan} onValueChange={v => setForm({ ...form, tariff_plan: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TARIFFS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Срок (мес.)</Label><Input type="number" value={form.contract_duration_months} onChange={e => setForm({ ...form, contract_duration_months: Number(e.target.value) })} /></div>

            <div className="col-span-2"><h4 className="font-semibold text-sm border-b pb-1">Индивидуальные лимиты тарифа</h4></div>
            <div><Label>Кол-во учеников</Label><Input type="number" value={form.maxStudents} onChange={e => setForm({ ...form, maxStudents: Number(e.target.value) })} /></div>
            <div><Label>Новых учеников в месяц</Label><Input type="number" value={form.maxNewStudentsPerMonth} onChange={e => setForm({ ...form, maxNewStudentsPerMonth: Number(e.target.value) })} /></div>
            <div><Label>Свободное место</Label><Input value={form.storageLimit} onChange={e => setForm({ ...form, storageLimit: e.target.value })} placeholder="Безлимит" /></div>

            <div className="col-span-2"><h4 className="font-semibold text-sm border-b pb-1">Оплата</h4></div>
            <div><Label>Общая сумма (₽)</Label><Input type="number" value={form.total_amount} onChange={e => setForm({ ...form, total_amount: Number(e.target.value) })} /></div>
            <div><Label>Предоплата (₽)</Label><Input type="number" value={form.prepayment_amount} onChange={e => setForm({ ...form, prepayment_amount: Number(e.target.value) })} /></div>

            <div className="col-span-2">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-semibold text-sm">Доработки</h4>
                <Button size="sm" variant="outline" onClick={addCustomService}><Plus className="w-3 h-3 mr-1" />Добавить</Button>
              </div>
              {customServices.map((s, i) => (
                <div key={i} className="flex gap-2 mb-2 items-end">
                  <div className="flex-1"><Input placeholder="Название доработки" value={s.name} onChange={e => updateCustomService(i, 'name', e.target.value)} /></div>
                  <div className="w-32"><Input type="number" placeholder="Цена" value={s.price} onChange={e => updateCustomService(i, 'price', e.target.value)} /></div>
                  <Button size="icon" variant="ghost" onClick={() => removeCustomService(i)}><X className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>

            <div className="col-span-2"><Label>Примечания</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowForm(false)}>Отмена</Button>
            <Button onClick={handleSave}>Создать договор</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!previewHtml} onOpenChange={() => setPreviewHtml(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Просмотр договора</DialogTitle></DialogHeader>
          {previewHtml && <div dangerouslySetInnerHTML={{ __html: previewHtml }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
