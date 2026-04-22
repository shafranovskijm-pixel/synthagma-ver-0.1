import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Search, Building2, FileText, ScrollText, PenTool, Receipt, CheckCircle2, Clock, XCircle, ArrowRight, Sparkles, Activity, LayoutGrid, Columns3, List } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { SigmaSpinner } from '@/components/ui/SigmaSpinner';
import { CompanyTimeline } from './CompanyTimeline';
import { DealQuickActions } from './DealQuickActions';
import { DealCommunication } from './DealCommunication';
import { SalesKanban } from './SalesKanban';

interface CompanyContact {
  phone?: string | null;
  email?: string | null;
  website?: string | null;
}

interface DealCompany {
  inn: string;
  name: string;
  proposals: Array<{ id: string; status: string; total_amount: number; created_at: string; tariff_plan: string | null; last_sent_at: string | null }>;
  contracts: Array<{ id: string; status: string; contract_number: string | null; total_amount: number; created_at: string }>;
  signatures: Array<{ id: string; status: string; document_title: string; document_type: string; created_at: string; signed_at: string | null; sent_at: string | null; viewed_at: string | null }>;
  invoices: Array<{ id: string; status: string; document_number: string | null; amount: number; created_at: string; type: string }>;
  totalRevenue: number;
  lastActivity: string;
}

const STAGE_ICON: Record<string, any> = {
  proposal: FileText,
  contract: ScrollText,
  signature: PenTool,
  invoice: Receipt,
};

const DEFAULT_STATUS_CLASS = 'bg-muted text-muted-foreground';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  negotiation: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  in_review: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  accepted: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  signed: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  paid: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  rejected: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  expired: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  archived: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  not_interested: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Черновик',
  sent: 'Отправлено',
  negotiation: 'Переговоры',
  in_review: 'На рассмотрении',
  accepted: 'Принято',
  signed: 'Подписано',
  active: 'Активно',
  paid: 'Оплачено',
  rejected: 'Отклонено',
  expired: 'Истёк',
  pending: 'Ожидает',
  archived: 'В архиве',
  not_interested: 'Не интересно',
};

interface Deals360Props {
  organizationId?: string;
  /** колбэк-фабрики быстрых действий, чтобы кнопки в правой панели работали */
  onCreateProposal?: (company: { name: string; inn: string }) => void;
  onCreateContract?: (company: { name: string; inn: string }) => void;
  onCreateInvoice?: (company: { name: string; inn: string }) => void;
}

