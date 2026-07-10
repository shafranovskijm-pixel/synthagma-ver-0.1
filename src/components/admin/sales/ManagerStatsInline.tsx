import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Phone, PhoneOutgoing, StickyNote, CheckCircle2, XCircle, Clock, TrendingUp, Users } from "lucide-react";
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

type PeriodKey = "today" | "7" | "30" | "90" | "all";
const PERIOD_DAYS: Record<PeriodKey, number | null> = { today: 0, "7": 7, "30": 30, "90": 90, all: null };

export function ManagerStatsInline({ managerId }: { managerId: string }) {
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [leadMap, setLeadMap] = useState<Record<string, LeadLite>>({});
  const [period, setPeriod] = useState<PeriodKey>("30");
  const [source, setSource] = useState<"all" | "call_log" | "manual">("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: mgr } = await supabase.from("sales_managers").select("user_id").eq("id", managerId).maybeSingle();
        const userId = (mgr as any)?.user_id as string | undefined;

        const manualQ = supabase.from("sales_lead_activities")
          .select("id, activity_type, description, created_at, lead_id")
          .eq("manager_id", managerId).order("created_at", { ascending: false }).limit(2000);

        const callsQ = userId
          ? supabase.from("call_logs")
              .select("id, direction, from_number, to_number, company_name, lead_id, status, answered_at, started_at, duration_sec, notes, created_at")
              .eq("manager_user_id", userId).order("started_at", { ascending: false }).limit(2000)
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

  // Фильтр по периоду
  const periodStart = useMemo(() => {
    const days = PERIOD_DAYS[period];
    if (days === null) return null;
    const d = new Date();
    if (days === 0) d.setHours(0, 0, 0, 0);
    else { d.setDate(d.getDate() - days); }
    return d;
  }, [period]);

  const filtered = useMemo(() => {
    return activities.filter(a => {
      if (periodStart && new Date(a.created_at) < periodStart) return false;
      if (source !== "all" && a.source !== source) return false;
      return true;
    });
  }, [activities, periodStart, source]);

  const stats = useMemo(() => {
    const callsAts = filtered.filter(a => a.source === "call_log");
    const callsManual = filtered.filter(a => a.source === "manual" && a.activity_type === "call");
    const allCalls = [...callsAts, ...callsManual];
    const notes = filtered.filter(a => a.source === "manual" && a.activity_type === "note");
    const success = allCalls.filter(c => classifyCall(c) === "success").length;
    const fail = allCalls.filter(c => classifyCall(c) === "fail").length;
    // «Обработанные лиды» — уникальные lead_id по всем источникам за период
    const uniqueLeadsAll = new Set(filtered.map(a => a.lead_id).filter(Boolean));
    const uniqueLeadsAts = new Set(callsAts.map(a => a.lead_id).filter(Boolean));
    return {
      total: filtered.length,
      callsAts: callsAts.length,
      callsAtsAnswered: callsAts.filter(c => (c as CallLogActivity).answered).length,
      callsManual: callsManual.length,
      allCalls: allCalls.length,
      notes: notes.length,
      success, fail,
      uniqueLeadsAll: uniqueLeadsAll.size,
      uniqueLeadsAts: uniqueLeadsAts.size,
      conv: allCalls.length ? Math.round((success / allCalls.length) * 100) : 0,
    };
  }, [filtered]);

  const byDay = useMemo(() => {
    const map = new Map<string, Activity[]>();
    filtered.forEach(a => {
      const key = new Date(a.created_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
          <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Сегодня</SelectItem>
            <SelectItem value="7">7 дней</SelectItem>
            <SelectItem value="30">30 дней</SelectItem>
            <SelectItem value="90">90 дней</SelectItem>
            <SelectItem value="all">Всё время</SelectItem>
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={(v) => setSource(v as any)}>
          <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все источники</SelectItem>
            <SelectItem value="call_log">Только АТС</SelectItem>
            <SelectItem value="manual">Только ручные</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[11px] text-muted-foreground ml-auto">
          АТС ({stats.callsAts}) + ручные ({stats.callsManual}) = {stats.allCalls}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Kpi icon={<Phone className="w-4 h-4 text-primary" />} label="АТС звонки" value={stats.callsAts} hint={`отвечено: ${stats.callsAtsAnswered}`} />
        <Kpi icon={<PhoneOutgoing className="w-4 h-4" />} label="Ручные звонки" value={stats.callsManual} />
        <Kpi icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} label="Успешных" value={stats.success} />
        <Kpi icon={<XCircle className="w-4 h-4 text-destructive" />} label="Отказ" value={stats.fail} />
        <Kpi icon={<Users className="w-4 h-4 text-primary" />} label="Обработано лидов" value={stats.uniqueLeadsAll} hint={`через АТС: ${stats.uniqueLeadsAts}`} />
        <Kpi icon={<TrendingUp className="w-4 h-4 text-primary" />} label="Конверсия" value={`${stats.conv}%`} />
        <Kpi icon={<StickyNote className="w-4 h-4" />} label="Заметок" value={stats.notes} />
        <Kpi icon={<Clock className="w-4 h-4" />} label="Активностей" value={stats.total} />
      </div>

      <ScrollArea className="h-[420px] pr-2">
        {loading && <div className="text-sm text-muted-foreground py-8 text-center">Загрузка…</div>}
        {!loading && filtered.length === 0 && (
          <div className="text-sm text-muted-foreground py-8 text-center">Нет активностей за выбранный период</div>
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
                      {fromCallLog
                        ? <Badge variant="outline" className="text-[10px]">АТС</Badge>
                        : isCall && <Badge variant="outline" className="text-[10px]">ручной</Badge>}
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

function Kpi({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-0.5">{icon}{label}</div>
      <div className="text-lg font-semibold leading-tight">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}
