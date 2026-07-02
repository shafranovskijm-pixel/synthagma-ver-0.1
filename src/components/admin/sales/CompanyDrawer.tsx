import { useState, useEffect, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SendProposalDialog } from './SendProposalDialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Phone, Mail, Globe, MapPin, Building2, FileText, ScrollText, MessageSquare, PhoneCall, Send } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useSalesManager, type SalesLead, type LeadActivity } from '@/hooks/useSalesManager';
import { getRegionLocalTime, isBusinessHours } from '@/utils/regionTimezones';
import { ColdCallScriptCard } from './ColdCallScriptCard';
import { CallResultModal } from './CallResultModal';
import { CallLogsList } from './CallLogsList';
import { KaraokeScript } from './KaraokeScript';
import { openingMonolog, fillScriptTemplate } from '@/constants/coldCallScript';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/handleSupabaseError';
import { useAuth } from '@/hooks/useAuth';
import type { CallResultKey } from '@/constants/coldCallScript';
import { extractExtraPhones, formatRuPhone } from '@/utils/phoneParser';


const LEAD_STATUS_MAP: Record<string, { label: string; color: string }> = {
  new: { label: 'Новый', color: 'bg-blue-500/10 text-blue-500' },
  in_progress: { label: 'В работе', color: 'bg-yellow-500/10 text-yellow-600' },
  contacted: { label: 'Контакт', color: 'bg-purple-500/10 text-purple-500' },
  interested: { label: 'Есть интерес', color: 'bg-emerald-500/10 text-emerald-600' },
  not_interested: { label: 'Отказ', color: 'bg-rose-500/10 text-rose-500' },
  client: { label: 'Клиент', color: 'bg-emerald-500/10 text-emerald-500' },
};

interface Props {
  lead: SalesLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  managerName?: string;
  managerPhone?: string | null;
  onCreateProposal?: (lead: SalesLead) => void;
  onCreateContract?: (lead: SalesLead) => void;
  onSaveAndNext?: () => void;
}

interface ProposalTpl { id: string; company_name: string; total_amount: number }

