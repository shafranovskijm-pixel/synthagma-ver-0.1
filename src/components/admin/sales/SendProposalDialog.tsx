import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Eye, ArrowLeft, CheckCircle2, Loader2, Search, Mail, ExternalLink, Trash2, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/handleSupabaseError';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface Service {
  id: string;
  custom_name: string | null;
  custom_description: string | null;
  price: number;
  quantity: number;
  sort_order: number;
}

interface Template {
  id: string;
  company_name: string;
  total_amount: number;
  intro_html: string | null;
  services: Service[];
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyName: string;
  contactPerson?: string | null;
  defaultEmail?: string;
  leadId?: string | null;
  managerName?: string;
  onSent?: (templateName: string) => void;
}

type CategoryKey = 'all' | 'platform' | 'services' | 'corporate' | 'sites' | 'box' | 'subscription';

const CATEGORIES: { key: CategoryKey; label: string; keywords: string[]; color: string }[] = [
  { key: 'all', label: 'Все', keywords: [], color: 'bg-primary/10 text-primary' },
  { key: 'platform', label: 'Платформа', keywords: ['платформ', 'сдо', 'каталог'], color: 'bg-teal-500/10 text-teal-600' },
  { key: 'subscription', label: 'Подписка', keywords: ['абонемент', 'подписк'], color: 'bg-sky-500/10 text-sky-600' },
  { key: 'services', label: 'ФРДО / услуги', keywords: ['фрдо', 'общие услуги', 'документац'], color: 'bg-amber-500/10 text-amber-600' },
  { key: 'corporate', label: 'Корпоратив', keywords: ['корпоратив', 'группы'], color: 'bg-purple-500/10 text-purple-600' },
  { key: 'sites', label: 'Сайты', keywords: ['сайт'], color: 'bg-emerald-500/10 text-emerald-600' },
  { key: 'box', label: 'Коробочная', keywords: ['коробочн', 'on-premise'], color: 'bg-rose-500/10 text-rose-600' },
];

function detectCategory(name: string): CategoryKey {
  const lower = name.toLowerCase();
  for (const c of CATEGORIES) {
    if (c.key === 'all') continue;
    if (c.keywords.some((k) => lower.includes(k))) return c.key;
  }
  return 'platform';
}

