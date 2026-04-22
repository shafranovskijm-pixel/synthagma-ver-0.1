import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ShieldCheck, FileText, Trash2, Pencil, AlertCircle, Plus, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useMyDataSubjectRequests, DSR_TYPE_LABELS, DSR_STATUS_LABELS, DSR_STATUS_COLORS, type DSRType } from "@/hooks/useDataSubjectRequests";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface Props {
  userId: string;
  organizationId: string;
  userEmail?: string;
}

const TYPE_ICONS: Record<DSRType, typeof FileText> = {
  access: FileText,
  deletion: Trash2,
  withdrawal: ShieldCheck,
  correction: Pencil,
};

const TYPE_DESCRIPTIONS: Record<DSRType, string> = {
  access: "Запросить копию всех ваших персональных данных, которые хранит организация",
  deletion: "Полное удаление ваших данных. Может быть отклонено, если есть законные основания для хранения (документы об образовании).",
  withdrawal: "Отозвать ранее данное согласие на обработку. После этого организация прекратит обработку, кроме предусмотренных законом случаев.",
  correction: "Запросить исправление неточных или устаревших данных",
};

export function StudentDataSubjectRequests({ userId, organizationId, userEmail }: Props) {
  const { requests, loading, submitting, create } = useMyDataSubjectRequests(userId);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<DSRType>("access");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState(userEmail || "");

  const handleSubmit = async () => {
    const ok = await create(organizationId, type, description, email);
    if (ok) {
      setOpen(false);
      setDescription("");
    }
  };

  if (!organizationId) {
    return (
      <Card className="rounded-2xl border-border/60 shadow-sm">
        <CardContent className="py-12 text-center text-muted-foreground">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Раздел недоступен — вы не привязаны к организации</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="rounded-2xl border-border/60 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Управление персональными данными
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Согласно 152-ФЗ вы можете запросить копию, исправление, отзыв согласия или удаление ваших данных. Срок ответа — 30 дней.
            </p>
          </div>
          <Button onClick={() => setOpen(true)} className="rounded-xl gap-2">
            <Plus className="w-4 h-4" /> Новый запрос
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-6 text-sm text-muted-foreground">Загрузка...</div>
          ) : requests.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm">У вас пока нет запросов</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map(req => {
                const Icon = TYPE_ICONS[req.request_type];
                return (
                  <div key={req.id} className="border border-border rounded-xl p-4 bg-card/50 hover:bg-card transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className="w-4 h-4 text-primary shrink-0" />
                        <span className="font-medium text-sm truncate">{DSR_TYPE_LABELS[req.request_type]}</span>
                      </div>
                      <Badge variant="outline" className={DSR_STATUS_COLORS[req.status]}>
                        {DSR_STATUS_LABELS[req.status]}
                      </Badge>
                    </div>
                    {req.description && (
                      <p className="text-xs text-muted-foreground mb-2 whitespace-pre-wrap">{req.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Создан: {format(new Date(req.created_at), "dd MMM yyyy", { locale: ru })}</span>
                      {req.due_date && req.status === "pending" && (
                        <span>Срок ответа: до {format(new Date(req.due_date), "dd MMM yyyy", { locale: ru })}</span>
                      )}
                      {req.resolved_at && (
                        <span className="flex items-center gap-1">
                          {req.status === "resolved" ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <XCircle className="w-3 h-3 text-rose-500" />}
                          {format(new Date(req.resolved_at), "dd MMM yyyy", { locale: ru })}
                        </span>
                      )}
                    </div>
                    {req.response && (
                      <div className="mt-3 pt-3 border-t border-border/60">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Ответ организации</p>
                        <p className="text-xs whitespace-pre-wrap">{req.response}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Новый запрос по персональным данным</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Тип запроса</Label>
              <Select value={type} onValueChange={(v) => setType(v as DSRType)}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(DSR_TYPE_LABELS) as DSRType[]).map(t => (
                    <SelectItem key={t} value={t}>{DSR_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{TYPE_DESCRIPTIONS[type]}</p>
            </div>
            <div className="space-y-2">
              <Label>Email для ответа</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label>Комментарий (опционально)</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Уточните детали запроса, если нужно"
                rows={4}
                className="rounded-xl"
              />
            </div>
            <div className="bg-muted/40 rounded-xl p-3 text-xs text-muted-foreground">
              <strong className="text-foreground">Важно:</strong> срок ответа — 30 дней с момента подачи (ст. 14 152-ФЗ). Удаление данных может быть отклонено в случаях, когда хранение требуется по закону (документы об образовании).
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Отмена</Button>
            <Button onClick={handleSubmit} disabled={submitting || !email} className="rounded-xl">
              {submitting ? "Отправка..." : "Отправить запрос"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
