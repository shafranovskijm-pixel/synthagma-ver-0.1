import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { CallResultForm } from './CallResultForm';
import { CallLogsList } from './CallLogsList';
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
  const [searchParams] = useSearchParams();

  // Если открылся предпросмотр КП в родительском окне — закрываем шторку лида
  useEffect(() => {
    if (searchParams.get('proposalPreview') && open) {
      onOpenChange(false);
    }
  }, [searchParams, open, onOpenChange]);

  // Прокручиваем к встроенной карточке лида при открытии
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      document.getElementById('inline-lead-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
    return () => clearTimeout(t);
  }, [open, lead?.id]);

  const { activities, fetchActivities, updateLeadStatus, updateLeadNotes, addActivity } = useSalesManager();
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('new');
  const [resultOpen, setResultOpen] = useState(false);
  const [presetResult, setPresetResult] = useState<CallResultKey | undefined>();
  const [directorName, setDirectorName] = useState<string | null>(null);
  const [isCalling, setIsCalling] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  const [proposalPopoverOpen, setProposalPopoverOpen] = useState(false);
  const [openingOverride, setOpeningOverride] = useState<string | null>(null);

  // Быстрая отправка КП — счётчик шаблонов для бейджа
  const [proposalTemplates, setProposalTemplates] = useState<ProposalTpl[]>([]);
  const [sendEmail, setSendEmail] = useState('');

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
        setProposalTemplates((data || []) as ProposalTpl[]);
      });
  }, [open]);

  // Персональный вступительный монолог менеджера (если задан в его карточке)
  useEffect(() => {
    if (!user) return;
    (supabase as any)
      .from('sales_managers')
      .select('script_overrides')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }: any) => {
        const ov = data?.script_overrides?.opening;
        setOpeningOverride(typeof ov === 'string' && ov.trim() ? ov : null);
      });
  }, [user?.id]);

  // Слушаем события браузерного софтфона: завершение звонка открывает панель «Итог» внутри карточки лида
  useEffect(() => {
    if (!lead) return;
    const onEnded = () => {
      setPresetResult(undefined);
      setResultOpen(true);
      setActiveTab('result');
      if (!open) onOpenChange(true);
    };
    window.addEventListener('softphone:ended', onEnded);
    return () => {
      window.removeEventListener('softphone:ended', onEnded);
    };
  }, [lead?.id, open, onOpenChange]);

  const leadActs = useMemo(() => activities.filter(a => lead && a.lead_id === lead.id), [activities, lead]);
  const calls = leadActs.filter(a => a.activity_type === 'call');

  const monolog = useMemo(
    () => fillScriptTemplate(openingOverride || openingMonolog, {
      companyName: lead?.org_name,
      managerName,
      contactName: directorName ?? undefined,
      phone: lead?.phone ?? undefined,
    }),
    [lead?.org_name, lead?.phone, managerName, directorName, openingOverride],
  );

  const extraPhones = useMemo(
    () => extractExtraPhones(notes, lead?.phone),
    [notes, lead?.phone],
  );

  if (!lead) return null;

  const localTime = getRegionLocalTime(lead.region);
  const okHours = isBusinessHours(lead.region);
  const st = LEAD_STATUS_MAP[status] || LEAD_STATUS_MAP.new;


  const handleQuickCall = async (overrideNumber?: string) => {
    const dial = overrideNumber || lead.phone;
    if (!dial) return;
    window.dispatchEvent(new CustomEvent('softphone:call', {
      detail: {
        number: dial,
        lead_id: lead.id,
        company_inn: lead.inn,
        company_name: lead.org_name,
        operator_number: managerPhone || undefined,
      },
    }));
    toast.message('Запускаем звонок', { description: `Novofon наберёт менеджера и соединит с ${formatRuPhone(dial) || dial}.` });
    await addActivity(lead.id, null, 'call', `Исходящий звонок Novofon: ${dial}`);
  };



  const handleQuickResult = (key: CallResultKey) => {
    setPresetResult(key);
    setResultOpen(true);
  };


  if (!open) return null;

  return (
    <>
      <div
        id="inline-lead-card"
        className={`relative w-full bg-background rounded-2xl border shadow-lg overflow-hidden animate-in fade-in-0 slide-in-from-top-2 my-4 ${proposalPopoverOpen ? 'hidden' : ''}`}
      >

        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Закрыть"
          className="absolute top-3 right-3 z-10 rounded-full p-2 hover:bg-muted text-muted-foreground"
        >
          ✕
        </button>
        <div className="flex flex-col">
          <div className="p-4 border-b space-y-2">
            <h2 className="text-base leading-tight pr-8 font-semibold">{lead.org_name}</h2>
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
              <Button size="sm" variant="outline" className="h-8" onClick={() => { setPresetResult(undefined); setResultOpen(true); setActiveTab('result'); }}>
                Результат
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={proposalTemplates.length === 0}
                onClick={() => setProposalPopoverOpen(true)}
              >
                <Send className="w-3.5 h-3.5 mr-1" />Отправить КП
                {proposalTemplates.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">{proposalTemplates.length}</Badge>
                )}
              </Button>
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
          </div>

          <div>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full grid grid-cols-6 rounded-none border-b h-9 bg-transparent">
                <TabsTrigger value="summary" className="text-xs">Сводка</TabsTrigger>
                <TabsTrigger value="script" className="text-xs">Скрипт</TabsTrigger>
                <TabsTrigger value="result" className="text-xs">Итог</TabsTrigger>
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
                <ColdCallScriptCard
                  leadName={lead.org_name}
                  managerName={managerName}
                  contactName={directorName ?? undefined}
                  onQuickResult={handleQuickResult}
                />
              </TabsContent>

              <TabsContent value="result" className="p-4">
                <CallResultForm
                  lead={lead}
                  initialResult={presetResult}
                  resetKey={resultOpen ? `${lead.id}-open` : `${lead.id}-closed`}
                  onSaved={() => { fetchActivities(lead.id); setResultOpen(false); }}
                  onSaveAndNext={onSaveAndNext ? () => { onSaveAndNext(); setResultOpen(false); } : undefined}
                  onCancel={() => { setResultOpen(false); setActiveTab('summary'); }}
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
                <Button
                  className="w-full justify-start"
                  onClick={() => setProposalPopoverOpen(true)}
                  disabled={proposalTemplates.length === 0}
                >
                  <Send className="w-4 h-4 mr-2" />
                  Отправить готовое КП
                  {proposalTemplates.length > 0 && (
                    <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[10px]">{proposalTemplates.length}</Badge>
                  )}
                </Button>

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
        </div>
      </div>





      <SendProposalDialog
        open={proposalPopoverOpen}
        onOpenChange={setProposalPopoverOpen}
        companyName={lead.org_name}
        contactPerson={directorName}
        defaultEmail={sendEmail || lead.email || ''}
        leadId={lead.id}
        managerName={managerName}
        onSent={(name) => {
          addActivity(lead.id, null, 'email', `Отправлено КП «${name}» на ${sendEmail || lead.email}`);
        }}
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