function stripHtml(html: string | null): string {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const formatMoney = (v: number) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(v);

export function SendProposalDialog({
  open, onOpenChange, companyName, contactPerson, defaultEmail, leadId, managerName, onSent,
}: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(defaultEmail || '');
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState<CategoryKey>('all');
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  const openPreview = (id: string) => {
    onOpenChange(false);
    navigate(`/sales?proposalPreview=${id}`);
  };

  useEffect(() => { setEmail(defaultEmail || ''); }, [defaultEmail, open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      document.getElementById('inline-send-proposal')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
    return () => clearTimeout(t);
  }, [open]);


  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      const { data: props } = await supabase
        .from('commercial_proposals')
        .select('id, company_name, total_amount, intro_html')
        .eq('is_template', true)
        .order('created_at', { ascending: false });
      const ids = (props || []).map((p: any) => p.id);
      const { data: svcs } = ids.length
        ? await supabase.from('commercial_proposal_services').select('*').in('proposal_id', ids)
        : { data: [] as any[] };
      const map: Record<string, Service[]> = {};
      (svcs || []).forEach((s: any) => {
        (map[s.proposal_id] ||= []).push(s);
      });
      const tpls: Template[] = (props || []).map((p: any) => ({
        id: p.id,
        company_name: p.company_name,
        total_amount: Number(p.total_amount || 0),
        intro_html: p.intro_html,
        services: (map[p.id] || []).sort((a, b) => a.sort_order - b.sort_order),
      }));
      setTemplates(tpls);
      setLoading(false);
    })();
  }, [open]);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (activeCat !== 'all' && detectCategory(t.company_name) !== activeCat) return false;
      if (search && !t.company_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [templates, activeCat, search]);

  const handleSend = async (tpl: Template) => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      toast.error('Укажите корректный email получателя');
      return;
    }
    setSendingId(tpl.id);
    try {
      const { data, error } = await supabase.functions.invoke('send-platform-proposal', {
        body: {
          template_proposal_id: tpl.id,
          recipient_email: email.trim(),
          company_name: companyName,
          contact_person: contactPerson ?? null,
          lead_id: leadId ?? null,
          sender_name: managerName || user?.email || 'Менеджер СИНТАГМА',
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const url = (data as any)?.proposal_url;
      toast.success(`«${tpl.company_name}» отправлено на ${email}`, { description: url });
      setSentIds((s) => new Set(s).add(tpl.id));
      onSent?.(tpl.company_name);
    } catch (e) {
      toast.error('Не удалось отправить КП', { description: getErrorMessage(e) });
    } finally {
      setSendingId(null);
    }
  };

  return (
    open ? (
    <>
      <div
        id="inline-send-proposal"
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

        <div className="p-5 pb-3 border-b space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold pr-10">
            <Send className="w-4 h-4 text-primary" />
            Отправить коммерческое предложение
          </h2>
          <p className="text-sm text-muted-foreground">
            Компания: <span className="font-medium text-foreground">{companyName}</span>
            {contactPerson ? <> · Контакт: <span className="font-medium text-foreground">{contactPerson}</span></> : null}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-2 pt-1">
            <div className="relative">
              <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email получателя"
                className="h-9 pl-8"
              />
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по названию КП"
                className="h-9 pl-8"
              />
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap pt-1">
            {CATEGORIES.map((c) => {
              const count = c.key === 'all'
                ? templates.length
                : templates.filter((t) => detectCategory(t.company_name) === c.key).length;
              return (
                <button
                  key={c.key}
                  onClick={() => setActiveCat(c.key)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium border transition',
                    activeCat === c.key
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted border-border text-muted-foreground',
                  )}
                >
                  {c.label} <span className="opacity-70">· {count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {(

        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Загружаем шаблоны…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">Нет шаблонов по фильтру</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((tpl) => {
                const cat = CATEGORIES.find((c) => c.key === detectCategory(tpl.company_name))!;
                const desc = stripHtml(tpl.intro_html).slice(0, 180);
                const isSending = sendingId === tpl.id;
                const isSent = sentIds.has(tpl.id);
                return (
                  <div
                    key={tpl.id}
                    className={cn(
                      'group relative border rounded-2xl p-4 flex flex-col gap-3 bg-card hover:shadow-md transition',
                      isSent && 'border-emerald-500/50 bg-emerald-500/5',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Badge variant="outline" className={cn('text-[10px] font-medium', cat.color, 'border-transparent')}>
                        {cat.label}
                      </Badge>
                      {isSent && (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Отправлено
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-sm leading-snug">{tpl.company_name}</div>
                      {desc && (
                        <div className="text-xs text-muted-foreground mt-1.5 line-clamp-3">{desc}</div>
                      )}
                    </div>
                    {tpl.services.length > 0 && (
                      <div className="space-y-1 text-xs">
                        {tpl.services.slice(0, 4).map((s) => (
                          <div key={s.id} className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-1.5 min-w-0">
                              <span className="text-primary mt-0.5">•</span>
                              <span className="truncate">{s.custom_name || 'Услуга'}</span>
                            </div>
                            <span className="text-muted-foreground shrink-0 tabular-nums">
                              {formatMoney(Number(s.price))}
                            </span>
                          </div>
                        ))}
                        {tpl.services.length > 4 && (
                          <div className="text-[11px] text-muted-foreground pl-3">
                            и ещё {tpl.services.length - 4}…
                          </div>
                        )}
                      </div>
                    )}
                    <div className="mt-auto flex items-end justify-between gap-2 pt-2 border-t">
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Итого</div>
                        <div className="text-lg font-bold text-primary tabular-nums">
                          {formatMoney(tpl.services.reduce((s, x) => s + Number(x.price) * Number(x.quantity || 1), 0) || tpl.total_amount)}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2"
                          onClick={() => openPreview(tpl.id)}
                          title="Открыть предпросмотр"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          className="h-8"
                          onClick={() => handleSend(tpl)}
                          disabled={isSending}
                        >
                          {isSending ? (
                            <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Отправляем…</>
                          ) : (
                            <><Send className="w-3.5 h-3.5 mr-1" />Отправить</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}
      </div>
    </>
    ) : null
  );
}
