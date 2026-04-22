import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Phone, Mail, Calendar, FileText, MessageSquare, History } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface CommItem {
  id: string;
  type: 'call' | 'email' | 'meeting' | 'note' | 'proposal_sent' | 'proposal_viewed';
  text: string;
  created_at: string;
}

interface Props {
  inn: string;
  companyName: string;
}

const ICONS = {
  call: Phone,
  email: Mail,
  meeting: Calendar,
  note: MessageSquare,
  proposal_sent: FileText,
  proposal_viewed: FileText,
} as const;

const COLORS = {
  call: 'text-blue-600 bg-blue-500/10',
  email: 'text-purple-600 bg-purple-500/10',
  meeting: 'text-amber-600 bg-amber-500/10',
  note: 'text-slate-600 bg-slate-500/10 dark:text-slate-300',
  proposal_sent: 'text-emerald-600 bg-emerald-500/10',
  proposal_viewed: 'text-cyan-600 bg-cyan-500/10',
} as const;

export function DealCommunication({ inn, companyName }: Props) {
  const [items, setItems] = useState<CommItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, [inn, companyName]);

  async function load() {
    setLoading(true);
    try {
      // Find lead by inn or org_name
      const { data: lead } = await supabase
        .from('sales_leads')
        .select('id')
        .or(`inn.eq.${inn},org_name.ilike.${companyName.slice(0, 30)}%`)
        .limit(1)
        .maybeSingle();

      const collected: CommItem[] = [];

      if (lead?.id) {
        const { data: acts } = await supabase
          .from('sales_lead_activities')
          .select('id, type, notes, created_at')
          .eq('lead_id', lead.id)
          .order('created_at', { ascending: false })
          .limit(20);
        (acts || []).forEach((a: any) => {
          collected.push({
            id: `act-${a.id}`,
            type: (['call','email','meeting','note'].includes(a.type) ? a.type : 'note') as any,
            text: a.notes || labelByType(a.type),
            created_at: a.created_at,
          });
        });
      }

      // Proposals sent / viewed
      const { data: props } = await supabase
        .from('commercial_proposals')
        .select('id, last_sent_at, view_count, last_viewed_at, total_amount, status')
        .or(`company_inn.eq.${inn},company_name.ilike.${companyName.slice(0, 30)}%`)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10);

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

      collected.sort((a, b) => b.created_at.localeCompare(a.created_at));
      setItems(collected.slice(0, 15));
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
