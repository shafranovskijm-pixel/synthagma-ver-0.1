import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { DSR_BASES, DSR_CALENDAR_ID, dsrDeadlineLabel, previewDSRDeadline, type DSRBasis } from "@/lib/dataSubjectDeadlines";
import { DSR_TYPE_LABELS, type DataSubjectRequest, type DSRStatus } from "@/hooks/useDataSubjectRequests";

interface Props {
  request: DataSubjectRequest;
  saving: boolean;
  onClose: () => void;
  onSave: (action: "review" | "extend" | "respond", payload: Record<string, unknown>) => Promise<boolean>;
}
export function DataSubjectRequestReviewDialog({ request, saving, onClose, onSave }: Props) {
  const d = request.deadline_details;
  const closed = ["resolved", "rejected"].includes(request.status);
  const [action, setAction] = useState<"review" | "extend" | "respond">(!d || d.state === "needs_review" ? "review" : "respond");
  const [basis, setBasis] = useState<DSRBasis>(d?.basis ?? (request.request_type === "deletion" ? "manual" : request.request_type));
  const [trigger, setTrigger] = useState(d?.trigger_on ?? "");
  const [zone, setZone] = useState(d?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [calendar, setCalendar] = useState(d?.calendar_id ?? DSR_CALENDAR_ID);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [legalBasis, setLegalBasis] = useState(d?.legal_basis ?? "");
  const [manualDue, setManualDue] = useState(d?.state === "manual_review" ? d.control_due_on ?? "" : "");
  const [extension, setExtension] = useState(String(Math.min(5, (d?.extension_days ?? 0) + 1)));
  const [notice, setNotice] = useState("");
  const [noticeReference, setNoticeReference] = useState("");
  const [status, setStatus] = useState<DSRStatus>(request.status === "pending" ? "in_progress" : request.status);
  const [response, setResponse] = useState(request.response ?? "");
  const [decision, setDecision] = useState(d?.decision ?? "processing");
  const [decisionBasis, setDecisionBasis] = useState(d?.decision_basis ?? "");
  const [decisionReason, setDecisionReason] = useState(d?.decision_reason ?? "");
  const [blocked, setBlocked] = useState(d?.blocked_on ?? "");
  const [destructionReview, setDestructionReview] = useState(d?.destruction_review_on ?? "");
  const preview = action === "review" && calendar === DSR_CALENDAR_ID ? previewDSRDeadline(basis, trigger) : null;
  const needsDecisionBasis = ["retention", "refusal", "blocked_destruction"].includes(decision);
  const allowedBases = (Object.keys(DSR_BASES) as DSRBasis[]).filter(key => (DSR_BASES[key].types as readonly string[]).includes(request.request_type));
  const handleSave = async () => {
    if (!reason.trim()) { toast.error("Укажите основание изменения записи"); return; }
    if (action === "review" && (!confirmed || !trigger || !zone || (basis === "manual" && !legalBasis.trim()))) { toast.error("Подтвердите фактическую дату, часовой пояс, календарь и основание"); return; }
    if (action === "extend" && (!notice || !noticeReference.trim())) { toast.error("Укажите отправленное уведомление и подтверждение отправки"); return; }
    if (needsDecisionBasis && (!decisionBasis.trim() || !decisionReason.trim())) { toast.error("Нужны конкретное правовое основание и мотивировка решения"); return; }
    if (status === "rejected" && decision !== "refusal" || status === "resolved" && !["completed", "retention"].includes(decision) || status === "in_progress" && ["completed", "refusal"].includes(decision)) { toast.error("Согласуйте статус с принятым решением"); return; }
    if (["resolved", "rejected"].includes(status) && !response.trim()) { toast.error("Добавьте мотивированный ответ заявителю"); return; }
    const payload = { reason, status, response, decision, decision_basis: decisionBasis, decision_reason: decisionReason,
      ...(action === "review" ? { basis, trigger_on: trigger, time_zone: zone, calendar_id: calendar, facts_confirmed: confirmed, legal_basis: legalBasis, manual_due_on: manualDue || null } : {}),
      ...(action === "extend" ? { extension_days: Number(extension), notice_on: notice, notice_reference: noticeReference } : {}),
      ...(decision === "blocked_destruction" ? { blocked_on: blocked, destruction_review_on: destructionReview } : {}),
    };
    if (await onSave(action, payload)) onClose();
  };
  return <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
    <DialogHeader><DialogTitle>Обработка запроса</DialogTitle><DialogDescription>Проверка основания, контрольного срока и мотивированного решения с сохранением истории.</DialogDescription></DialogHeader>
    <div className="space-y-4">
      <div className="bg-muted/40 rounded-xl p-3 space-y-1.5 text-xs">
        <div className="text-sm font-medium">{DSR_TYPE_LABELS[request.request_type]}</div>
        <p>{request.contact_email}</p><p>{request.description}</p>
        <p>{dsrDeadlineLabel(d)}{request.due_date ? ` · ${request.due_date}` : ""}</p>
        {d?.basis && <p>{DSR_BASES[d.basis]?.label} · версия правила {d.rule_version}</p>}
        {d?.destruction_due_on && <p>Если правомерность обработки обеспечить невозможно: контроль уничтожения до {d.destruction_due_on}.</p>}
        {!!d?.extension_days && <p>Продление: {d.extension_days} рабочих дней. Уведомление: {d.notice_on} · {d.notice_reference}.</p>}
      </div>
      {!closed && <>
        <div className="space-y-2"><Label>Действие</Label><Select value={action} onValueChange={v => setAction(v as typeof action)}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value="review">Проверить / уточнить основание и срок</SelectItem>
          {d && d.state !== "needs_review" && <SelectItem value="respond">Записать решение и ответ</SelectItem>}
          {d?.state === "calculated" && ["access", "cessation"].includes(d.basis ?? "") && (d.extension_days ?? 0) < 5 && <SelectItem value="extend">Продлить с мотивированным уведомлением</SelectItem>}
        </SelectContent></Select></div>
        {action === "review" && <div className="space-y-3 border rounded-xl p-3">
          <div className="space-y-2"><Label>Правовое основание и событие начала срока</Label><Select value={basis} onValueChange={v => setBasis(v as DSRBasis)}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{allowedBases.map(key => <SelectItem key={key} value={key}>{DSR_BASES[key].label}</SelectItem>)}</SelectContent></Select></div>
          <p className="text-xs text-muted-foreground">Для исправления и удаления по ст. 20 ч. 3 нужна дата подтверждающих сведений; для нарушения — дата выявления. Дата создания карточки не заменяет эти события. Специальные требования к распространению данных (ст. 10.1, включая немедленное прекращение) и сроки суда оформляются через отдельное ручное основание.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="dsr-trigger">Фактическая дата события</Label><Input id="dsr-trigger" type="date" value={trigger} onChange={e => setTrigger(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="dsr-zone">Часовой пояс оператора (IANA)</Label><Input id="dsr-zone" value={zone} onChange={e => setZone(e.target.value)} placeholder="Asia/Vladivostok" /></div></div>
          <div className="space-y-2"><Label>Календарь</Label><Select value={calendar} onValueChange={setCalendar}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={DSR_CALENDAR_ID}>Федеральный, пятидневная неделя, 2026</SelectItem><SelectItem value="manual">Другой / региональный — ручная проверка</SelectItem></SelectContent></Select></div>
          {basis === "manual" && <><Label htmlFor="dsr-legal">Конкретная норма / особое основание</Label><Textarea id="dsr-legal" value={legalBasis} onChange={e => setLegalBasis(e.target.value)} /><Label htmlFor="dsr-manual-due">Ручная контрольная дата (если установлена)</Label><Input id="dsr-manual-due" type="date" value={manualDue} onChange={e => setManualDue(e.target.value)} /></>}
          <p className="text-xs text-muted-foreground">{preview ? `Предварительный контроль: ${preview}. Окончательный расчёт выполняет сервер.` : "Автоматическая дата не определена. Другой год, переход через границу 2026 года или иной календарь требуют ручной проверки."} День события не включается. Календарные сроки не переносятся на более поздний рабочий день в этом контрольном расчёте.</p>
          <label className="flex items-start gap-2 text-xs"><Checkbox checked={confirmed} onCheckedChange={v => setConfirmed(v === true)} /><span>Подтверждаю фактическую дату, основание и применимость выбранного календаря. Это уточнение сохраняется в истории.</span></label>
        </div>}
        {action === "extend" && <div className="space-y-3 border rounded-xl p-3">
          <p className="text-xs text-muted-foreground">Только доступ и требование прекращения обработки. Уведомление должно быть мотивировано и отправлено до исходного срока. Система сохраняет факт, но не отправляет письмо.</p>
          <Label htmlFor="dsr-extension">Всего дополнительных рабочих дней (максимум 5)</Label><Input id="dsr-extension" type="number" min={(d?.extension_days ?? 0) + 1} max={5} value={extension} onChange={e => setExtension(e.target.value)} />
          <Label htmlFor="dsr-notice">Дата отправки уведомления</Label><Input id="dsr-notice" type="date" value={notice} onChange={e => setNotice(e.target.value)} />
          <Label htmlFor="dsr-notice-reference">Подтверждение отправки / регистрационный номер</Label><Input id="dsr-notice-reference" value={noticeReference} onChange={e => setNoticeReference(e.target.value)} />
        </div>}
        <div className="space-y-2"><Label>Решение оператора</Label><Select value={decision} onValueChange={v => setDecision(v as typeof decision)}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="processing">Проверка / исполнение продолжается</SelectItem><SelectItem value="completed">Требование выполнено, меры документированы</SelectItem><SelectItem value="retention">Сохранение части данных на отдельном законном основании</SelectItem><SelectItem value="refusal">Мотивированный отказ</SelectItem><SelectItem value="blocked_destruction">Уничтожение временно невозможно: блокирование и отдельный контроль</SelectItem></SelectContent></Select></div>
        {needsDecisionBasis && <><Label htmlFor="dsr-decision-basis">Норма / обязательный срок хранения / основание отказа</Label><Textarea id="dsr-decision-basis" value={decisionBasis} onChange={e => setDecisionBasis(e.target.value)} /><Label htmlFor="dsr-decision-reason">Какие данные сохраняются и почему / мотивировка</Label><Textarea id="dsr-decision-reason" value={decisionReason} onChange={e => setDecisionReason(e.target.value)} /></>}
        {decision === "blocked_destruction" && <><p className="text-xs text-muted-foreground">Ст. 21 ч. 6 не даёт общего продления. Зафиксируйте невозможность уничтожения, фактическое блокирование и контроль не позднее шести месяцев от подтверждённого события. Другой срок по федеральному закону требует ручной проверки. Исходный срок не обнуляется.</p><Label htmlFor="dsr-blocked">Фактическая дата блокирования</Label><Input id="dsr-blocked" type="date" value={blocked} onChange={e => setBlocked(e.target.value)} /><Label htmlFor="dsr-destruction">Контроль уничтожения</Label><Input id="dsr-destruction" type="date" value={destructionReview} onChange={e => setDestructionReview(e.target.value)} /></>}
        <div className="space-y-2"><Label>Новый статус</Label><Select value={status} onValueChange={v => setStatus(v as DSRStatus)}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="in_progress">В работе</SelectItem><SelectItem value="resolved">Выполнен</SelectItem><SelectItem value="rejected">Отклонён</SelectItem></SelectContent></Select></div>
        <Label htmlFor="dsr-reason">Основание этой записи в истории</Label><Textarea id="dsr-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="Что проверено, на каких сведениях основано изменение" />
        <Label htmlFor="dsr-response">Ответ заявителю</Label><Textarea id="dsr-response" value={response} onChange={e => setResponse(e.target.value)} rows={4} />
        <p className="text-xs text-muted-foreground">Ответ виден заявителю. Отказ в доступе требует ссылки на ст. 14 ч. 8 или иную конкретную норму. Данные и обязательные документы этим действием не удаляются; решение о хранении не останавливает срок молча.</p>
      </>}
      {closed && <p className="text-sm whitespace-pre-wrap">{request.response}</p>}
      <details className="text-xs border rounded-xl p-3"><summary className="cursor-pointer font-medium">История оснований и сроков ({request.deadline_history?.length ?? 0})</summary><div className="space-y-3 pt-3">{request.deadline_history?.map(event => <div key={event.id} className="border-t pt-2"><strong>Ревизия {event.revision} · {event.created_at}</strong><p>{event.reason}</p><p>Предыдущий контроль: {String(event.before_state?.due_date ?? "не определён")} → {String(event.after_state.due_date ?? "не определён")}</p></div>)}{!request.deadline_history?.length && <p>Историческая запись. Автоматический пересчёт не выполнялся.</p>}</div></details>
    </div>
    <DialogFooter><Button variant="outline" onClick={onClose} className="rounded-xl">Закрыть</Button>{!closed && <Button onClick={() => void handleSave()} disabled={saving} className="rounded-xl">{saving ? "Сохранение..." : "Сохранить"}</Button>}</DialogFooter>
  </DialogContent>;
}
