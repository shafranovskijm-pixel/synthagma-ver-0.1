import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Phone, PhoneOutgoing, StickyNote, CheckCircle2, XCircle, Clock, TrendingUp } from "lucide-react";
import { toast } from "sonner";

interface ManualActivity { id: string; activity_type: string; description: string | null; created_at: string; lead_id: string | null; source: "manual"; }
interface CallLogActivity { id: string; activity_type: "call"; description: string | null; created_at: string; lead_id: string | null; source: "call_log"; answered: boolean; direction: string | null; duration_sec: number | null; to_number: string | null; company_name: string | null; }
type Activity = ManualActivity | CallLogActivity;
interface LeadLite { id: string; org_name: string | null }

function classifyCall(a: Activity): "success" | "fail" | "other" {
  if (a.source === "call_log") {
    if (a.answered || (a.duration_sec ?? 0) >= 5) return "success";
    return "fail";
  }
  const desc = a.description;
  if (!desc) return "other";
  const h = desc.split("\n")[0].toLowerCase();
  if (h.includes("дозвон") || h.includes("следующий") || h.includes("✅") || h.includes("📅")) return "success";
  if (h.includes("не интерес") || h.includes("занят") || h.includes("❌") || h.includes("📵")) return "fail";
  return "other";
}
const fmt = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export function ManagerStatsInline({ managerId }: { managerId: string }) {
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [leadMap, setLeadMap] = useState<Record<string, LeadLite>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // 1) Resolve manager's auth user_id for call_logs
        const { data: mgr } = await supabase.from("sales_managers").select("user_id").eq("id", managerId).maybeSingle();
        const userId = (mgr as any)?.user_id as string | undefined;

        // 2) Manual activities (заметки + звонки, залогированные вручную)
        const manualQ = supabase.from("sales_lead_activities")
          .select("id, activity_type, description, created_at, lead_id")
          .eq("manager_id", managerId).order("created_at", { ascending: false }).limit(1000);

        // 3) Реальные звонки из телефонии
        const callsQ = userId
          ? supabase.from("call_logs")
              .select("id, direction, from_number, to_number, company_name, lead_id, status, answered_at, started_at, duration_sec, notes, created_at")
              .eq("manager_user_id", userId).order("created_at", { ascending: false }).limit(1000)
          : Promise.resolve({ data: [], error: null } as any);

        const [{ data: manualData, error: manualErr }, { data: callData, error: callErr }] = await Promise.all([manualQ, callsQ]);
        if (manualErr) throw manualErr;
        if (callErr) throw callErr;
        if (cancelled) return;

        const manual: ManualActivity[] = (manualData || []).map((a: any) => ({
          id: `m:${a.id}`, activity_type: a.activity_type, description: a.description,
          created_at: a.created_at, lead_id: a.lead_id, source: "manual",
        }));
        const calls: CallLogActivity[] = (callData || []).map((c: any) => ({
          id: `c:${c.id}`, activity_type: "call",
          description: c.notes || [c.direction === "outbound" ? "Исходящий" : "Входящий",
            c.to_number || c.from_number, c.duration_sec ? `${c.duration_sec} сек` : null].filter(Boolean).join(" · "),
          created_at: c.started_at || c.created_at, lead_id: c.lead_id, source: "call_log",
          answered: !!c.answered_at, direction: c.direction, duration_sec: c.duration_sec,
          to_number: c.to_number, company_name: c.company_name,
        }));

        const merged = [...manual, ...calls].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
        setActivities(merged);

        const ids = Array.from(new Set(merged.map(a => a.lead_id).filter(Boolean) as string[]));
        if (ids.length) {
          const { data: leads } = await supabase.from("sales_leads").select("id, org_name").in("id", ids);
          if (!cancelled) {
            const m: Record<string, LeadLite> = {};
            (leads || []).forEach((l: any) => { m[l.id] = l; });
            setLeadMap(m);
          }
        }
      } catch (e: any) {
        toast.error("Не удалось загрузить историю", { description: e.message });
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [managerId]);

  const stats = useMemo(() => {
    const calls = activities.filter(a => a.activity_type === "call");
    const notes = activities.filter(a => a.activity_type === "note");
    const success = calls.filter(c => classifyCall(c) === "success").length;
    const fail = calls.filter(c => classifyCall(c) === "fail").length;
    const uniqueLeads = new Set(activities.map(a => a.lead_id).filter(Boolean));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const week = new Date(); week.setDate(week.getDate() - 7);
    return {
      total: activities.length, calls: calls.length, notes: notes.length, success, fail,
      uniqueLeads: uniqueLeads.size,
      todayCount: activities.filter(a => new Date(a.created_at) >= today).length,
      weekCount: activities.filter(a => new Date(a.created_at) >= week).length,
      conv: calls.length ? Math.round((success / calls.length) * 100) : 0,
    };
  }, [activities]);

  const byDay = useMemo(() => {
    const map = new Map<string, Activity[]>();
    activities.forEach(a => {
      const key = new Date(a.created_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    });
    return Array.from(map.entries());
  }, [activities]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Kpi icon={<Phone className="w-4 h-4" />} label="Звонков" value={stats.calls} />
        <Kpi icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} label="Успешных" value={stats.success} />
        <Kpi icon={<XCircle className="w-4 h-4 text-destructive" />} label="Отказ" value={stats.fail} />
        <Kpi icon={<TrendingUp className="w-4 h-4 text-primary" />} label="Конверсия" value={`${stats.conv}%`} />
        <Kpi icon={<StickyNote className="w-4 h-4" />} label="Заметок" value={stats.notes} />
        <Kpi icon={<Clock className="w-4 h-4" />} label="Сегодня" value={stats.todayCount} />
        <Kpi icon={<Clock className="w-4 h-4" />} label="7 дней" value={stats.weekCount} />
        <Kpi icon={<Phone className="w-4 h-4" />} label="Уник. лидов" value={stats.uniqueLeads} />
      </div>

      <ScrollArea className="h-[420px] pr-2">
        {loading && <div className="text-sm text-muted-foreground py-8 text-center">Загрузка…</div>}
        {!loading && activities.length === 0 && (
          <div className="text-sm text-muted-foreground py-8 text-center">У менеджера пока нет активностей</div>
        )}
        {!loading && byDay.map(([day, items]) => (
          <div key={day} className="mb-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">{day}</div>
            <div className="space-y-2">
              {items.map(a => {
                const cls = a.activity_type === "call" ? classifyCall(a) : "other";
                const isCall = a.activity_type === "call";
                const fromCallLog = a.source === "call_log";
                const title = leadMap[a.lead_id || ""]?.org_name
                  || (fromCallLog ? (a as CallLogActivity).company_name : null)
                  || (fromCallLog ? (a as CallLogActivity).to_number : null)
                  || "Без названия";
                return (
                  <div key={a.id} className="border rounded-lg p-3 bg-card">
                    <div className="flex items-center gap-2 text-sm mb-1 flex-wrap">
                      {isCall ? <PhoneOutgoing className="w-3.5 h-3.5 text-primary" /> : <StickyNote className="w-3.5 h-3.5 text-muted-foreground" />}
                      <span className="font-medium truncate">{title}</span>
                      {fromCallLog && <Badge variant="outline" className="text-[10px]">АТС</Badge>}
                      {isCall && cls === "success" && <Badge className="bg-emerald-500/15 text-emerald-700 border-0">Успех</Badge>}
                      {isCall && cls === "fail" && <Badge variant="destructive" className="opacity-80">Отказ</Badge>}
                      <span className="ml-auto text-xs text-muted-foreground">{fmt(a.created_at)}</span>
                    </div>
                    {a.description && <div className="text-sm text-muted-foreground whitespace-pre-wrap">{a.description}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </ScrollArea>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card p-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-0.5">{icon}{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
