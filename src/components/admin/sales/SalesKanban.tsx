import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, ScrollText, PenTool, Wallet, MessageSquare, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SigmaSpinner } from '@/components/ui/SigmaSpinner';

interface DealCard {
  inn: string;
  name: string;
  amount: number;
  stage: 'lead' | 'proposal' | 'contract' | 'signing' | 'paid';
  lastActivity: string;
  status: string;
}

const COLUMNS: { id: DealCard['stage']; title: string; icon: any; cls: string }[] = [
  { id: 'lead', title: 'Лиды', icon: MessageSquare, cls: 'border-slate-400/40 bg-slate-500/5' },
  { id: 'proposal', title: 'КП отправлено', icon: FileText, cls: 'border-blue-500/40 bg-blue-500/5' },
  { id: 'contract', title: 'Договор', icon: ScrollText, cls: 'border-amber-500/40 bg-amber-500/5' },
  { id: 'signing', title: 'На подписи', icon: PenTool, cls: 'border-violet-500/40 bg-violet-500/5' },
  { id: 'paid', title: 'Оплачено', icon: Wallet, cls: 'border-emerald-500/40 bg-emerald-500/5' },
];

export function SalesKanban({ onSelectCompany }: { onSelectCompany?: (inn: string) => void }) {
  const [deals, setDeals] = useState<DealCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [propR, contR, sigR, leadR] = await Promise.all([
        supabase.from('commercial_proposals').select('id, company_inn, company_name, status, total_amount, created_at, updated_at').is('deleted_at', null),
        supabase.from('sales_contracts').select('id, company_inn, company_name, status, total_amount, created_at, updated_at'),
        supabase.from('document_signatures').select('id, recipient_name, status, sent_at, created_at, document_title').in('status', ['sent','viewed','in_review','signed']),
        supabase.from('sales_leads').select('id, org_name, inn, status, last_contact_at, created_at'),
      ]);

      const map = new Map<string, DealCard>();

      const ensure = (inn: string | null, name: string): DealCard => {
        const key = inn || name;
        if (!map.has(key)) {
          map.set(key, { inn: inn || '—', name, amount: 0, stage: 'lead', lastActivity: '', status: '' });
        }
        return map.get(key)!;
      };

      // Leads (lowest priority — only if no other docs)
      (leadR.data || []).forEach((l: any) => {
        if (l.status === 'not_interested') return;
        const c = ensure(l.inn, l.org_name);
        c.lastActivity = l.last_contact_at || l.created_at;
        c.status = l.status;
      });

      // Proposals
      (propR.data || []).forEach((p: any) => {
        const c = ensure(p.company_inn, p.company_name);
        c.amount += Number(p.total_amount || 0);
        if (c.stage === 'lead' && p.status !== 'rejected') c.stage = 'proposal';
        if (p.updated_at > c.lastActivity) { c.lastActivity = p.updated_at; c.status = p.status; }
      });

      // Contracts
      (contR.data || []).forEach((c: any) => {
        const d = ensure(c.company_inn, c.company_name);
        d.amount += Number(c.total_amount || 0);
        if (['draft','sent','negotiation'].includes(c.status)) d.stage = 'contract';
        if (['signed','active'].includes(c.status)) d.stage = 'signing';
        if (c.status === 'paid') d.stage = 'paid';
        if (c.updated_at > d.lastActivity) { d.lastActivity = c.updated_at; d.status = c.status; }
      });

      // Signatures: bump to signing if pending, paid stays
      (sigR.data || []).forEach((s: any) => {
        const existing = Array.from(map.values()).find(x =>
          x.name.toLowerCase().includes((s.recipient_name || '').toLowerCase().slice(0, 15))
        );
        if (existing) {
          if (existing.stage !== 'paid' && s.status !== 'signed') existing.stage = 'signing';
          if (s.status === 'signed' && existing.stage !== 'paid') existing.stage = 'signing';
        }
      });

      setDeals(Array.from(map.values()).sort((a, b) => b.lastActivity.localeCompare(a.lastActivity)));
    } catch (e) {
      console.error('SalesKanban load', e);
    } finally {
      setLoading(false);
    }
  }

  const grouped = useMemo(() => {
    const g = new Map<DealCard['stage'], DealCard[]>();
    COLUMNS.forEach(c => g.set(c.id, []));
    deals.forEach(d => g.get(d.stage)?.push(d));
    return g;
  }, [deals]);

  if (loading) {
    return <div className="flex justify-center py-12"><SigmaSpinner size="lg" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {COLUMNS.map(col => {
          const items = grouped.get(col.id) || [];
          const total = items.reduce((s, d) => s + d.amount, 0);
          const Icon = col.icon;
          return (
            <Card key={col.id} className={cn("rounded-2xl border-2", col.cls)}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5" />
                    <span className="text-xs font-semibold">{col.title}</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 rounded-md">
                    {items.length}
                  </Badge>
                </div>
                {total > 0 && (
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    {(total / 1000).toFixed(0)} тыс ₽
                  </div>
                )}
                <ScrollArea className="h-[calc(100vh-380px)] -mx-1">
                  <div className="space-y-1.5 px-1">
                    {items.length === 0 && (
                      <div className="text-center text-xs text-muted-foreground py-6">Пусто</div>
                    )}
                    {items.map(d => (
                      <button key={d.inn + d.name}
                        onClick={() => onSelectCompany?.(d.inn)}
                        className="w-full text-left p-2.5 rounded-xl bg-card border hover:shadow-sm hover:border-primary/40 transition-all">
                        <div className="flex items-start gap-1.5">
                          <Building2 className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">{d.name}</div>
                            {d.inn !== '—' && (
                              <div className="text-[10px] text-muted-foreground truncate">ИНН: {d.inn}</div>
                            )}
                            {d.amount > 0 && (
                              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                                {d.amount.toLocaleString('ru-RU')} ₽
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Клик по карточке откроет компанию в «Сделки 360°»
      </p>
    </div>
  );
}
