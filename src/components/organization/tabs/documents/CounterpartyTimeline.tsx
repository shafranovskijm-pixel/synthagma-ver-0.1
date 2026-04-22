/**
 * Тайм-лайн всех событий по контрагенту: КП, договоры, подписания, счета, оплаты, акты.
 * Показывается в карточке Контрагенты для типа company/payer.
 */
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { ScrollText, Receipt, FileCheck, Send, CheckCircle2, XCircle, Eye, FileText, Banknote, Clock, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface TimelineEvent {
  id: string;
  date: string;
  kind: "proposal" | "contract" | "signature" | "invoice" | "act" | "payment";
  title: string;
  subtitle?: string;
  status?: string;
  amount?: number | null;
}

interface Props {
  organizationId: string;
  counterpartyId: string;
  counterpartyName: string;
  counterpartyType: "company" | "payer";
}

const KIND_META: Record<TimelineEvent["kind"], { icon: any; cls: string; label: string }> = {
  proposal: { icon: ScrollText, cls: "text-violet-600 bg-violet-500/10 border-violet-500/20", label: "КП" },
  contract: { icon: FileText, cls: "text-blue-600 bg-blue-500/10 border-blue-500/20", label: "Договор" },
  signature: { icon: Send, cls: "text-indigo-600 bg-indigo-500/10 border-indigo-500/20", label: "Подписание" },
  invoice: { icon: Receipt, cls: "text-amber-600 bg-amber-500/10 border-amber-500/20", label: "Счёт" },
  act: { icon: FileCheck, cls: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20", label: "Акт" },
  payment: { icon: Banknote, cls: "text-emerald-700 bg-emerald-500/10 border-emerald-500/20", label: "Оплата" },
};

const STATUS_LABEL: Record<string, string> = {
  draft: "черновик",
  sent: "отправлен",
  viewed: "просмотрен",
  signed: "подписан",
  rejected: "отклонён",
  revoked: "отозван",
  expired: "просрочен",
  in_review: "на согласовании",
  changes_requested: "запрошены правки",
  paid: "оплачен",
  pending: "не оплачен",
  unpaid: "не оплачен",
};

export function CounterpartyTimeline({ organizationId, counterpartyId, counterpartyName, counterpartyType }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | TimelineEvent["kind"]>("all");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const all: TimelineEvent[] = [];

      if (counterpartyType === "company") {
        // Load company-related docs
        const [docsRes, sigRes, propRes] = await Promise.all([
          supabase
            .from("company_documents")
            .select("id, name, type, contract_number, contract_date, uploaded_at, amount, is_paid, paid_at")
            .eq("company_id", counterpartyId)
            .is("deleted_at", null)
            .order("uploaded_at", { ascending: false }),
          supabase
            .from("document_signatures")
            .select("id, document_title, document_type, status, created_at, sent_at, signed_at, recipient_name")
            .eq("organization_id", organizationId)
            .ilike("recipient_name", `%${counterpartyName}%`)
            .order("created_at", { ascending: false })
            .limit(100),
          supabase
            .from("commercial_proposals")
            .select("id, company_name, total_amount, status, created_at, last_sent_at, first_viewed_at")
            .eq("organization_id", organizationId)
            .ilike("company_name", `%${counterpartyName}%`)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(50),
        ]);

        (docsRes.data || []).forEach((d: any) => {
          const dateStr = d.contract_date || d.uploaded_at;
          if (d.type === "contract") {
            all.push({ id: `doc-${d.id}`, date: dateStr, kind: "contract", title: d.name, subtitle: d.contract_number ? `№${d.contract_number}` : undefined });
          } else if (d.type === "invoice") {
            all.push({ id: `doc-${d.id}`, date: dateStr, kind: "invoice", title: d.name, subtitle: d.contract_number ? `№${d.contract_number}` : undefined, amount: d.amount, status: d.is_paid ? "paid" : "unpaid" });
            if (d.is_paid && d.paid_at) {
              all.push({ id: `pay-${d.id}`, date: d.paid_at, kind: "payment", title: `Оплата по счёту ${d.contract_number ? "№" + d.contract_number : ""}`, amount: d.amount });
            }
          } else if (d.type === "act") {
            all.push({ id: `doc-${d.id}`, date: dateStr, kind: "act", title: d.name, subtitle: d.contract_number ? `№${d.contract_number}` : undefined });
          }
        });

        (sigRes.data || []).forEach((s: any) => {
          all.push({
            id: `sig-${s.id}`,
            date: s.signed_at || s.sent_at || s.created_at,
            kind: "signature",
            title: s.document_title,
            subtitle: `${s.recipient_name}`,
            status: s.status,
          });
        });

        (propRes.data || []).forEach((p: any) => {
          all.push({
            id: `prop-${p.id}`,
            date: p.last_sent_at || p.created_at,
            kind: "proposal",
            title: `КП ${p.company_name}`,
            subtitle: p.first_viewed_at ? "просмотрено клиентом" : undefined,
            status: p.status,
            amount: p.total_amount,
          });
        });
      }

      // Sort newest first
      all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (!cancelled) {
        setEvents(all);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [organizationId, counterpartyId, counterpartyName, counterpartyType]);

  const filtered = useMemo(() => filter === "all" ? events : events.filter(e => e.kind === filter), [events, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: events.length, proposal: 0, contract: 0, signature: 0, invoice: 0, act: 0, payment: 0 };
    events.forEach(e => { c[e.kind] = (c[e.kind] || 0) + 1; });
    return c;
  }, [events]);

  if (loading) {
    return <div className="flex justify-center py-12"><SigmaSpinner /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <History className="w-4 h-4 text-primary" />
        <span className="font-medium">Хронология взаимодействий</span>
        <span className="text-xs text-muted-foreground">— {events.length} {events.length === 1 ? "событие" : events.length < 5 && events.length !== 0 ? "события" : "событий"}</span>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {([
          ["all", "Все"],
          ["proposal", "КП"],
          ["contract", "Договоры"],
          ["signature", "Подписания"],
          ["invoice", "Счета"],
          ["payment", "Оплаты"],
          ["act", "Акты"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k as any)}
            className={cn(
              "inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border transition-colors",
              filter === k
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted/40 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
            )}
          >
            {label}
            <span className="text-[10px] opacity-70">({counts[k] || 0})</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{events.length === 0 ? "Событий по этому контрагенту пока нет" : "По выбранному фильтру пусто"}</p>
        </div>
      ) : (
        <div className="relative space-y-3 pl-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-border">
          {filtered.map((ev) => {
            const meta = KIND_META[ev.kind];
            const Icon = meta.icon;
            return (
              <div key={ev.id} className="relative">
                <div className={cn("absolute -left-6 top-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center bg-background", meta.cls.split(" ").find(c => c.startsWith("border-")))}>
                  <Icon className={cn("w-2.5 h-2.5", meta.cls.split(" ")[0])} />
                </div>
                <div className="rounded-lg border border-border bg-card p-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-md font-medium", meta.cls)}>{meta.label}</span>
                        {ev.status && (
                          <span className="text-[10px] text-muted-foreground">{STATUS_LABEL[ev.status] || ev.status}</span>
                        )}
                      </div>
                      <div className="text-sm font-medium mt-1 truncate">{ev.title}</div>
                      {ev.subtitle && <div className="text-xs text-muted-foreground mt-0.5">{ev.subtitle}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground">{format(new Date(ev.date), "d MMM yyyy", { locale: ru })}</div>
                      <div className="text-[10px] text-muted-foreground/60">{format(new Date(ev.date), "HH:mm", { locale: ru })}</div>
                      {typeof ev.amount === "number" && ev.amount > 0 && (
                        <div className="text-xs font-semibold mt-1">{ev.amount.toLocaleString("ru-RU")} ₽</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
