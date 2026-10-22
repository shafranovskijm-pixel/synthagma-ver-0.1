import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { Dialog } from "@/components/ui/dialog";
import { DataSubjectRequestReviewDialog } from "./DataSubjectRequestReviewDialog";
import { DSR_DEADLINE_HELP, dsrDeadlineLabel, dsrIsOverdue, localToday } from "@/lib/dataSubjectDeadlines";
import { ShieldCheck, FileText, Trash2, Pencil, PauseCircle, Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useOrgDataSubjectRequests, DSR_TYPE_LABELS, DSR_STATUS_LABELS, DSR_STATUS_COLORS, type DataSubjectRequest, type DSRStatus, type DSRType } from "@/hooks/useDataSubjectRequests";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<DSRType, typeof FileText> = {
  access: FileText,
  deletion: Trash2,
  withdrawal: ShieldCheck,
  correction: Pencil,
  cessation: PauseCircle,
};

interface Props { organizationId: string }

export function DataSubjectRequestsManager({ organizationId }: Props) {
  const { requests, loading, filter, setFilter, counts, apply, readHistory, submitting, scopeKey, hasMore, loadMore, loadedCount } = useOrgDataSubjectRequests(organizationId);
  const [selectedRecord, setSelected] = useState<DataSubjectRequest | null>(null);
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});
  const selection = useRef(0);
  const selectedScope = useRef(scopeKey);
  const selected = selectedScope.current === scopeKey ? selectedRecord : null;
  useEffect(() => { selection.current++; setSelected(null); setStudentNames({}); }, [organizationId, scopeKey]);

  useEffect(() => {
    const userIds = Array.from(new Set(requests.map(r => r.user_id)));
    let live = true;
    if (!userIds.length) { setStudentNames({}); return; }
    supabase.from("profiles").select("user_id, full_name").in("user_id", userIds).then(({ data }) => {
      if (!live) return;
      const map: Record<string, string> = {};
      (data || []).forEach(p => { map[p.user_id] = p.full_name || "—"; });
      setStudentNames(map);
    });
    return () => { live = false; };
  }, [requests, organizationId]);
  const closeDialog = () => { selection.current++; setSelected(null); };
  const openDialog = async (req: DataSubjectRequest) => {
    const token = ++selection.current;
    selectedScope.current = scopeKey;
    setSelected(req);
    const fresh = await readHistory(req.id);
    if (selection.current === token && fresh) setSelected(fresh);
  };

  const renderRow = (req: DataSubjectRequest) => {
    const Icon = TYPE_ICONS[req.request_type];
    const today = localToday(req.deadline_details?.time_zone);
    const daysLeft = req.due_date && today ? Math.round((Date.parse(req.due_date) - Date.parse(today)) / 86400000) : null;
    const isOverdue = dsrIsOverdue(req);
    const isUrgent = daysLeft !== null && daysLeft <= 3 && daysLeft >= 0 && req.status === "pending";

    return (
      <div
        key={req.id}
        onClick={() => openDialog(req)}
        className={cn(
          "border rounded-xl p-4 bg-card/50 hover:bg-card transition-colors cursor-pointer",
          isOverdue ? "border-rose-500/50" : "border-border",
        )}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{DSR_TYPE_LABELS[req.request_type]}</div>
              <div className="text-xs text-muted-foreground truncate">
                {studentNames[req.user_id] || "Загрузка..."}{req.contact_email ? ` · ${req.contact_email}` : ""}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isOverdue && <Badge variant="outline" className="bg-rose-500/15 text-rose-700 border-rose-500/30 gap-1"><AlertTriangle className="w-3 h-3" />Просрочен</Badge>}
            {isUrgent && <Badge variant="outline" className="bg-amber-500/15 text-amber-700 border-amber-500/30">Срочно</Badge>}
            <Badge variant="outline" className={DSR_STATUS_COLORS[req.status]}>{DSR_STATUS_LABELS[req.status]}</Badge>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mb-2">{dsrDeadlineLabel(req.deadline_details)}</p>
        {req.description && (
          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{req.description}</p>
        )}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{format(new Date(req.created_at), "dd MMM yyyy", { locale: ru })}</span>
          {req.due_date && req.status !== "resolved" && req.status !== "rejected" && (
            <span className={isOverdue ? "text-rose-600 font-medium" : ""}>
              Контроль: {req.due_date} {daysLeft !== null && (daysLeft >= 0 ? `(${daysLeft} дн.)` : `(просрочен на ${-daysLeft} дн.)`)}
            </span>
          )}
          {req.resolved_at && (
            <span className="flex items-center gap-1">
              {req.status === "resolved" ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <XCircle className="w-3 h-3 text-rose-500" />}
              {format(new Date(req.resolved_at), "dd MMM", { locale: ru })}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="text-xs text-muted-foreground max-w-2xl">
          <strong className="text-foreground">152-ФЗ:</strong> {DSR_DEADLINE_HELP}
        </div>
      </div>

      {/* Фильтр */}
      <div className="flex flex-wrap gap-2">
        {([
          { key: "all", label: "Все", count: counts.all },
          { key: "pending", label: "Новые", count: counts.pending },
          { key: "in_progress", label: "В работе", count: counts.in_progress },
          { key: "resolved", label: "Выполнены", count: counts.resolved },
          { key: "rejected", label: "Отклонены", count: counts.rejected },
        ] as const).map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key as DSRStatus | "all")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              filter === f.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {f.label} <span className="opacity-70">({f.count})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Загрузка...</CardContent></Card>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">{filter === "all" ? "Запросов пока нет" : hasMore ? "В загруженной части нет запросов этой категории. Загрузите следующие записи." : "Нет запросов в этой категории"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {requests.map(renderRow)}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>Загружено {loadedCount} из {counts.all} запросов. Фильтр применяется к загруженным записям.</span>{hasMore && <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={loading}>Загрузить ещё</Button>}</div>
      <Dialog open={!!selected} onOpenChange={v => !v && closeDialog()}>
        {selected && <DataSubjectRequestReviewDialog key={selected.id + ":" + selected.deadline_revision} request={selected} saving={submitting} onClose={closeDialog} onSave={(action, payload) => apply(selected, action, payload)} />}
      </Dialog>
    </div>
  );
}
