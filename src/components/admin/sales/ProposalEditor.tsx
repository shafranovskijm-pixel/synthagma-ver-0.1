import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Eye, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from '@/constants/subscriptionPlans';
import { PROPOSAL_TEMPLATES, type ProposalTemplate } from '@/constants/proposalTemplates';
import { useSalesManager, type ProposalServiceItem } from '@/hooks/useSalesManager';
import { ProposalPreview } from './ProposalPreview';
import type { CommercialProposal } from '@/hooks/useSalesManager';

interface Props {
  onClose: () => void;
}

interface ServiceLine {
  custom_name: string;
  custom_description: string;
  price: number;
  quantity: number;
  service_id?: string;
}

export function ProposalEditor({ onClose }: Props) {
  const { services, fetchServices, managers, fetchManagers, createProposal } = useSalesManager();
  const [companyName, setCompanyName] = useState('');
  const [companyInn, setCompanyInn] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [tariffPlan, setTariffPlan] = useState<string>('');
  const [managerId, setManagerId] = useState<string>('');
  const [customNote, setCustomNote] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [senderName, setSenderName] = useState('СИНТАГМА');
  const [senderEmail, setSenderEmail] = useState('info@synthagma.ru');
  const [senderWebsite, setSenderWebsite] = useState('synthagma.ru');
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [discountPercent, setDiscountPercent] = useState<number>(0);

  useEffect(() => { fetchServices(); fetchManagers(); }, [fetchServices, fetchManagers]);

  const applyTemplate = (template: ProposalTemplate) => {
    setSelectedTemplate(template.id);
    if (template.tariffPlan) {
      setTariffPlan(template.tariffPlan);
    }
    setServiceLines(template.serviceLines.map(l => ({ ...l })));
  };

  const handleTariffChange = (plan: string) => {
    setTariffPlan(plan);
    if (plan && SUBSCRIPTION_PLANS[plan as SubscriptionPlan]) {
      const info = SUBSCRIPTION_PLANS[plan as SubscriptionPlan];
      const tariffLine: ServiceLine = {
        custom_name: `Тариф "${info.name}"`,
        custom_description: info.description,
        price: info.price,
        quantity: 12,
      };
      setServiceLines(prev => [tariffLine, ...prev.filter(l => !l.custom_name.startsWith('Тариф "'))]);
    }
  };

  const addServiceFromCatalog = (serviceId: string) => {
    const svc = services.find(s => s.id === serviceId);
    if (!svc) return;
    setServiceLines(prev => [...prev, { custom_name: svc.name, custom_description: svc.description || '', price: svc.price, quantity: 1, service_id: svc.id }]);
  };

  const addCustomLine = () => {
    setServiceLines(prev => [...prev, { custom_name: '', custom_description: '', price: 0, quantity: 1 }]);
  };

  const updateLine = (index: number, field: keyof ServiceLine, value: any) => {
    setServiceLines(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l));
  };

  const removeLine = (index: number) => {
    setServiceLines(prev => prev.filter((_, i) => i !== index));
  };

  const subtotal = serviceLines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  const discountAmount = Math.round(subtotal * discountPercent / 100);
  const totalAmount = subtotal - discountAmount;

  const handleSave = async () => {
    if (!companyName) return;
    setSaving(true);
    await createProposal(
      {
        company_name: companyName,
        company_inn: companyInn || undefined,
        company_email: companyEmail || undefined,
        company_phone: companyPhone || undefined,
        contact_person: contactPerson || undefined,
        tariff_plan: tariffPlan || undefined,
        manager_id: managerId || undefined,
        custom_note: customNote || undefined,
        total_amount: totalAmount,
        valid_until: validUntil || undefined,
      } as any,
      serviceLines.map(l => ({
        custom_name: l.custom_name,
        custom_description: l.custom_description,
        price: l.price,
        quantity: l.quantity,
        service_id: l.service_id,
      }))
    );
    setSaving(false);
    onClose();
  };

  // Build a preview proposal object
  const previewProposal: CommercialProposal = {
    id: 'preview',
    created_by: '',
    manager_id: managerId || null,
    company_name: companyName || 'Название компании',
    company_inn: companyInn || null,
    company_email: companyEmail || null,
    company_phone: companyPhone || null,
    contact_person: contactPerson || null,
    tariff_plan: tariffPlan || null,
    custom_note: customNote || null,
    total_amount: totalAmount,
    status: 'draft',
    valid_until: validUntil || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const previewServices: ProposalServiceItem[] = serviceLines.map((l, i) => ({
    id: `preview-${i}`,
    proposal_id: 'preview',
    service_id: l.service_id || null,
    custom_name: l.custom_name,
    custom_description: l.custom_description,
    price: l.price,
    quantity: l.quantity,
    sort_order: i,
  }));

  return (
    <>
      <Card className="border-primary/30">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg">Новое коммерческое предложение</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Template selector */}
          <div>
            <Label className="text-base font-semibold mb-2 block">
              <Sparkles className="w-4 h-4 inline mr-1" />Выберите шаблон
            </Label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {PROPOSAL_TEMPLATES.map(t => {
                const isSelected = selectedTemplate === t.id;
                const yearlyTotal = t.serviceLines.reduce((s, l) => s + l.price * l.quantity, 0);
                return (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t)}
                    className={`text-left p-3 rounded-lg border-2 transition-all hover:shadow-md ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="font-semibold text-sm">{t.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
                    {yearlyTotal > 0 && (
                      <Badge variant="secondary" className="mt-1.5 text-xs">
                        {yearlyTotal.toLocaleString('ru-RU')} ₽
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Company info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Компания *</Label><Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="ООО «Компания»" /></div>
            <div><Label>ИНН</Label><Input value={companyInn} onChange={e => setCompanyInn(e.target.value)} placeholder="1234567890" /></div>
            <div><Label>Email</Label><Input value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} /></div>
            <div><Label>Телефон</Label><Input value={companyPhone} onChange={e => setCompanyPhone(e.target.value)} /></div>
            <div><Label>Контактное лицо</Label><Input value={contactPerson} onChange={e => setContactPerson(e.target.value)} /></div>
            <div><Label>Действует до</Label><Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} /></div>
          </div>

          {/* Tariff + Manager */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Тариф</Label>
              <Select value={tariffPlan} onValueChange={handleTariffChange}>
                <SelectTrigger><SelectValue placeholder="Выберите тариф" /></SelectTrigger>
                <SelectContent>
                  {Object.values(SUBSCRIPTION_PLANS).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} — {p.price.toLocaleString('ru-RU')} ₽/мес</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Менеджер</Label>
              <Select value={managerId} onValueChange={setManagerId}>
                <SelectTrigger><SelectValue placeholder="Не назначен" /></SelectTrigger>
                <SelectContent>
                  {managers.filter(m => m.is_active).map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Service lines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Услуги и позиции</Label>
              <div className="flex gap-2">
                {services.length > 0 && (
                  <Select onValueChange={addServiceFromCatalog}>
                    <SelectTrigger className="w-[200px]"><SelectValue placeholder="Из каталога..." /></SelectTrigger>
                    <SelectContent>
                      {services.filter(s => s.is_active).map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name} — {s.price.toLocaleString('ru-RU')} ₽</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button variant="outline" size="sm" onClick={addCustomLine}><Plus className="w-3 h-3 mr-1" />Произвольная</Button>
              </div>
            </div>

            {serviceLines.map((line, idx) => (
              <div key={idx} className="flex items-start gap-2 p-3 bg-secondary/30 rounded-lg">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div className="md:col-span-2">
                    <Input value={line.custom_name} onChange={e => updateLine(idx, 'custom_name', e.target.value)} placeholder="Название" />
                  </div>
                  <Input type="number" value={line.price} onChange={e => updateLine(idx, 'price', Number(e.target.value))} placeholder="Цена" />
                  <Input type="number" value={line.quantity} onChange={e => updateLine(idx, 'quantity', Number(e.target.value))} placeholder="Кол-во" min={1} />
                </div>
                <span className="text-sm font-medium whitespace-nowrap pt-2">{(line.price * line.quantity).toLocaleString('ru-RU')} ₽</span>
                <Button variant="ghost" size="icon" onClick={() => removeLine(idx)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </div>
            ))}
          </div>

          {/* Sender info */}
          <div className="space-y-2">
            <Label className="text-base font-semibold">Шапка КП (от кого)</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div><Label>Название компании</Label><Input value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="СИНТАГМА" /></div>
              <div><Label>Email отправителя</Label><Input value={senderEmail} onChange={e => setSenderEmail(e.target.value)} placeholder="info@synthagma.ru" /></div>
              <div><Label>Сайт</Label><Input value={senderWebsite} onChange={e => setSenderWebsite(e.target.value)} placeholder="synthagma.ru" /></div>
            </div>
          </div>

          {/* Note */}
          <div><Label>Примечание</Label><Textarea value={customNote} onChange={e => setCustomNote(e.target.value)} placeholder="Персональное предложение..." /></div>

          {/* Discount + Total */}
          <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <Label className="whitespace-nowrap">Скидка, %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={discountPercent}
                onChange={e => setDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value))))}
                className="w-20"
              />
            </div>
            <div className="flex-1 text-right">
              {discountPercent > 0 && (
                <div className="text-sm text-muted-foreground">
                  <span className="line-through">{subtotal.toLocaleString('ru-RU')} ₽</span>
                  <span className="ml-2 text-destructive">−{discountAmount.toLocaleString('ru-RU')} ₽</span>
                </div>
              )}
              <span className="text-xl font-bold">Итого: {totalAmount.toLocaleString('ru-RU')} ₽</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowPreview(true)} disabled={serviceLines.length === 0}>
                <Eye className="w-4 h-4 mr-1" />Предпросмотр
              </Button>
              <Button onClick={handleSave} disabled={saving || !companyName}>
                {saving ? 'Сохранение...' : 'Создать КП'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ProposalPreview
        open={showPreview}
        onClose={() => setShowPreview(false)}
        proposal={previewProposal}
        services={previewServices}
        discountPercent={discountPercent}
        senderName={senderName}
        senderEmail={senderEmail}
        senderWebsite={senderWebsite}
      />
    </>
  );
}