export function Deals360({ organizationId, onCreateProposal, onCreateContract, onCreateInvoice }: Deals360Props = {}) {
  const [companies, setCompanies] = useState<DealCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedInn, setSelectedInn] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [contactsByInn, setContactsByInn] = useState<Record<string, CompanyContact>>({});

  useEffect(() => {
    void loadDeals();
    void loadContacts();
  }, [organizationId]);

  async function loadContacts() {
    let q = supabase
      .from('sales_companies_db')
      .select('inn, phone, email, website')
      .limit(2000);
    if (organizationId) q = q.eq('organization_id', organizationId);
    const { data } = await q;
    const map: Record<string, CompanyContact> = {};
    (data || []).forEach((r: any) => {
      if (r.inn) map[r.inn] = { phone: r.phone, email: r.email, website: r.website };
    });
    setContactsByInn(map);
  }

  async function loadDeals() {
    setLoading(true);
    try {
      const applyOrg = <T extends { eq: any }>(q: T): T =>
        organizationId ? q.eq('organization_id', organizationId) : q;

      const [proposalsRes, contractsRes, signaturesRes, billingRes] = await Promise.all([
        applyOrg(
          supabase.from('commercial_proposals')
            .select('id, company_inn, company_name, status, total_amount, created_at, tariff_plan, last_sent_at')
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(500)
        ),
        applyOrg(
          supabase.from('sales_contracts')
            .select('id, company_inn, company_name, status, contract_number, total_amount, created_at')
            .order('created_at', { ascending: false })
            .limit(500)
        ),
        applyOrg(
          supabase.from('document_signatures')
            .select('id, recipient_name, status, document_title, document_type, created_at, signed_at, sent_at, viewed_at')
            .order('created_at', { ascending: false })
            .limit(500)
        ),
        organizationId
          ? supabase.from('subscription_invoices').select('id, status, invoice_number, amount, created_at, organization_id').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(200)
          : supabase.from('subscription_invoices').select('id, status, invoice_number, amount, created_at, organization_id').order('created_at', { ascending: false }).limit(500),
      ]);

      const map = new Map<string, DealCompany>();

      const ensure = (inn: string | null, name: string): DealCompany => {
        const key = inn || name;
        if (!map.has(key)) {
          map.set(key, {
            inn: inn || '—',
            name,
            proposals: [],
            contracts: [],
            signatures: [],
            invoices: [],
            totalRevenue: 0,
            lastActivity: '',
          });
        }
        return map.get(key)!;
      };

      (proposalsRes.data || []).forEach((p: any) => {
        const c = ensure(p.company_inn, p.company_name);
        c.proposals.push(p);
        if (p.status === 'accepted') c.totalRevenue += Number(p.total_amount || 0);
      });
      (contractsRes.data || []).forEach((c: any) => {
        const d = ensure(c.company_inn, c.company_name);
        d.contracts.push(c);
        if (c.status === 'signed' || c.status === 'active') d.totalRevenue += Number(c.total_amount || 0);
      });

      // Индексы для O(1) поиска подписей по имени получателя.
      const byNameLower = new Map<string, DealCompany>();
      map.forEach(c => {
        if (c.name) byNameLower.set(c.name.toLowerCase(), c);
      });
      (signaturesRes.data || []).forEach((s: any) => {
        const recipient = (s.recipient_name || '').toLowerCase().trim();
        if (!recipient) return;
        // Точное совпадение
        let target = byNameLower.get(recipient);
        // Префиксный fallback (одна итерация по индексу — лучше, чем O(N×M))
        if (!target) {
          const recPrefix = recipient.slice(0, 15);
          for (const [name, company] of byNameLower) {
            if (name.startsWith(recPrefix) || recipient.startsWith(name.slice(0, 15))) {
              target = company;
              break;
            }
          }
        }
        if (target) target.signatures.push(s);
      });

      // Привязываем счета по organization_id (когда грузим конкретную организацию,
      // все её счета относятся к её платформенным сделкам).
      const invoiceList = (billingRes.data || []) as any[];
      if (organizationId && invoiceList.length > 0) {
        const orgInvoices = invoiceList.map((inv: any) => ({
          id: inv.id,
          status: inv.status || 'pending',
          document_number: inv.invoice_number || null,
          amount: Number(inv.amount || 0),
          created_at: inv.created_at,
          type: 'subscription',
        }));
        // Привязываем все счета организации к самой большой сделке (по revenue)
        // или к первой попавшейся компании.
        const targetCompany = Array.from(map.values())
          .sort((a, b) => b.totalRevenue - a.totalRevenue)[0];
        if (targetCompany) {
          targetCompany.invoices.push(...orgInvoices);
        }
      }

      // Подсчёт last activity
      const all: DealCompany[] = [];
      map.forEach(c => {
        const dates = [
          ...c.proposals.map(p => p.created_at),
          ...c.contracts.map(p => p.created_at),
          ...c.signatures.map(p => p.created_at),
          ...c.invoices.map(p => p.created_at),
        ].filter(Boolean).sort().reverse();
        c.lastActivity = dates[0] || '';
        all.push(c);
      });
      all.sort((a, b) => (b.lastActivity || '').localeCompare(a.lastActivity || ''));
      setCompanies(all);
    } catch (e) {
      console.error('Deals360 load error', e);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return companies;
    const q = search.toLowerCase();
    return companies.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.inn.toLowerCase().includes(q)
    );
  }, [companies, search]);

  const selected = useMemo(() => filtered.find(c => c.inn === selectedInn) || filtered[0] || null, [filtered, selectedInn]);

  if (loading) {
    return <div className="flex justify-center py-12"><SigmaSpinner size="lg" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Сделки 360°
          </h2>
          <p className="text-sm text-muted-foreground">Полная картина по каждой компании: КП → Договоры → Подписи → Счета</p>
        </div>
        <div className="inline-flex rounded-xl border bg-muted/30 p-1">
          <Button size="sm" variant={view === 'list' ? 'default' : 'ghost'}
            onClick={() => setView('list')}
            className="h-8 rounded-lg gap-1.5">
            <List className="w-3.5 h-3.5" /> Список
          </Button>
          <Button size="sm" variant={view === 'kanban' ? 'default' : 'ghost'}
            onClick={() => setView('kanban')}
            className="h-8 rounded-lg gap-1.5">
            <Columns3 className="w-3.5 h-3.5" /> Канбан
          </Button>
        </div>
      </div>

      {view === 'kanban' ? (
        <SalesKanban
          organizationId={organizationId}
          onSelectCompany={(inn) => {
            // сначала переключаем в list, потом ставим выделение, чтобы grid отрисовался
            setView('list');
            setTimeout(() => setSelectedInn(inn), 0);
          }}
        />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_320px] gap-4">
        {/* Список компаний */}
        <Card className="rounded-2xl">
          <CardContent className="p-3 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Поиск по компании или ИНН..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 rounded-xl"
              />
            </div>
            <ScrollArea className="h-[calc(100vh-280px)]">
              <div className="space-y-1.5 pr-2">
                {filtered.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">Ничего не найдено</div>
                )}
                {filtered.map(c => {
                  const isActive = (selected?.inn === c.inn);
                  const stages = [c.proposals.length, c.contracts.length, c.signatures.length, c.invoices.length].filter(x => x > 0).length;
                  return (
                    <button
                      key={c.inn + c.name}
                      onClick={() => setSelectedInn(c.inn)}
                      className={cn(
                        'w-full text-left p-3 rounded-xl border transition-all hover:scale-[1.01]',
                        isActive ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{c.name}</div>
                          <div className="text-xs text-muted-foreground">ИНН: {c.inn}</div>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                              {stages}/4 этапа
                            </Badge>
                            {c.totalRevenue > 0 && (
                              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                {c.totalRevenue.toLocaleString('ru-RU')} ₽
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Деталь компании */}
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            {!selected ? (
              <div className="text-center text-muted-foreground py-12">Выберите компанию слева</div>
            ) : (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-semibold">{selected.name}</h3>
                  <div className="text-sm text-muted-foreground">ИНН: {selected.inn}</div>
                </div>

                {/* Воронка этапов */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { key: 'proposals', label: 'КП', icon: FileText, count: selected.proposals.length },
                    { key: 'contracts', label: 'Договоры', icon: ScrollText, count: selected.contracts.length },
                    { key: 'signatures', label: 'Подписи', icon: PenTool, count: selected.signatures.length },
                    { key: 'invoices', label: 'Счета', icon: Receipt, count: selected.invoices.length },
                  ].map((s, i, arr) => {
                    const Icon = s.icon;
                    const active = s.count > 0;
                    return (
                      <div key={s.key} className="relative">
                        <div className={cn(
                          'p-3 rounded-xl border text-center transition-all',
                          active ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/30 opacity-60'
                        )}>
                          <Icon className={cn('w-5 h-5 mx-auto mb-1', active ? 'text-primary' : 'text-muted-foreground')} />
                          <div className="text-xs font-medium">{s.label}</div>
                          <div className="text-lg font-semibold mt-0.5">{s.count}</div>
                        </div>
                        {i < arr.length - 1 && (
                          <ArrowRight className="absolute -right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground hidden md:block" />
                        )}
                      </div>
                    );
                  })}
                </div>

                <Tabs defaultValue="overview" className="w-full">
                  <TabsList className="grid grid-cols-2 w-full max-w-xs rounded-xl">
                    <TabsTrigger value="overview" className="rounded-lg gap-1.5">
                      <LayoutGrid className="w-3.5 h-3.5" />
                      Карточка
                    </TabsTrigger>
                    <TabsTrigger value="timeline" className="rounded-lg gap-1.5">
                      <Activity className="w-3.5 h-3.5" />
                      Тайм-лайн
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="mt-4">
                    <ScrollArea className="h-[calc(100vh-440px)]">
                      <div className="space-y-4 pr-2">
                        {/* КП */}
                        {selected.proposals.length > 0 && (
                          <Section title="Коммерческие предложения" icon={FileText}>
                            {selected.proposals.map(p => (
                              <Row
                                key={p.id}
                                title={p.tariff_plan ? `КП — ${p.tariff_plan}` : 'Коммерческое предложение'}
                                status={p.status}
                                amount={p.total_amount}
                                date={p.created_at}
                              />
                            ))}
                          </Section>
                        )}

                        {/* Договоры */}
                        {selected.contracts.length > 0 && (
                          <Section title="Договоры" icon={ScrollText}>
                            {selected.contracts.map(c => (
                              <Row
                                key={c.id}
                                title={`Договор ${c.contract_number || 'б/н'}`}
                                status={c.status}
                                amount={c.total_amount}
                                date={c.created_at}
                              />
                            ))}
                          </Section>
                        )}

                        {/* Подписи */}
                        {selected.signatures.length > 0 && (
                          <Section title="На подписании" icon={PenTool}>
                            {selected.signatures.slice(0, 10).map(s => (
                              <Row
                                key={s.id}
                                title={s.document_title}
                                status={s.status}
                                date={s.signed_at || s.created_at}
                              />
                            ))}
                          </Section>
                        )}

                        {selected.proposals.length === 0 &&
                         selected.contracts.length === 0 &&
                         selected.signatures.length === 0 && (
                          <div className="text-center text-muted-foreground py-8">
                            Нет активных документов
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="timeline" className="mt-4">
                    <CompanyTimeline
                      proposals={selected.proposals}
                      contracts={selected.contracts}
                      signatures={selected.signatures}
                      invoices={selected.invoices}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Правая панель: контакты + быстрые действия + история */}
        {selected ? (
          <div className="space-y-4 lg:col-span-2 xl:col-span-1">
            <DealQuickActions
              companyName={selected.name}
              inn={selected.inn}
              contact={contactsByInn[selected.inn]}
              onCreateProposal={onCreateProposal ? () => onCreateProposal({ name: selected.name, inn: selected.inn }) : undefined}
              onCreateContract={onCreateContract ? () => onCreateContract({ name: selected.name, inn: selected.inn }) : undefined}
              onCreateInvoice={onCreateInvoice ? () => onCreateInvoice({ name: selected.name, inn: selected.inn }) : undefined}
            />
            <DealCommunication
              inn={selected.inn}
              companyName={selected.name}
            />
          </div>
        ) : <div />}
      </div>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground">
        <Icon className="w-4 h-4" />
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ title, status, amount, date }: { title: string; status: string; amount?: number; date: string }) {
  const isOk = ['accepted', 'signed', 'active', 'paid'].includes(status);
  const isBad = ['rejected', 'expired'].includes(status);
  const StatusIcon = isOk ? CheckCircle2 : isBad ? XCircle : Clock;
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-muted/30 transition-colors">
      <StatusIcon className={cn(
        'w-4 h-4 shrink-0',
        isOk ? 'text-emerald-600 dark:text-emerald-400' :
        isBad ? 'text-rose-600 dark:text-rose-400' :
        'text-amber-600 dark:text-amber-400'
      )} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="text-xs text-muted-foreground">
          {date && format(new Date(date), 'dd MMM yyyy', { locale: ru })}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {amount !== undefined && amount > 0 && (
          <span className="text-sm font-medium">{amount.toLocaleString('ru-RU')} ₽</span>
        )}
        <Badge variant="secondary" className={cn('text-xs', STATUS_COLORS[status] || '')}>
          {STATUS_LABELS[status] || status}
        </Badge>
      </div>
    </div>
  );
}
