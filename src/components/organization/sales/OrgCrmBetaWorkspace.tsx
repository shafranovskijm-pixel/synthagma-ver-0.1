import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Building2, CalendarClock, FileText, Mail, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useOrgCrm } from "@/hooks/useOrgCrm";
import type { OrgCrmActivity, OrgCrmDeal, OrgCrmTask } from "@/lib/organization/orgCrm";
import { organizationMailingPath, organizationTabPath } from "@/lib/organization/workspaceNavigation";
import { companiesPath, studentDetailsPath } from "@/lib/groups/groupContext";
import { CRM_ACTIVITY_TYPES, CRM_STAGES, CRM_TASK_STATUSES, CRM_TASK_TYPES, OrgCrmEditor, crmErrorMessage, type OrgCrmEditorState } from "./OrgCrmEditor";

const TABS = { clients: "Клиенты", deals: "Сделки", tasks: "Задачи", history: "История" } as const;
type CrmTab = keyof typeof TABS;
interface Props {
  organizationId: string;
  canWrite: boolean;
  canOpenDocuments?: boolean;
  canOpenMailing?: boolean;
  canOpenCompanies?: boolean;
  canOpenStudents?: boolean;
}

const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Дата не указана" : date.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
};
const moneyLabel = (amount: number) => Number(amount).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " ₽";

export function OrgCrmBetaWorkspace(props: Props) {
  // A tenant switch unmounts all editors and pending UI continuations immediately.
  return <OrgCrmWorkspace key={props.organizationId} {...props} />;
}

