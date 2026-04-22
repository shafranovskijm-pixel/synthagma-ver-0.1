import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ShieldCheck, FileText, Trash2, Pencil, Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useOrgDataSubjectRequests, DSR_TYPE_LABELS, DSR_STATUS_LABELS, DSR_STATUS_COLORS, type DataSubjectRequest, type DSRStatus, type DSRType } from "@/hooks/useDataSubjectRequests";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInDays } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<DSRType, typeof FileText> = {
  access: FileText,
  deletion: Trash2,
  withdrawal: ShieldCheck,
  correction: Pencil,
};

interface Props { organizationId: string }

export function DataSubjectRequestsManager({ organizationId }: Props) {
  const { requests, loading, filter, setFilter, counts, updateStatus } = useOrgDataSubjectRequests(organizationId);
  const [selected, setSelected] = useState<DataSubjectRequest | null>(null);
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});
  const [response, setResponse] = useState("");
  const [newStatus, setNewStatus] = useState<DSRStatus>("in_progress");
  const [saving, setSaving] = useState(false);

  // Загрузка имён студентов
  useEffect(() => {
    const userIds = Array.from(new Set(requests.map(r => r.user_id)));
    if (!userIds.length) return;
    supabase.from("profiles").select("id, full_name").in("id", userIds).then(({ data }) => {
      const map: Record<string, string> = {};
      (data || []).forEach((p: any) => { map[p.id] = p.full_name || "—"; });
      setStudentNames(map);
    });
  }, [requests]);

  const openDialog = (req: DataSubjectRequest) => {
    setSelected(req);
    setResponse(req.response || "");
    setNewStatus(req.status === "pending" ? "in_progress" : req.status);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    const ok = await updateStatus(selected.id, newStatus, response);
    setSaving(false);
    if (ok) setSelected(null);
  };

  const renderRow = (req: DataSubjectRequest) => {
    const Icon = TYPE_ICONS[req.request_type];
    const daysLeft = req.due_date ? differenceInDays(new Date(req.due_date), new Date()) : null;
    const isOverdue = daysLeft !== null && daysLeft < 0 && req.status !== "resolved" && req.status !== "rejected";
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
        {req.description && (
          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{req.description}</p>
        )}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{format(new Date(req.created_at), "dd MMM yyyy", { locale: ru })}</span>
          {req.due_date && req.status !== "resolved" && req.status !== "rejected" && (
            <span className={isOverdue ? "text-rose-600 font-medium" : ""}>
              Срок: {format(new Date(req.due_date), "dd MMM", { locale: ru })} {daysLeft !== null && (daysLeft >= 0 ? `(${daysLeft} дн.)` : `(просрочен на ${-daysLeft} дн.)`)}
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
          <strong className="text-foreground">152-ФЗ:</strong> запросы субъектов персональных данных. Срок ответа — 30 дней с момента поступления (ст. 14, 21).
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
            <p className="text-sm">{filter === "all" ? "Запросов пока нет" : "Нет запросов в этой категории"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {requests.map(renderRow)}
        </div>
      )}

      {/* Диалог обработки */}
      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Обработка запроса</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="bg-muted/40 rounded-xl p-3 space-y-1.5">
                <div className="text-sm font-medium">{DSR_TYPE_LABELS[selected.request_type]}</div>
                <div className="text-xs text-muted-foreground">
                  От: <strong className="text-foreground">{studentNames[selected.user_id] || "—"}</strong>
                  {selected.contact_email && <> · {selected.contact_email}</>}
                </div>
                <div className="text-xs text-muted-foreground">
                  Создан: {format(new Date(selected.created_at), "dd MMMM yyyy", { locale: ru })}
                  {selected.due_date && <> · Срок до: {format(new Date(selected.due_date), "dd MMMM yyyy", { locale: ru })}</>}
                </div>
                {selected.description && (
                  <div className="text-sm pt-2 border-t border-border/60 mt-2 whitespace-pre-wrap">{selected.description}</div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Новый статус</Label>
                <Select value={newStatus} onValueChange={(v) => setNewStatus(v as DSRStatus)}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_progress">В работе</SelectItem>
                    <SelectItem value="resolved">Выполнен</SelectItem>
                    <SelectItem value="rejected">Отклонён</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Ответ заявителю</Label>
                <Textarea
                  value={response}
                  onChange={e => setResponse(e.target.value)}
                  placeholder="Опишите принятые меры или причину отклонения"
                  rows={5}
                  className="rounded-xl"
                />
                <p className="text-[11px] text-muted-foreground">
                  Заявитель увидит этот ответ в своём кабинете. При отказе обязательно укажите законное основание.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)} className="rounded-xl">Закрыть</Button>
            <Button onClick={handleSave} disabled={saving} className="rounded-xl">
              {saving ? "Сохранение..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
