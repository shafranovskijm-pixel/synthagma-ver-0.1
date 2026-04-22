import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Phone, Mail, Calendar, FileText, MessageSquare, History, ScrollText, PenTool, Receipt, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { cn } from '@/lib/utils';

type CommType =
  | 'call' | 'email' | 'meeting' | 'note'
  | 'proposal_sent' | 'proposal_viewed'
  | 'contract_sent' | 'contract_signed'
  | 'signature_sent' | 'signature_signed'
  | 'invoice_issued' | 'invoice_paid';

interface CommItem {
  id: string;
  type: CommType;
  text: string;
  created_at: string;
}

interface Props {
  inn: string;
  companyName: string;
  /** Изменение значения вызывает повторную загрузку истории */
  refreshKey?: number;
}

const ICONS: Record<CommType, any> = {
  call: Phone,
  email: Mail,
  meeting: Calendar,
  note: MessageSquare,
  proposal_sent: FileText,
  proposal_viewed: FileText,
  contract_sent: ScrollText,
  contract_signed: CheckCircle2,
  signature_sent: PenTool,
  signature_signed: CheckCircle2,
  invoice_issued: Receipt,
  invoice_paid: CheckCircle2,
};

const COLORS: Record<CommType, string> = {
  call: 'text-blue-600 bg-blue-500/10',
  email: 'text-purple-600 bg-purple-500/10',
  meeting: 'text-amber-600 bg-amber-500/10',
  note: 'text-slate-600 bg-slate-500/10 dark:text-slate-300',
  proposal_sent: 'text-emerald-600 bg-emerald-500/10',
  proposal_viewed: 'text-cyan-600 bg-cyan-500/10',
  contract_sent: 'text-amber-600 bg-amber-500/10',
  contract_signed: 'text-emerald-600 bg-emerald-500/10',
  signature_sent: 'text-violet-600 bg-violet-500/10',
  signature_signed: 'text-emerald-600 bg-emerald-500/10',
  invoice_issued: 'text-amber-600 bg-amber-500/10',
  invoice_paid: 'text-emerald-600 bg-emerald-500/10',
};

