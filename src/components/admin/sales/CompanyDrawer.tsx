import { useState, useEffect, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Phone, Mail, Globe, MapPin, Building2, FileText, ScrollText, MessageSquare, PhoneCall } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useSalesManager, type SalesLead, type LeadActivity } from '@/hooks/useSalesManager';
import { getRegionLocalTime, isBusinessHours } from '@/utils/regionTimezones';
import { ColdCallScriptCard } from './ColdCallScriptCard';
import { CallResultModal } from './CallResultModal';
import { CallLogsList } from './CallLogsList';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { CallResultKey } from '@/constants/coldCallScript';


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
  onCreateProposal?: (lead: SalesLead) => void;
  onCreateContract?: (lead: SalesLead) => void;
  onSaveAndNext?: () => void;
}

export function CompanyDrawer({ lead, open, onOpenChange, managerName, onCreateProposal, onCreateContract, onSaveAndNext }: Props) {
  const { activities, fetchActivities, updateLeadStatus, updateLeadNotes, addActivity } = useSalesManager();
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('new');
  const [resultOpen, setResultOpen] = useState(false);
  const [presetResult, setPresetResult] = useState<CallResultKey | undefined>();

  useEffect(() => {
    if (lead) {
      fetchActivities(lead.id);
      setNotes(lead.notes || '');
      setStatus(lead.status);
    }
  }, [lead, fetchActivities]);

  const leadActs = useMemo(() => activities.filter(a => lead && a.lead_id === lead.id), [activities, lead]);
  const calls = leadActs.filter(a => a.activity_type === 'call');

  if (!lead) return null;

  const localTime = getRegionLocalTime(lead.region);
  const okHours = isBusinessHours(lead.region);
  const st = LEAD_STATUS_MAP[status] || LEAD_STATUS_MAP.new;

  const handleQuickCall = async () => {
    if (!lead.phone) return;
    try {
      const { data, error } = await supabase.functions.invoke('novofon-call-start', {
        body: {
          to_number: lead.phone,
          lead_id: lead.id,
          company_inn: lead.inn ?? null,
          company_name: lead.org_name ?? null,
        },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success('Звоним через Novofon', { description: 'Ответьте на своём телефоне — АТС соединит с клиентом.' });
      } else {
        toast.error('Не удалось запустить звонок', { description: data?.novofon?.message || 'Проверьте настройки Novofon' });
      }
    } catch (e) {
      toast.error('Ошибка звонка', { description: e instanceof Error ? e.message : String(e) });
    }
    await addActivity(lead.id, null, 'call', `Исходящий звонок Novofon: ${lead.phone}`);
    setPresetResult(undefined);
    setResultOpen(true);
  };


  const handleQuickResult = (key: CallResultKey) => {
    setPresetResult(key);
    setResultOpen(true);
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
            <div className="flex gap-2 pt-1">
              <Button size="sm" className="flex-1 h-8" disabled={!lead.phone} onClick={handleQuickCall}>
                <Phone className="w-3.5 h-3.5 mr-1" />Позвонить
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => { setPresetResult(undefined); setResultOpen(true); }}>
                Результат
              </Button>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            <Tabs defaultValue="summary" className="w-full">
              <TabsList className="w-full grid grid-cols-5 rounded-none border-b h-9 bg-transparent">
                <TabsTrigger value="summary" className="text-xs">Сводка</TabsTrigger>
                <TabsTrigger value="script" className="text-xs">Скрипт</TabsTrigger>
                <TabsTrigger value="calls" className="text-xs">Звонки</TabsTrigger>
                <TabsTrigger value="timeline" className="text-xs">История</TabsTrigger>
                <TabsTrigger value="docs" className="text-xs">Документы</TabsTrigger>
              </TabsList>


              <TabsContent value="summary" className="p-4 space-y-3 text-sm">
                {lead.inn && <Row icon={Building2} label="ИНН" value={lead.inn} />}
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

              <TabsContent value="script" className="p-4">
                <ColdCallScriptCard
                  leadName={lead.org_name}
                  managerName={managerName}
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

              <TabsContent value="docs" className="p-4 space-y-2">
                <Button variant="outline" className="w-full justify-start" onClick={() => onCreateProposal?.(lead)}>
                  <FileText className="w-4 h-4 mr-2" />Создать КП
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
