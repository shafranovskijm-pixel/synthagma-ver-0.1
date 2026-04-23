import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, ScrollText, PenTool, Wallet, MessageSquare, Building2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SigmaSpinner } from '@/components/ui/SigmaSpinner';
import { toast } from 'sonner';
import { getErrorMessage } from "@/utils/handleSupabaseError";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';

type Stage = 'lead' | 'proposal' | 'contract' | 'signing' | 'paid';

interface DealCard {
  inn: string;
  name: string;
  amount: number;
  stage: Stage;
  lastActivity: string;
  status: string;
  // ids самых свежих сущностей — для апдейтов при drag-n-drop
  latestProposalId?: string | null;
  latestContractId?: string | null;
}

const COLUMNS: { id: Stage; title: string; icon: any; cls: string }[] = [
  { id: 'lead', title: 'Лиды', icon: MessageSquare, cls: 'border-slate-400/40 bg-slate-500/5' },
  { id: 'proposal', title: 'КП отправлено', icon: FileText, cls: 'border-blue-500/40 bg-blue-500/5' },
  { id: 'contract', title: 'Договор', icon: ScrollText, cls: 'border-amber-500/40 bg-amber-500/5' },
  { id: 'signing', title: 'На подписи', icon: PenTool, cls: 'border-violet-500/40 bg-violet-500/5' },
  { id: 'paid', title: 'Оплачено', icon: Wallet, cls: 'border-emerald-500/40 bg-emerald-500/5' },
];

interface Props {
  onSelectCompany?: (inn: string) => void;
  organizationId?: string;
}

