import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type {
  OrgCrmClient, OrgCrmDeal, OrgCrmTask, OrgCrmSnapshot,
  OrgCrmClientInput, OrgCrmDealInput, OrgCrmTaskInput, OrgCrmActivityInput,
} from "@/lib/organization/orgCrm";

export const CRM_STAGES = { new: "Новая", contacted: "Первый контакт", negotiation: "Переговоры", won: "Успешно завершена", lost: "Не состоялась" } as const;
export const CRM_TASK_TYPES = { call: "Звонок", email: "Письмо", meeting: "Встреча", followup: "Связаться повторно", other: "Другое" } as const;
export const CRM_TASK_STATUSES = { pending: "К выполнению", done: "Выполнена", cancelled: "Отменена" } as const;
export const CRM_ACTIVITY_TYPES = { note: "Заметка", call: "Звонок", meeting: "Встреча" } as const;
export const crmSelectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export type OrgCrmEditorState =
  | { kind: "client"; record?: OrgCrmClient }
  | { kind: "deal"; record?: OrgCrmDeal }
  | { kind: "task"; record?: OrgCrmTask }
  | { kind: "activity"; dealId?: string };

export function crmErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return message || "Не удалось сохранить изменения. Проверьте соединение и попробуйте ещё раз.";
}

function localDateTime(value?: string) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

interface Props {
  editor: OrgCrmEditorState;
  snapshot: OrgCrmSnapshot;
  selectedClientId?: string;
  onClose: () => void;
  onSaved: (clientId: string) => void;
  saveClient: (input: OrgCrmClientInput) => Promise<{ id: string }>;
  saveDeal: (input: OrgCrmDealInput) => Promise<{ id: string }>;
  saveTask: (input: OrgCrmTaskInput) => Promise<{ id: string }>;
  addActivity: (input: OrgCrmActivityInput) => Promise<unknown>;
}