function OrgCrmWorkspace({ organizationId, canWrite, canOpenDocuments = false, canOpenMailing = false, canOpenCompanies = false, canOpenStudents = false }: Props) {
  const crm = useOrgCrm(organizationId);
  const [params, setParams] = useSearchParams();
  const context = params.toString();
  const requestedTab = params.get("crmTab");
  const tab: CrmTab = requestedTab && Object.prototype.hasOwnProperty.call(TABS, requestedTab) ? requestedTab as CrmTab : "clients";
  const selectedId = params.get("crmClient") || "";
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<{ context: string; value: OrgCrmEditorState } | null>(null);
  const [feedback, setFeedback] = useState<{ context: string; text: string; error?: boolean } | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const mounted = useRef(true);
  const contextRef = useRef(context);
  contextRef.current = context;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const navigate = (nextTab: CrmTab, clientId = selectedId) => {
    setEditor(null);
    setFeedback(null);
    const next = new URLSearchParams(params);
    next.set("tab", "sales");
    if (nextTab === "clients") next.delete("crmTab"); else next.set("crmTab", nextTab);
    if (clientId) next.set("crmClient", clientId); else next.delete("crmClient");
    if (next.toString() !== context) setParams(next);
    return next.toString();
  };
  const openEditor = (value: OrgCrmEditorState) => { if (canWrite) { setFeedback(null); setEditor({ context, value }); } };

  const header = <div className="flex flex-wrap items-start justify-between gap-4">
    <div><div className="flex items-center gap-2"><h2 className="text-2xl font-semibold">CRM</h2><Badge variant="secondary">Beta</Badge></div><p className="mt-1 text-sm text-muted-foreground">Клиенты, сделки и следующие шаги вашей организации.</p></div>
    <div className="flex flex-wrap gap-2">
      {canOpenDocuments && <Button asChild variant="outline" size="sm"><Link to={organizationTabPath("documents")}><FileText className="mr-2 h-4 w-4" />Документы</Link></Button>}
      {canOpenMailing && <Button asChild variant="outline" size="sm"><Link to={organizationMailingPath()}><Mail className="mr-2 h-4 w-4" />Рассылки</Link></Button>}
      <Button variant="outline" size="sm" disabled={crm.isLoading} onClick={() => { void crm.refetch(); }}><RefreshCw className="mr-2 h-4 w-4" />Обновить</Button>
    </div>
  </div>;

  if (crm.isLoading) return <section className="space-y-5">{header}<p role="status" className="rounded-xl border p-8 text-center text-muted-foreground">Загрузка CRM…</p></section>;
  if (crm.error || !crm.data) return <section className="space-y-5">{header}<div role="alert" className="space-y-3 rounded-xl border border-destructive/30 p-6"><p className="font-medium">Не удалось загрузить CRM</p><p className="text-sm text-muted-foreground">Данные не показаны. Проверьте подключение и доступ к организации.</p><Button variant="outline" onClick={() => { void crm.refetch(); }}>Повторить загрузку</Button></div></section>;

  const data = crm.data;
  const selectedClient = data.clients.find(client => client.id === selectedId);
  const clientName = (id: string) => data.clients.find(client => client.id === id)?.org_name || "Клиент не загружен";
  const dealName = (id?: string | null) => id ? data.deals.find(deal => deal.id === id)?.title || "Сделка не загружена" : null;
  const assigneeName = (id?: string | null) => id ? data.assignees.find(person => person.user_id === id)?.full_name || "Ранее назначенный сотрудник" : "Не назначен";
  const deals = data.deals.filter(item => !selectedId || item.client_id === selectedId);
  const tasks = data.tasks.filter(item => !selectedId || item.client_id === selectedId).slice().sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending") || a.due_date.localeCompare(b.due_date));
  const activities = data.activities.filter(item => !selectedId || item.client_id === selectedId);
  const filteredClients = data.clients.filter(client => `${client.org_name} ${client.inn || ""} ${client.email || ""} ${client.phone || ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const truncated = Object.values(data.truncated).some(Boolean);
  const overdue = tasks.filter(task => task.status === "pending" && new Date(task.due_date).getTime() < Date.now()).length;
  const today = tasks.filter(task => task.status === "pending" && new Date(task.due_date).toDateString() === new Date().toDateString()).length;

  const completeTask = async (task: OrgCrmTask) => {
    if (!canWrite || completingId || crm.saveTask.isPending) return;
    const startedContext = context;
    setCompletingId(task.id);
    setFeedback(null);
    try {
      await crm.saveTask.mutateAsync({ id: task.id, expected_updated_at: task.updated_at, client_id: task.client_id, deal_id: task.deal_id, title: task.title, description: task.description, due_date: task.due_date, status: "done", type: task.type, assigned_user_id: task.assigned_user_id });
      if (mounted.current && contextRef.current === startedContext) setFeedback({ context: startedContext, text: "Задача выполнена." });
    } catch (error) {
      if (mounted.current && contextRef.current === startedContext) setFeedback({ context: startedContext, text: crmErrorMessage(error), error: true });
    } finally { if (mounted.current) setCompletingId(null); }
  };

  const renderDeals = (items: OrgCrmDeal[]) => items.length ? <div className="grid gap-3 md:grid-cols-2">{items.map(deal => <article key={deal.id} className="space-y-3 rounded-xl border bg-card p-4" aria-label={`Сделка: ${deal.title}`}>
    <div className="flex items-start justify-between gap-3"><h4 className="font-medium break-words">{deal.title}</h4><Badge variant="outline" className="shrink-0">{CRM_STAGES[deal.stage]}</Badge></div>
    {!selectedId && <button type="button" className="text-left text-sm text-primary hover:underline" onClick={() => navigate("clients", deal.client_id)}>{clientName(deal.client_id)}</button>}
    <p className="text-lg font-semibold">{moneyLabel(deal.amount)}</p>
    {canWrite && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => openEditor({ kind: "deal", record: deal })}>Изменить сделку</Button><Button size="sm" variant="ghost" onClick={() => { if (selectedId !== deal.client_id) { navigate("history", deal.client_id); } else openEditor({ kind: "activity", dealId: deal.id }); }}>{selectedId === deal.client_id ? "Записать общение" : "История клиента"}</Button></div>}
  </article>)}</div> : <EmptyState text="Сделок пока нет." />;

  const renderTasks = (items: OrgCrmTask[]) => items.length ? <div className="space-y-3">{items.map(task => {
    const isOverdue = task.status === "pending" && new Date(task.due_date).getTime() < Date.now();
    const isToday = task.status === "pending" && new Date(task.due_date).toDateString() === new Date().toDateString();
    return <article key={task.id} className="space-y-2 rounded-xl border bg-card p-4" aria-label={`Задача: ${task.title}`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-medium">{task.title}</h4><div className="flex gap-2"><Badge variant={isOverdue ? "destructive" : "outline"}>{isOverdue ? "Просрочено" : CRM_TASK_STATUSES[task.status]}</Badge>{isToday && <Badge variant="secondary">Сегодня</Badge>}</div></div>
      {!selectedId && <button type="button" className="text-left text-sm text-primary hover:underline" onClick={() => navigate("clients", task.client_id)}>{clientName(task.client_id)}</button>}
      {task.deal_id && <p className="text-sm text-muted-foreground">Сделка: {dealName(task.deal_id)}</p>}
      <p className="text-sm"><CalendarClock className="mr-1 inline h-4 w-4" />{dateLabel(task.due_date)} · {CRM_TASK_TYPES[task.type]}</p><p className="text-sm text-muted-foreground">Ответственный: {assigneeName(task.assigned_user_id)}</p>
      {task.description && <p className="whitespace-pre-wrap break-words text-sm">{task.description}</p>}
      {canWrite && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => openEditor({ kind: "task", record: task })}>Изменить задачу</Button>{task.status === "pending" && <Button size="sm" disabled={!!completingId || crm.saveTask.isPending} onClick={() => { void completeTask(task); }}>{completingId === task.id ? "Сохранение…" : "Выполнить"}</Button>}</div>}
    </article>;
  })}</div> : <EmptyState text="Задач пока нет." />;

  const renderHistory = (items: OrgCrmActivity[]) => items.length ? <ol className="space-y-3">{items.map(activity => <li key={activity.id} className="space-y-2 rounded-xl border bg-card p-4">
    <div className="flex flex-wrap justify-between gap-2 text-sm"><span className="font-medium">{CRM_ACTIVITY_TYPES[activity.activity_type as keyof typeof CRM_ACTIVITY_TYPES] || "Изменение в CRM"}</span><time dateTime={activity.created_at} className="text-muted-foreground">{dateLabel(activity.created_at)}</time></div>
    {!selectedId && <button type="button" className="text-left text-sm text-primary hover:underline" onClick={() => navigate("clients", activity.client_id)}>{clientName(activity.client_id)}</button>}
    {activity.deal_id && <p className="text-sm text-muted-foreground">Сделка: {dealName(activity.deal_id)}</p>}
    <p className="whitespace-pre-wrap break-words text-sm">{activity.description}</p>
    <p className="text-xs text-muted-foreground">Автор: {activity.actor_user_id ? data.assignees.find(person => person.user_id === activity.actor_user_id)?.full_name || "Сотрудник" : "Не указан"}</p>
  </li>)}</ol> : <EmptyState text="Записей в истории пока нет." />;

  return <section className="space-y-5">
    {header}
    {!canWrite && <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Доступен просмотр. Для изменения CRM требуется право на управление продажами.</p>}
    {truncated && <div role="status" className="space-y-1 rounded-lg border border-amber-400/40 bg-amber-500/5 p-3 text-sm"><p>Показана часть данных: до 1 000 клиентов, сделок и задач, до 500 последних записей истории. Поиск и счётчики ниже относятся к загруженным записям.</p><p>Клиенты: {data.clients.length} из {data.counts.clients} · Сделки: {data.deals.length} из {data.counts.deals} · Задачи: {data.tasks.length} из {data.counts.tasks} · История: {data.activities.length} из {data.counts.activities}</p></div>}
    <div className="flex flex-wrap gap-2" aria-label="Разделы CRM">{Object.entries(TABS).map(([value, label]) => <Button key={value} variant={tab === value ? "default" : "outline"} aria-pressed={tab === value} onClick={() => navigate(value as CrmTab)}>{label}</Button>)}</div>
    {feedback?.context === context && <p role={feedback.error ? "alert" : "status"} className={`rounded-lg border p-3 text-sm ${feedback.error ? "border-destructive/30 text-destructive" : "text-foreground"}`}>{feedback.text}</p>}

    {selectedId && !selectedClient ? <div role="alert" className="space-y-3 rounded-xl border p-5"><p>Клиент не найден среди доступных записей. Обновите CRM или вернитесь к списку.</p><Button variant="outline" onClick={() => navigate("clients", "")}>Все клиенты</Button></div> : <>
      {selectedClient && <div className="space-y-3 rounded-xl border bg-muted/30 p-5">
        <Button size="sm" variant="ghost" onClick={() => navigate("clients", "")}><ArrowLeft className="mr-2 h-4 w-4" />Все клиенты</Button>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-semibold break-words">{selectedClient.org_name}</h3>{selectedClient.inn && <p className="mt-1 text-sm text-muted-foreground">ИНН {selectedClient.inn}</p>}</div>{canWrite && <Button variant="outline" size="sm" onClick={() => openEditor({ kind: "client", record: selectedClient })}>Изменить клиента</Button>}</div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">{selectedClient.email && <span>Email: {selectedClient.email}</span>}{selectedClient.phone && <span>Телефон: {selectedClient.phone}</span>}{selectedClient.address && <span>Адрес: {selectedClient.address}</span>}</div>
        {selectedClient.notes && <p className="whitespace-pre-wrap break-words text-sm">{selectedClient.notes}</p>}
        {selectedClient.company_id && <div className="flex flex-wrap items-center gap-3 text-sm"><Badge variant="outline">Связан с компанией</Badge>{canOpenCompanies && <Link className="text-primary underline" to={`${companiesPath(selectedClient.company_id)}&companySection=crm`}>Карточка компании и хронология</Link>}</div>}
        {selectedClient.student_user_id && <div className="flex flex-wrap items-center gap-3 text-sm"><Badge variant="outline">Связан с учеником</Badge>{canOpenStudents && <Link className="text-primary underline" to={`${studentDetailsPath(selectedClient.student_user_id)}&studentSection=crm`}>Карточка ученика и хронология</Link>}</div>}
        {selectedClient.linked_at && !selectedClient.company_id && !selectedClient.student_user_id && <p className="text-sm text-muted-foreground">Исходная карточка удалена. Сохранена история клиента CRM.</p>}
      </div>}

      {tab === "clients" && !selectedClient && <>
        <div className="flex flex-wrap gap-3"><Input className="min-w-[200px] flex-1" aria-label="Поиск клиентов" placeholder="Название, ИНН, email или телефон" value={search} onChange={e => setSearch(e.target.value)} />{canWrite && <Button onClick={() => openEditor({ kind: "client" })}><Plus className="mr-2 h-4 w-4" />Добавить клиента</Button>}</div>
        {filteredClients.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filteredClients.map(client => <button key={client.id} type="button" className="space-y-2 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/40" onClick={() => navigate("clients", client.id)}><div className="flex items-start gap-2"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span className="font-medium break-words">{client.org_name}</span></div>{client.inn && <p className="text-sm text-muted-foreground">ИНН {client.inn}</p>}<p className="break-words text-sm text-muted-foreground">{[client.email, client.phone].filter(Boolean).join(" · ") || "Контакты не указаны"}</p></button>)}</div> : <EmptyState text={data.clients.length ? "По запросу ничего не найдено среди загруженных клиентов." : "Клиентов пока нет. Добавьте первого клиента, чтобы создать сделку и следующий шаг."} />}
      </>}
      {(tab === "deals" || (tab === "clients" && selectedClient)) && <div className="space-y-3"><SectionHeading title="Сделки" action={canWrite ? () => openEditor({ kind: "deal" }) : undefined} actionLabel="Добавить сделку" disabled={!data.clients.length} />{renderDeals(deals)}</div>}
      {(tab === "tasks" || (tab === "clients" && selectedClient)) && <div className="space-y-3"><SectionHeading title="Задачи" action={canWrite ? () => openEditor({ kind: "task" }) : undefined} actionLabel="Добавить задачу" disabled={!data.clients.length} /><p className="text-sm text-muted-foreground">Сегодня: {today} · Просрочено: {overdue}. Напоминания отображаются здесь по сроку задачи; автоматической отправки нет.</p>{renderTasks(tasks)}</div>}
      {(tab === "history" || (tab === "clients" && selectedClient)) && <div className="space-y-3"><SectionHeading title="История общения" action={canWrite ? () => openEditor({ kind: "activity" }) : undefined} actionLabel="Добавить запись" disabled={!data.clients.length} />{renderHistory(activities)}</div>}
      {tab !== "clients" && !data.clients.length && canWrite && <Button variant="outline" onClick={() => openEditor({ kind: "client" })}>Сначала добавить клиента</Button>}
    </>}
    {canWrite && editor?.context === context && <OrgCrmEditor key={context} editor={editor.value} snapshot={data} selectedClientId={selectedClient?.id} onClose={() => setEditor(null)}
      saveClient={crm.saveClient.mutateAsync} saveDeal={crm.saveDeal.mutateAsync} saveTask={crm.saveTask.mutateAsync} addActivity={crm.addActivity.mutateAsync}
      onSaved={clientId => { setEditor(null); const savedContext = editor.value.kind === "client" && !editor.value.record ? navigate("clients", clientId) : context; setFeedback({ context: savedContext, text: "Изменения сохранены." }); }} />}
  </section>;
}

function EmptyState({ text }: { text: string }) { return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{text}</p>; }
function SectionHeading({ title, action, actionLabel, disabled }: { title: string; action?: () => void; actionLabel: string; disabled: boolean }) {
  return <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">{title}</h3>{action && <Button size="sm" disabled={disabled} onClick={action}><Plus className="mr-2 h-4 w-4" />{actionLabel}</Button>}</div>;
}