export function CompanyDrawer({ lead, open, onOpenChange, managerName, managerPhone, onCreateProposal, onCreateContract, onSaveAndNext }: Props) {
  const { user } = useAuth();
  const { activities, fetchActivities, updateLeadStatus, updateLeadNotes, addActivity } = useSalesManager();
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('new');
  const [resultOpen, setResultOpen] = useState(false);
  const [presetResult, setPresetResult] = useState<CallResultKey | undefined>();
  const [directorName, setDirectorName] = useState<string | null>(null);
  const [isCalling, setIsCalling] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  const [proposalPopoverOpen, setProposalPopoverOpen] = useState(false);

  // Быстрая отправка КП
  const [proposalTemplates, setProposalTemplates] = useState<ProposalTpl[]>([]);
  const [selectedTpl, setSelectedTpl] = useState<string>('');
  const [sendEmail, setSendEmail] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (lead) {
      fetchActivities(lead.id);
      setNotes(lead.notes || '');
      setStatus(lead.status);
      setDirectorName(null);
      setSendEmail(lead.email || '');
      setIsCalling(false);
      if (lead.inn) {
        supabase
          .from('sales_companies_db')
          .select('director')
          .eq('inn', lead.inn)
          .maybeSingle()
          .then(({ data }) => setDirectorName(data?.director ?? null));
      }
    }
  }, [lead, fetchActivities]);

  // Загружаем шаблоны КП один раз при открытии дровера
  useEffect(() => {
    if (!open) return;
    supabase
      .from('commercial_proposals')
      .select('id, company_name, total_amount')
      .eq('is_template', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const list = (data || []) as ProposalTpl[];
        setProposalTemplates(list);
        if (list.length && !selectedTpl) setSelectedTpl(list[0].id);
      });
  }, [open]);

  // Останавливаем караоке когда закрывается диалог результата
  useEffect(() => {
    if (!resultOpen) setIsCalling(false);
  }, [resultOpen]);

  const leadActs = useMemo(() => activities.filter(a => lead && a.lead_id === lead.id), [activities, lead]);
  const calls = leadActs.filter(a => a.activity_type === 'call');

  const monolog = useMemo(
    () => fillScriptTemplate(openingMonolog, {
      companyName: lead?.org_name,
      managerName,
      contactName: directorName ?? undefined,
      phone: lead?.phone ?? undefined,
    }),
    [lead?.org_name, lead?.phone, managerName, directorName],
  );

  if (!lead) return null;

  const localTime = getRegionLocalTime(lead.region);
  const okHours = isBusinessHours(lead.region);
  const st = LEAD_STATUS_MAP[status] || LEAD_STATUS_MAP.new;

  const extraPhones = useMemo(
    () => extractExtraPhones(notes, lead?.phone),
    [notes, lead?.phone],
  );

  const handleQuickCall = async (overrideNumber?: string) => {
    const dial = overrideNumber || lead.phone;
    if (!dial) return;
    setIsCalling(true); // включаем караоке сразу
    try {
      const { data, error } = await supabase.functions.invoke('novofon-call-start', {
        body: {
          to_number: dial,
          lead_id: lead.id,
          company_inn: lead.inn ?? null,
          company_name: lead.org_name ?? null,
          operator_number: managerPhone ?? undefined,
        },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success('Звоним через Novofon', { description: `Набираем ${formatRuPhone(dial)} — ответьте на своём телефоне.` });
      } else {
        toast.error('Не удалось запустить звонок', { description: data?.message || data?.error || data?.novofon?.message || 'Проверьте токен Call API Novofon' });
      }
    } catch (e) {
      toast.error('Ошибка звонка', { description: e instanceof Error ? e.message : String(e) });
    }
    await addActivity(lead.id, null, 'call', `Исходящий звонок Novofon: ${dial}`);
    setPresetResult(undefined);
    setResultOpen(true);
  };


  const handleQuickResult = (key: CallResultKey) => {
    setPresetResult(key);
    setResultOpen(true);
  };

  const handleSendProposal = async () => {
    if (!selectedTpl) { toast.error('Выберите шаблон КП'); return; }
    if (!/^\S+@\S+\.\S+$/.test(sendEmail.trim())) {
      toast.error('Укажите корректный email'); return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-platform-proposal', {
        body: {
          template_proposal_id: selectedTpl,
          recipient_email: sendEmail.trim(),
          company_name: lead.org_name,
          contact_person: directorName ?? null,
          lead_id: lead.id,
          sender_name: managerName || user?.email || 'Менеджер СИНТАГМА',
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const url = (data as any)?.proposal_url;
      toast.success(`КП отправлено на ${sendEmail}`, { description: url });
      await addActivity(lead.id, null, 'email', `Отправлено КП «${proposalTemplates.find(t => t.id === selectedTpl)?.company_name || ''}» на ${sendEmail}`);
    } catch (e) {
      toast.error('Не удалось отправить КП', { description: getErrorMessage(e) });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-[520px] p-0 flex flex-col">
          <SheetHeader className="p-4 border-b space-y-2">
            <SheetTitle className="text-base leading-tight pr-8">{lead.org_name}</SheetTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={st.color}>{st.label}</Badge>
              {localTime && (
                <Badge variant="outline" className={okHours ? 'text-emerald-700 border-emerald-500/40' : 'text-amber-700 border-amber-500/40'}>
                  🕐 {localTime.time} · {lead.region}
                </Badge>
              )}
            </div>
            <div className="flex gap-2 pt-1 flex-wrap">
              <Button size="sm" className="flex-1 min-w-[140px] h-8" disabled={!lead.phone} onClick={() => handleQuickCall()}>
                <Phone className="w-3.5 h-3.5 mr-1" />Позвонить{lead.phone ? ` ${formatRuPhone(lead.phone) || lead.phone}` : ''}
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => { setPresetResult(undefined); setResultOpen(true); }}>
                Результат
              </Button>
              <Popover open={proposalPopoverOpen} onOpenChange={setProposalPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8" disabled={proposalTemplates.length === 0}>
                    <Send className="w-3.5 h-3.5 mr-1" />КП
                    {proposalTemplates.length > 0 && (
                      <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">{proposalTemplates.length}</Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-3 space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Отправить коммерческое предложение
                  </div>
                  <Select value={selectedTpl} onValueChange={setSelectedTpl}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Выберите КП" /></SelectTrigger>
                    <SelectContent>
                      {proposalTemplates.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.company_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="email"
                    value={sendEmail}
                    onChange={e => setSendEmail(e.target.value)}
                    placeholder="email@company.ru"
                    className="h-9"
                  />
                  <Button size="sm" className="w-full h-9" onClick={handleSendProposal} disabled={sending}>
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    {sending ? 'Отправляем…' : 'Отправить с нашей почты'}
                  </Button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                    onClick={() => { setProposalPopoverOpen(false); setActiveTab('docs'); }}
                  >
                    Открыть вкладку «Документы» →
                  </button>
                </PopoverContent>
              </Popover>
            </div>
            {extraPhones.length > 0 && (
              <div className="pt-1">
                <div className="text-[11px] text-muted-foreground mb-1">Доп. телефоны из заметок ({extraPhones.length})</div>
                <div className="flex flex-wrap gap-1.5">
                  {extraPhones.map(p => (
                    <Button
                      key={p}
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleQuickCall(p)}
                      title={`Позвонить на ${p}`}
                    >
                      <Phone className="w-3 h-3 mr-1" />
                      {formatRuPhone(p)}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            {isCalling && (
              <div className="p-4 border-b bg-primary/5">
                <KaraokeScript text={monolog} active={isCalling} />
              </div>
            )}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full grid grid-cols-5 rounded-none border-b h-9 bg-transparent">
                <TabsTrigger value="summary" className="text-xs">Сводка</TabsTrigger>
                <TabsTrigger value="script" className="text-xs">Скрипт</TabsTrigger>
                <TabsTrigger value="calls" className="text-xs">Звонки</TabsTrigger>
                <TabsTrigger value="timeline" className="text-xs">История</TabsTrigger>
                <TabsTrigger value="docs" className="text-xs">Документы</TabsTrigger>
              </TabsList>


              <TabsContent value="summary" className="p-4 space-y-3 text-sm">
                {lead.inn && <Row icon={Building2} label="ИНН" value={lead.inn} />}
                {directorName && <Row icon={Building2} label="Руководитель" value={directorName} />}
                {lead.ogrn && <Row icon={Building2} label="ОГРН" value={lead.ogrn} />}
                {lead.address && <Row icon={MapPin} label="Адрес" value={lead.address} />}
                {lead.phone && <Row icon={Phone} label="Телефон" value={lead.phone} />}
                {lead.email && <Row icon={Mail} label="Email" value={lead.email} />}
                {lead.website && <Row icon={Globe} label="Сайт" value={lead.website} />}

                <div className="pt-2">
                  <div className="text-xs text-muted-foreground mb-1">Статус</div>
                  <Select value={status} onValueChange={v => { setStatus(v); updateLeadStatus(lead.id, v); }}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(LEAD_STATUS_MAP).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1">Заметки</div>
                  <Textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    onBlur={() => updateLeadNotes(lead.id, notes)}
                    rows={4}
                    placeholder="Комментарии, договорённости, боль клиента…"
                  />
                </div>
              </TabsContent>

              <TabsContent value="script" className="p-4 space-y-3">
                {!isCalling && <KaraokeScript text={monolog} active={false} />}
                <ColdCallScriptCard
                  leadName={lead.org_name}
                  managerName={managerName}
                  contactName={directorName ?? undefined}
                  onQuickResult={handleQuickResult}
                />
              </TabsContent>
              <TabsContent value="calls" className="p-4">
                <CallLogsList leadId={lead.id} companyInn={lead.inn ?? undefined} />
              </TabsContent>


              <TabsContent value="timeline" className="p-4 space-y-2">
                {leadActs.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-6">Пока нет активности</div>
                ) : leadActs.map(a => (
                  <ActivityRow key={a.id} a={a} />
                ))}
              </TabsContent>

              <TabsContent value="docs" className="p-4 space-y-3">
                {/* Быстрая отправка готового КП */}
                <div className="border rounded-xl p-3 space-y-2 bg-muted/20">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Отправить готовое коммерческое предложение
                  </div>
                  {proposalTemplates.length === 0 ? (
                    <div className="text-xs text-muted-foreground">Нет доступных шаблонов КП</div>
                  ) : (
                    <>
                      <Select value={selectedTpl} onValueChange={setSelectedTpl}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Выберите КП" /></SelectTrigger>
                        <SelectContent>
                          {proposalTemplates.map(t => (
                            <SelectItem key={t.id} value={t.id}>{t.company_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="email"
                        value={sendEmail}
                        onChange={e => setSendEmail(e.target.value)}
                        placeholder="email@company.ru"
                        className="h-9"
                      />
                      <Button size="sm" className="w-full h-9" onClick={handleSendProposal} disabled={sending}>
                        <Send className="w-3.5 h-3.5 mr-1.5" />
                        {sending ? 'Отправляем…' : 'Отправить с нашей почты'}
                      </Button>
                    </>
                  )}
                </div>

                <Button variant="outline" className="w-full justify-start" onClick={() => onCreateProposal?.(lead)}>
                  <FileText className="w-4 h-4 mr-2" />Создать своё КП
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => onCreateContract?.(lead)}>
                  <ScrollText className="w-4 h-4 mr-2" />Создать договор
                </Button>
                <div className="text-xs text-muted-foreground pt-2">
                  Звонков: {calls.length} · Заметок: {leadActs.filter(a => a.activity_type === 'note').length}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>

      <CallResultModal
        open={resultOpen}
        onOpenChange={setResultOpen}
        lead={lead}
        initialResult={presetResult}
        onSaved={() => fetchActivities(lead.id)}
        onSaveAndNext={onSaveAndNext}
      />
    </>
  );
}

function Row({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="text-sm break-words">{value}</div>
      </div>
    </div>
  );
}

function ActivityRow({ a }: { a: LeadActivity }) {
  const icon = a.activity_type === 'call' ? PhoneCall : a.activity_type === 'email' ? Mail : MessageSquare;
  const Icon = icon;
  return (
    <div className="flex gap-2 p-2.5 rounded-lg border bg-muted/20">
      <Icon className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground">
          {format(new Date(a.created_at), 'd MMM HH:mm', { locale: ru })}
        </div>
        <div className="text-sm whitespace-pre-wrap">{a.description || '—'}</div>
      </div>
    </div>
  );
}
