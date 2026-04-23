import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { FileText, ScrollText, PenTool, Building2, Users, Receipt, GraduationCap, Sparkles, Inbox, BookOpen, Radio } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface SearchResult {
  id: string;
  type: 'proposal' | 'contract' | 'signature' | 'company' | 'student' | 'invoice' | 'document' | 'incoming' | 'billing' | 'course' | 'webinar';
  title: string;
  subtitle?: string;
  navigateTo?: string;
  action?: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TYPE_META: Record<SearchResult['type'], { label: string; icon: any }> = {
  course: { label: 'Курсы', icon: BookOpen },
  webinar: { label: 'Вебинары', icon: Radio },
  proposal: { label: 'Коммерческие предложения', icon: FileText },
  contract: { label: 'Договоры', icon: ScrollText },
  signature: { label: 'Подписи', icon: PenTool },
  company: { label: 'Компании', icon: Building2 },
  student: { label: 'Ученики', icon: GraduationCap },
  invoice: { label: 'Счета', icon: Receipt },
  document: { label: 'Документы', icon: FileText },
  incoming: { label: 'Входящие документы', icon: Inbox },
  billing: { label: 'Счета и акты организации', icon: Receipt },
};

interface GlobalCommandPaletteProps {
  /** 'admin' | 'organization' — определяет, по каким сущностям искать */
  scope?: 'admin' | 'organization';
  organizationId?: string | null;
}

export function GlobalCommandPalette({ scope = 'organization', organizationId }: GlobalCommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Cmd+K / Ctrl+K shortcut + custom event "open-command-palette"
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    const openHandler = () => setOpen(true);
    window.addEventListener('keydown', handler);
    window.addEventListener('open-command-palette', openHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('open-command-palette', openHandler);
    };
  }, []);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void runSearch(q);
    }, 200);
    return () => clearTimeout(timer);
  }, [query, open, scope, organizationId]);

  const runSearch = useCallback(async (q: string) => {
    if (!user) return;
    setLoading(true);
    const found: SearchResult[] = [];
    const escaped = q.replace(/[%_]/g, m => '\\' + m);
    const like = `%${escaped}%`;

    try {
      if (scope === 'admin') {
        // Admin: всё по платформе
        const [proposals, contracts, sigs, companies] = await Promise.all([
          supabase.from('commercial_proposals').select('id, company_name, company_inn, status').or(`company_name.ilike.${like},company_inn.ilike.${like}`).limit(8),
          supabase.from('sales_contracts').select('id, company_name, company_inn, contract_number').or(`company_name.ilike.${like},company_inn.ilike.${like},contract_number.ilike.${like}`).limit(8),
          supabase.from('document_signatures').select('id, document_title, recipient_name, status').or(`document_title.ilike.${like},recipient_name.ilike.${like}`).limit(8),
          supabase.from('organizations').select('id, name, inn, email').or(`name.ilike.${like},inn.ilike.${like},email.ilike.${like}`).limit(8),
        ]);

        (proposals.data || []).forEach((r: any) => found.push({
          id: r.id, type: 'proposal',
          title: r.company_name,
          subtitle: `ИНН ${r.company_inn || '—'} • ${r.status}`,
        }));
        (contracts.data || []).forEach((r: any) => found.push({
          id: r.id, type: 'contract',
          title: `Договор ${r.contract_number || 'б/н'}`,
          subtitle: r.company_name,
        }));
        (sigs.data || []).forEach((r: any) => found.push({
          id: r.id, type: 'signature',
          title: r.document_title,
          subtitle: `${r.recipient_name} • ${r.status}`,
        }));
        (companies.data || []).forEach((r: any) => found.push({
          id: r.id, type: 'company',
          title: r.name,
          subtitle: `ИНН ${r.inn || '—'} • ${r.email}`,
        }));
      } else if (organizationId) {
        // Organization: только своё
        const [students, sigs, docs, companies, incoming, billing, courses, webinars] = await Promise.all([
          supabase.from('profiles').select('user_id, full_name, email, login').eq('organization_id', organizationId).or(`full_name.ilike.${like},email.ilike.${like},login.ilike.${like}`).limit(8),
          supabase.from('document_signatures').select('id, document_title, recipient_name, status').eq('organization_id', organizationId).or(`document_title.ilike.${like},recipient_name.ilike.${like}`).limit(8),
          supabase.from('education_document_records').select('id, full_name, reg_number, document_type').eq('organization_id', organizationId).or(`full_name.ilike.${like},reg_number.ilike.${like}`).limit(8),
          supabase.from('companies').select('id, name, inn, email').eq('organization_id', organizationId).or(`name.ilike.${like},inn.ilike.${like}`).limit(8),
          supabase.from('incoming_documents').select('id, title, counterparty_name, counterparty_inn, doc_number, doc_type').eq('organization_id', organizationId).or(`title.ilike.${like},counterparty_name.ilike.${like},counterparty_inn.ilike.${like},doc_number.ilike.${like}`).limit(6),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          supabase.from('org_billing_documents' as any).select('id, doc_kind, doc_number, buyer_name, buyer_inn, total_amount').eq('organization_id', organizationId).or(`doc_number.ilike.${like},buyer_name.ilike.${like},buyer_inn.ilike.${like}`).limit(6),
          supabase.from('courses').select('id, title, description, is_published').eq('organization_id', organizationId).or(`title.ilike.${like},description.ilike.${like}`).limit(6),
          supabase.from('webinars').select('id, title, status, scheduled_at').eq('organization_id', organizationId).ilike('title', like).limit(6),
        ]);

        (students.data || []).forEach((r: any) => found.push({
          id: r.user_id, type: 'student',
          title: r.full_name || r.email || r.login,
          subtitle: r.email,
          navigateTo: `/organization/student/${r.user_id}`,
        }));
        (sigs.data || []).forEach((r: any) => found.push({
          id: r.id, type: 'signature',
          title: r.document_title,
          subtitle: `${r.recipient_name} • ${r.status}`,
        }));
        (docs.data || []).forEach((r: any) => found.push({
          id: r.id, type: 'document',
          title: r.full_name,
          subtitle: `№ ${r.reg_number} • ${r.document_type}`,
        }));
        (companies.data || []).forEach((r: any) => found.push({
          id: r.id, type: 'company',
          title: r.name,
          subtitle: `ИНН ${r.inn || '—'}`,
        }));
        (incoming.data || []).forEach((r: any) => found.push({
          id: r.id, type: 'incoming',
          title: r.title || `${r.doc_type} ${r.doc_number || ''}`.trim(),
          subtitle: `${r.counterparty_name || '—'}${r.counterparty_inn ? ` • ИНН ${r.counterparty_inn}` : ''}${r.doc_number ? ` • № ${r.doc_number}` : ''}`,
        }));
        ((billing.data as any[]) || []).forEach((r: any) => {
          const kindLabel = r.doc_kind === 'invoice' ? 'Счёт' : r.doc_kind === 'act' ? 'Акт' : r.doc_kind === 'contract' ? 'Договор' : r.doc_kind || 'Документ';
          found.push({
            id: r.id, type: 'billing',
            title: `${kindLabel} № ${r.doc_number || 'б/н'}`,
            subtitle: `${r.buyer_name || '—'}${r.buyer_inn ? ` • ИНН ${r.buyer_inn}` : ''}${r.total_amount ? ` • ${Number(r.total_amount).toLocaleString('ru-RU')} ₽` : ''}`,
          });
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (courses.data || []).forEach((r: any) => found.push({
          id: r.id, type: 'course',
          title: r.title,
          subtitle: r.is_published ? 'Опубликован' : 'Черновик',
          navigateTo: `/organization?tab=course-details&courseId=${r.id}`,
        }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (webinars.data || []).forEach((r: any) => found.push({
          id: r.id, type: 'webinar',
          title: r.title,
          subtitle: `${r.status}${r.scheduled_at ? ` • ${new Date(r.scheduled_at).toLocaleDateString('ru-RU')}` : ''}`,
        }));
      }

      setResults(found);
    } catch (e) {
      console.error('Cmd+K search error', e);
    } finally {
      setLoading(false);
    }
  }, [user, scope, organizationId]);

  const grouped = useMemo(() => {
    const g: Record<string, SearchResult[]> = {};
    results.forEach(r => {
      if (!g[r.type]) g[r.type] = [];
      g[r.type].push(r);
    });
    return g;
  }, [results]);

  const handleSelect = (r: SearchResult) => {
    setOpen(false);
    if (r.action) r.action();
    if (r.navigateTo) navigate(r.navigateTo);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Поиск по документам, КП, ученикам, компаниям..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {query.length < 2 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Sparkles className="w-6 h-6 mx-auto mb-2 opacity-50" />
            Введите минимум 2 символа для поиска
            <div className="mt-3 text-xs">
              <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted">Esc</kbd> — закрыть
            </div>
          </div>
        )}
        {query.length >= 2 && !loading && results.length === 0 && (
          <CommandEmpty>Ничего не найдено</CommandEmpty>
        )}
        {loading && (
          <div className="py-6 text-center text-sm text-muted-foreground">Поиск...</div>
        )}
        {Object.entries(grouped).map(([type, items], idx) => {
          const meta = TYPE_META[type as SearchResult['type']];
          const Icon = meta.icon;
          return (
            <div key={type}>
              {idx > 0 && <CommandSeparator />}
              <CommandGroup heading={meta.label}>
                {items.map(r => (
                  <CommandItem
                    key={`${r.type}-${r.id}`}
                    value={`${r.type}-${r.id}-${r.title}`}
                    onSelect={() => handleSelect(r)}
                    className="gap-2.5"
                  >
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.title}</div>
                      {r.subtitle && (
                        <div className="text-xs text-muted-foreground truncate">{r.subtitle}</div>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </div>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
