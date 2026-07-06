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
  const [searchParams] = useSearchParams();

  // Если открылся предпросмотр КП в родительском окне — закрываем шторку лида
  useEffect(() => {
    if (searchParams.get('proposalPreview') && open) {
      onOpenChange(false);
    }
  }, [searchParams, open, onOpenChange]);
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

  // Останавливаем караоке когда закрывается диалог результата
  useEffect(() => {
    if (!resultOpen) setIsCalling(false);
  }, [resultOpen]);

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


  if (!open) {
    return (
      <>
        <CallResultModal
          open={resultOpen}
          onOpenChange={setResultOpen}
          lead={lead}
          initialResult={presetResult}
          onSaved={() => lead && fetchActivities(lead.id)}
          onSaveAndNext={onSaveAndNext}
        />
      </>
    );
  }

  return (
    <>
      <div
        id="inline-lead-card"
        className="relative w-full bg-background rounded-2xl border shadow-lg overflow-hidden animate-in fade-in-0 slide-in-from-top-2 my-4"
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



      <CallResultModal
        open={resultOpen}
        onOpenChange={setResultOpen}
        lead={lead}
        initialResult={presetResult}
        onSaved={() => fetchActivities(lead.id)}
        onSaveAndNext={onSaveAndNext}
      />

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