export function SalesKanban({ onSelectCompany, organizationId }: Props) {
  const [deals, setDeals] = useState<DealCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragKey, setDragKey] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => { void load(); }, [organizationId]);

  async function load() {
    setLoading(true);
    try {
      const applyOrg = <T extends { eq: any }>(q: T): T =>
        organizationId ? q.eq('organization_id', organizationId) : q;

      const [propR, contR, sigR, leadR] = await Promise.all([
        applyOrg(
          supabase.from('commercial_proposals')
            .select('id, company_inn, company_name, status, total_amount, created_at, updated_at')
            .is('deleted_at', null)
            .order('updated_at', { ascending: false })
            .limit(500)
        ),
        applyOrg(
          supabase.from('sales_contracts')
            .select('id, company_inn, company_name, status, total_amount, created_at, updated_at')
            .order('updated_at', { ascending: false })
            .limit(500)
        ),
        applyOrg(
          supabase.from('document_signatures')
            .select('id, recipient_name, status, sent_at, created_at, document_title')
            .in('status', ['sent','viewed','in_review','signed'])
            .order('created_at', { ascending: false })
            .limit(500)
        ),
        applyOrg(
          supabase.from('sales_leads')
            .select('id, org_name, inn, status, last_contact_at, created_at')
            .order('created_at', { ascending: false })
            .limit(500)
        ),
      ]);

      const map = new Map<string, DealCard>();
      const byNameLower = new Map<string, DealCard>();

      const ensure = (inn: string | null, name: string): DealCard => {
        const key = inn || name;
        if (!map.has(key)) {
          const d: DealCard = {
            inn: inn || '—', name, amount: 0, stage: 'lead',
            lastActivity: '', status: '',
            latestProposalId: null, latestContractId: null,
          };
          map.set(key, d);
          if (name) byNameLower.set(name.toLowerCase(), d);
        }
        return map.get(key)!;
      };

      (leadR.data || []).forEach((l: any) => {
        if (l.status === 'not_interested') return;
        const c = ensure(l.inn, l.org_name);
        c.lastActivity = l.last_contact_at || l.created_at;
        c.status = l.status;
      });

      (propR.data || []).forEach((p: any) => {
        const c = ensure(p.company_inn, p.company_name);
        c.amount += Number(p.total_amount || 0);
        if (!c.latestProposalId) c.latestProposalId = p.id; // первая = самая свежая (отсортировано desc)
        if (c.stage === 'lead' && p.status !== 'rejected') c.stage = 'proposal';
        if (p.updated_at > c.lastActivity) { c.lastActivity = p.updated_at; c.status = p.status; }
      });

      (contR.data || []).forEach((c: any) => {
        const d = ensure(c.company_inn, c.company_name);
        d.amount += Number(c.total_amount || 0);
        if (!d.latestContractId) d.latestContractId = c.id;
        if (['draft','sent','negotiation'].includes(c.status)) d.stage = 'contract';
        if (['signed','active'].includes(c.status)) d.stage = 'signing';
        if (c.status === 'paid') d.stage = 'paid';
        if (c.updated_at > d.lastActivity) { d.lastActivity = c.updated_at; d.status = c.status; }
      });

      (sigR.data || []).forEach((s: any) => {
        const recip = (s.recipient_name || '').toLowerCase().trim();
        if (!recip) return;
        const existing = byNameLower.get(recip);
        if (existing) {
          if (existing.stage !== 'paid' && s.status !== 'signed') existing.stage = 'signing';
          if (s.status === 'signed' && existing.stage !== 'paid') existing.stage = 'signing';
        }
      });

      setDeals(Array.from(map.values()).sort((a, b) => (b.lastActivity || '').localeCompare(a.lastActivity || '')));
    } catch (e) {
      console.error('SalesKanban load', e);
    } finally {
      setLoading(false);
    }
  }

  const grouped = useMemo(() => {
    const g = new Map<Stage, DealCard[]>();
    COLUMNS.forEach(c => g.set(c.id, []));
    deals.forEach(d => g.get(d.stage)?.push(d));
    return g;
  }, [deals]);

  const dealByKey = useMemo(() => {
    const m = new Map<string, DealCard>();
    deals.forEach(d => m.set(d.inn + '|' + d.name, d));
    return m;
  }, [deals]);

  async function moveDeal(deal: DealCard, target: Stage) {
    if (deal.stage === target) return;
    // Нельзя двигать «Лид → Оплачено» через одно — но мы разрешим, маркетологу виднее.
    // Маппинг: какую сущность правим
    try {
      if (target === 'proposal') {
        if (!deal.latestProposalId) {
          toast.warning('Нет КП для этой компании', { description: 'Сначала создайте КП через «Быстрые действия».' });
          return;
        }
        const { error } = await supabase
          .from('commercial_proposals')
          .update({ status: 'sent', last_sent_at: new Date().toISOString() })
          .eq('id', deal.latestProposalId);
        if (error) throw error;
      } else if (target === 'contract') {
        if (!deal.latestContractId) {
          toast.warning('Нет договора для этой компании', { description: 'Сначала создайте договор через «Быстрые действия».' });
          return;
        }
        const { error } = await supabase
          .from('sales_contracts')
          .update({ status: 'sent' })
          .eq('id', deal.latestContractId);
        if (error) throw error;
      } else if (target === 'signing') {
        if (!deal.latestContractId) {
          toast.warning('Нет договора', { description: 'Перевод «На подписи» возможен только при наличии договора.' });
          return;
        }
        const { error } = await supabase
          .from('sales_contracts')
          .update({ status: 'signed' })
          .eq('id', deal.latestContractId);
        if (error) throw error;
      } else if (target === 'paid') {
        if (!deal.latestContractId) {
          toast.warning('Нет договора', { description: 'Отметить оплату можно только при наличии договора.' });
          return;
        }
        const { error } = await supabase
          .from('sales_contracts')
          .update({ status: 'paid' })
          .eq('id', deal.latestContractId);
        if (error) throw error;
      } else if (target === 'lead') {
        // Откатываем КП в черновик
        if (deal.latestProposalId) {
          const { error } = await supabase
            .from('commercial_proposals')
            .update({ status: 'draft' })
            .eq('id', deal.latestProposalId);
          if (error) throw error;
        } else {
          toast.info('Карточка вернулась в «Лиды»');
        }
      }

      // Оптимистично: обновим состояние локально
      setDeals(prev => prev.map(d =>
        (d.inn + '|' + d.name) === (deal.inn + '|' + deal.name)
          ? { ...d, stage: target }
          : d
      ));
      toast.success(`Перемещено: ${COLUMNS.find(c => c.id === target)?.title}`);
    } catch (e) {
      console.error('moveDeal', e);
      toast.error('Не удалось переместить', { description: getErrorMessage(e) });
    }
  }

  function onDragStart(e: DragStartEvent) {
    setDragKey(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setDragKey(null);
    const overId = e.over?.id;
    if (!overId) return;
    const deal = dealByKey.get(String(e.active.id));
    if (!deal) return;
    const target = COLUMNS.find(c => c.id === overId)?.id;
    if (!target) return;
    void moveDeal(deal, target);
  }

  if (loading) {
    return <div className="flex justify-center py-12"><SigmaSpinner size="lg" /></div>;
  }

  const draggedDeal = dragKey ? dealByKey.get(dragKey) : null;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {COLUMNS.map(col => {
            const items = grouped.get(col.id) || [];
            const total = items.reduce((s, d) => s + d.amount, 0);
            return (
              <KanbanColumn
                key={col.id}
                id={col.id}
                title={col.title}
                icon={col.icon}
                cls={col.cls}
                count={items.length}
                total={total}
              >
                {items.length === 0 ? (
                  <div className="text-center text-xs text-muted-foreground py-6">Пусто</div>
                ) : (
                  items.map(d => (
                    <KanbanCard
                      key={d.inn + '|' + d.name}
                      deal={d}
                      onSelect={() => onSelectCompany?.(d.inn)}
                    />
                  ))
                )}
              </KanbanColumn>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Перетащите карточку, чтобы изменить этап. Клик по карточке — открыть в «Сделки 360°».
        </p>
      </div>

      <DragOverlay>
        {draggedDeal ? (
          <div className="p-2.5 rounded-xl bg-card border-2 border-primary shadow-lg max-w-xs">
            <div className="flex items-start gap-1.5">
              <Building2 className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{draggedDeal.name}</div>
                {draggedDeal.amount > 0 && (
                  <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                    {draggedDeal.amount.toLocaleString('ru-RU')} ₽
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  id, title, icon: Icon, cls, count, total, children,
}: {
  id: Stage; title: string; icon: any; cls: string; count: number; total: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <Card ref={setNodeRef} className={cn(
      "rounded-2xl border-2 transition-all",
      cls,
      isOver && "ring-2 ring-primary border-primary/60"
    )}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Icon className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold">{title}</span>
          </div>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 rounded-md">
            {count}
          </Badge>
        </div>
        {total > 0 && (
          <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            {(total / 1000).toFixed(0)} тыс ₽
          </div>
        )}
        <ScrollArea className="h-[calc(100vh-380px)] -mx-1">
          <div className="space-y-1.5 px-1">
            {children}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function KanbanCard({ deal, onSelect }: { deal: DealCard; onSelect: () => void }) {
  const id = deal.inn + '|' + deal.name;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group w-full text-left p-2.5 rounded-xl bg-card border hover:shadow-sm hover:border-primary/40 transition-all",
        isDragging && "opacity-30"
      )}
    >
      <div className="flex items-start gap-1.5">
        <button
          {...attributes}
          {...listeners}
          className="touch-none cursor-grab active:cursor-grabbing p-0.5 -ml-1 rounded hover:bg-muted/50"
          title="Перетащить"
          aria-label="Перетащить карточку"
        >
          <GripVertical className="w-3 h-3 text-muted-foreground" />
        </button>
        <button onClick={onSelect} className="flex-1 min-w-0 text-left">
          <div className="flex items-start gap-1.5">
            <Building2 className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{deal.name}</div>
              {deal.inn !== '—' && (
                <div className="text-[10px] text-muted-foreground truncate">ИНН: {deal.inn}</div>
              )}
              {deal.amount > 0 && (
                <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                  {deal.amount.toLocaleString('ru-RU')} ₽
                </div>
              )}
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