export function OrgCrmEditor({ editor, snapshot, selectedClientId, onClose, onSaved, saveClient, saveDeal, saveTask, addActivity }: Props) {
  const record = editor.kind === "activity" ? undefined : editor.record;
  const related = editor.kind === "deal" || editor.kind === "task" ? editor.record : undefined;
  const client = editor.kind === "client" ? editor.record : undefined;
  const task = editor.kind === "task" ? editor.record : undefined;
  const deal = editor.kind === "deal" ? editor.record : undefined;
  const [clientId, setClientId] = useState(related?.client_id || selectedClientId || "");
  const [dealId, setDealId] = useState(task?.deal_id || (editor.kind === "activity" ? editor.dealId : "") || "");
  const [orgName, setOrgName] = useState(client?.org_name || "");
  const [inn, setInn] = useState(client?.inn || "");
  const [email, setEmail] = useState(client?.email || "");
  const [phone, setPhone] = useState(client?.phone || "");
  const [address, setAddress] = useState(client?.address || "");
  const [notes, setNotes] = useState(client?.notes || "");
  const [title, setTitle] = useState(deal?.title || task?.title || "");
  const [stage, setStage] = useState<OrgCrmDeal["stage"]>(deal?.stage || "new");
  const [amount, setAmount] = useState(String(deal?.amount ?? 0));
  const [description, setDescription] = useState(task?.description || "");
  const [dueDate, setDueDate] = useState(localDateTime(task?.due_date));
  const [status, setStatus] = useState<OrgCrmTask["status"]>(task?.status || "pending");
  const [taskType, setTaskType] = useState<OrgCrmTask["type"]>(task?.type || "followup");
  const [assignee, setAssignee] = useState(task?.assigned_user_id || "");
  const [activityType, setActivityType] = useState<OrgCrmActivityInput["activity_type"]>("note");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  const submitting = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  const clientDeals = snapshot.deals.filter(item => item.client_id === clientId);
  const emptyToNull = (value: string) => value.trim() || null;
  const revision = record ? { id: record.id, expected_updated_at: record.updated_at } : {};
  const titles = { client: "клиента", deal: "сделку", task: "задачу", activity: "запись в историю" };
  const heading = `${record ? "Изменить" : "Добавить"} ${titles[editor.kind]}`;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    if (editor.kind === "client" && !orgName.trim()) { setError("Укажите название клиента."); return; }
    if (editor.kind !== "client" && !snapshot.clients.some(item => item.id === clientId)) { setError("Выберите клиента."); return; }
    if ((editor.kind === "deal" || editor.kind === "task") && !title.trim()) { setError("Укажите название."); return; }
    if ((editor.kind === "task" || editor.kind === "activity") && dealId && !clientDeals.some(item => item.id === dealId)) { setError("Выберите сделку этого клиента."); return; }
    if (editor.kind === "deal" && (!amount.trim() || !Number.isFinite(Number(amount)) || Number(amount) < 0)) { setError("Сумма должна быть числом не меньше нуля."); return; }
    if (editor.kind === "task" && (!dueDate || Number.isNaN(new Date(dueDate).getTime()))) { setError("Укажите срок задачи."); return; }
    if (editor.kind === "activity" && !description.trim()) { setError("Опишите результат общения или добавьте заметку."); return; }
    submitting.current = true;
    setBusy(true);
    try {
      let savedClientId = clientId;
      if (editor.kind === "client") {
        const saved = await saveClient({ ...revision, org_name: orgName.trim(), inn: emptyToNull(inn), email: emptyToNull(email), phone: emptyToNull(phone), address: emptyToNull(address), notes: emptyToNull(notes) });
        savedClientId = saved.id;
      } else if (editor.kind === "deal") {
        await saveDeal({ ...revision, client_id: clientId, title: title.trim(), stage, amount: Number(amount) });
      } else if (editor.kind === "task") {
        await saveTask({ ...revision, client_id: clientId, deal_id: dealId || null, title: title.trim(), description: emptyToNull(description), due_date: new Date(dueDate).toISOString(), status, type: taskType, assigned_user_id: assignee || null });
      } else {
        await addActivity({ client_id: clientId, deal_id: dealId || null, activity_type: activityType, description: description.trim() });
      }
      if (active.current) onSaved(savedClientId);
    } catch (saveError) {
      if (active.current) setError(crmErrorMessage(saveError));
    } finally {
      if (active.current) { setBusy(false); submitting.current = false; }
    }
  };

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>{heading}</DialogTitle><DialogDescription>
        {editor.kind === "activity" ? "Запишите уже состоявшееся общение или заметку. Отправка сообщений не выполняется." : "Данные сохраняются в CRM вашей организации."}
      </DialogDescription></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          {editor.kind === "client" ? <>
            <Field label="Название клиента" id="crm-name"><Input id="crm-name" required maxLength={250} value={orgName} onChange={e => setOrgName(e.target.value)} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ИНН" id="crm-inn"><Input id="crm-inn" inputMode="numeric" maxLength={12} value={inn} onChange={e => setInn(e.target.value)} /></Field>
              <Field label="Телефон" id="crm-phone"><Input id="crm-phone" type="tel" maxLength={80} value={phone} onChange={e => setPhone(e.target.value)} /></Field>
            </div>
            <Field label="Email" id="crm-email"><Input id="crm-email" type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></Field>
            <Field label="Адрес" id="crm-address"><Input id="crm-address" maxLength={1000} value={address} onChange={e => setAddress(e.target.value)} /></Field>
            <Field label="Примечание" id="crm-notes"><Textarea id="crm-notes" maxLength={10000} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
          </> : <>
            <Field label="Клиент" id="crm-client"><select id="crm-client" required className={crmSelectClass} value={clientId} disabled={!!record} onChange={e => { setClientId(e.target.value); setDealId(""); }}>
              <option value="">Выберите клиента</option>{snapshot.clients.map(item => <option key={item.id} value={item.id}>{item.org_name}</option>)}
            </select></Field>
            {(editor.kind === "task" || editor.kind === "activity") && <Field label="Сделка (необязательно)" id="crm-deal"><select id="crm-deal" className={crmSelectClass} value={dealId} onChange={e => setDealId(e.target.value)}>
              <option value="">Без привязки к сделке</option>{clientDeals.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select></Field>}
            {(editor.kind === "deal" || editor.kind === "task") && <Field label={editor.kind === "deal" ? "Название сделки" : "Название задачи"} id="crm-title"><Input id="crm-title" required maxLength={250} value={title} onChange={e => setTitle(e.target.value)} /></Field>}
            {editor.kind === "deal" && <>
              <Field label="Этап сделки" id="crm-stage"><select id="crm-stage" className={crmSelectClass} value={stage} onChange={e => setStage(e.target.value as OrgCrmDeal["stage"])}>{Object.entries(CRM_STAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <Field label="Сумма сделки, ₽" id="crm-amount"><Input id="crm-amount" type="number" min="0" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} /></Field>
              <p className="text-xs text-muted-foreground">Этап и сумма отражают вашу оценку сделки. Они не подтверждают оплату или подписание документов.</p>
            </>}
            {editor.kind === "task" && <>
              <Field label="Срок задачи" id="crm-due"><Input id="crm-due" type="datetime-local" required value={dueDate} onChange={e => setDueDate(e.target.value)} /></Field>
              <Field label="Ответственный" id="crm-assignee"><select id="crm-assignee" className={crmSelectClass} value={assignee} onChange={e => setAssignee(e.target.value)}>
                <option value="">Не назначен</option>{assignee && !snapshot.assignees.some(item => item.user_id === assignee) && <option value={assignee}>Ранее назначенный сотрудник (недоступен)</option>}{snapshot.assignees.map(item => <option key={item.user_id} value={item.user_id}>{item.full_name || item.user_id}</option>)}
              </select></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Тип задачи" id="crm-task-type"><select id="crm-task-type" className={crmSelectClass} value={taskType} onChange={e => setTaskType(e.target.value as OrgCrmTask["type"])}>{Object.entries(CRM_TASK_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                <Field label="Статус задачи" id="crm-task-status"><select id="crm-task-status" className={crmSelectClass} value={status} onChange={e => setStatus(e.target.value as OrgCrmTask["status"])}>{Object.entries(CRM_TASK_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              </div>
              <p className="text-xs text-muted-foreground">Напоминание отображается в списке задач по сроку. Автоматических писем и уведомлений пока нет.</p>
            </>}
            {editor.kind === "activity" && <Field label="Тип записи" id="crm-activity-type"><select id="crm-activity-type" className={crmSelectClass} value={activityType} onChange={e => setActivityType(e.target.value as OrgCrmActivityInput["activity_type"])}>{Object.entries(CRM_ACTIVITY_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>}
            {(editor.kind === "task" || editor.kind === "activity") && <Field label={editor.kind === "activity" ? "Результат общения / заметка" : "Описание задачи"} id="crm-description"><Textarea id="crm-description" required={editor.kind === "activity"} maxLength={10000} value={description} onChange={e => setDescription(e.target.value)} /></Field>}
          </>}
        </fieldset>
        {error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Отмена</Button><Button type="submit" disabled={busy}>{busy ? "Сохранение…" : "Сохранить"}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