export function DealCommunication({ inn, companyName, refreshKey = 0 }: Props) {
  const [items, setItems] = useState<CommItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inn, companyName, refreshKey]);

  async function load() {
    setLoading(true);
    try {
      // Безопасный поиск: 2 отдельных запроса вместо .or() с интерполяцией
      // (запятые/скобки в названии компании ломают PostgREST-запрос).
      const namePrefix = companyName.slice(0, 30).trim();

      // 1) Найти лид: сначала по ИНН (если есть), иначе по началу названия.
      let lead: { id: string } | null = null;
      if (inn) {
        const { data } = await supabase
          .from('sales_leads')
          .select('id')
          .eq('inn', inn)
          .limit(1)
          .maybeSingle();
        lead = data;
      }
      if (!lead && namePrefix) {
        const { data } = await supabase
          .from('sales_leads')
          .select('id')
          .ilike('org_name', `${namePrefix}%`)
          .limit(1)
          .maybeSingle();
        lead = data;
      }

      const collected: CommItem[] = [];

      if (lead?.id) {
        const { data: acts } = await supabase
          .from('sales_lead_activities')
          .select('id, activity_type, description, created_at')
          .eq('lead_id', lead.id)
          .order('created_at', { ascending: false })
          .limit(20);
        (acts || []).forEach((a: any) => {
          collected.push({
            id: `act-${a.id}`,
            type: (['call','email','meeting','note'].includes(a.activity_type) ? a.activity_type : 'note') as any,
            text: a.description || labelByType(a.activity_type),
            created_at: a.created_at,
          });
        });
      }

      // 2) КП: тоже 2 раздельных запроса, объединяем по id.
      type ProposalRow = {
        id: string; last_sent_at: string | null; view_count: number;
        last_viewed_at: string | null; total_amount: number; status: string;
      };
      const proposalsMap = new Map<string, ProposalRow>();
      if (inn) {
        const { data } = await supabase
          .from('commercial_proposals')
          .select('id, last_sent_at, view_count, last_viewed_at, total_amount, status')
          .eq('company_inn', inn)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(10);
        (data || []).forEach((p: any) => proposalsMap.set(p.id, p));
      }
      if (namePrefix) {
        const { data } = await supabase
          .from('commercial_proposals')
          .select('id, last_sent_at, view_count, last_viewed_at, total_amount, status')
          .ilike('company_name', `${namePrefix}%`)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(10);
        (data || []).forEach((p: any) => {
          if (!proposalsMap.has(p.id)) proposalsMap.set(p.id, p);
        });
      }
      const props = Array.from(proposalsMap.values());

      (props || []).forEach((p: any) => {
        if (p.last_sent_at) {
          collected.push({
            id: `psent-${p.id}`,
            type: 'proposal_sent',
            text: `Отправлено КП на ${Number(p.total_amount).toLocaleString('ru-RU')} ₽`,
            created_at: p.last_sent_at,
          });
        }
        if (p.view_count > 0 && p.last_viewed_at) {
          collected.push({
            id: `pview-${p.id}`,
            type: 'proposal_viewed',
            text: `Клиент открыл КП (просмотров: ${p.view_count})`,
            created_at: p.last_viewed_at,
          });
        }
      });

      // 3) Договоры по компании — отправлен / подписан
      type ContractRow = {
        id: string; status: string; updated_at: string; created_at: string;
        contract_number: string | null; total_amount: number;
      };
      const contractsMap = new Map<string, ContractRow>();
      if (inn) {
        const { data } = await supabase
          .from('sales_contracts')
          .select('id, status, updated_at, created_at, contract_number, total_amount')
          .eq('company_inn', inn)
          .order('created_at', { ascending: false })
          .limit(10);
        (data || []).forEach((c: any) => contractsMap.set(c.id, c));
      }
      if (namePrefix) {
        const { data } = await supabase
          .from('sales_contracts')
          .select('id, status, updated_at, created_at, contract_number, total_amount')
          .ilike('company_name', `${namePrefix}%`)
          .order('created_at', { ascending: false })
          .limit(10);
        (data || []).forEach((c: any) => {
          if (!contractsMap.has(c.id)) contractsMap.set(c.id, c);
        });
      }
      contractsMap.forEach((c) => {
        const number = c.contract_number ? `№${c.contract_number}` : 'б/н';
        const sum = Number(c.total_amount || 0).toLocaleString('ru-RU');
        if (c.status === 'sent') {
          collected.push({
            id: `csent-${c.id}`, type: 'contract_sent',
            text: `Договор ${number} отправлен на ${sum} ₽`,
            created_at: c.updated_at || c.created_at,
          });
        }
        if (['signed', 'active'].includes(c.status)) {
          collected.push({
            id: `csigned-${c.id}`, type: 'contract_signed',
            text: `Договор ${number} подписан (${sum} ₽)`,
            created_at: c.updated_at || c.created_at,
          });
        }
      });

      // 4) Подписания документов — на подписи / подписано
      if (namePrefix) {
        const { data } = await supabase
          .from('document_signatures')
          .select('id, document_title, status, sent_at, signed_at, created_at, recipient_name')
          .ilike('recipient_name', `${namePrefix}%`)
          .order('created_at', { ascending: false })
          .limit(15);
        (data || []).forEach((s: any) => {
          if (s.status === 'signed' && s.signed_at) {
            collected.push({
              id: `ssigned-${s.id}`, type: 'signature_signed',
              text: `Подписан документ «${s.document_title}»`,
              created_at: s.signed_at,
            });
          } else if (['sent', 'viewed', 'in_review'].includes(s.status) && s.sent_at) {
            collected.push({
              id: `ssent-${s.id}`, type: 'signature_sent',
              text: `Документ «${s.document_title}» отправлен на подпись`,
              created_at: s.sent_at,
            });
          }
        });
      }

      collected.sort((a, b) => b.created_at.localeCompare(a.created_at));
      setItems(collected.slice(0, 25));
    } catch (e) {
      console.error('DealCommunication load', e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3 flex items-center gap-2">
          <History className="w-3.5 h-3.5" />
          История общения
        </div>
        {loading ? (
          <div className="text-center text-sm text-muted-foreground py-4">Загрузка...</div>
        ) : items.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-6">
            Пока нет активностей
          </div>
        ) : (
          <ScrollArea className="h-[280px]">
            <div className="space-y-2 pr-2">
              {items.map(it => {
                const Icon = ICONS[it.type] || MessageSquare;
                const colorCls = COLORS[it.type] || 'text-muted-foreground bg-muted';
                return (
                  <div key={it.id} className="flex items-start gap-3 p-2.5 rounded-lg border hover:bg-muted/30 transition-colors">
                    <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", colorCls)}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{it.text}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(it.created_at), 'dd MMM yyyy, HH:mm', { locale: ru })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function labelByType(t: string): string {
  return {
    call: 'Звонок',
    email: 'Email',
    meeting: 'Встреча',
    note: 'Заметка',
  }[t] || 'Событие';
}
