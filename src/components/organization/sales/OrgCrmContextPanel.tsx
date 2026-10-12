import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOrgCrm } from "@/hooks/useOrgCrm";
import { useOrgCrmContext } from "@/hooks/useOrgCrmContext";
import { companiesPath, studentDetailsPath } from "@/lib/groups/groupContext";
import { organizationTabPath } from "@/lib/organization/workspaceNavigation";
import { CRM_STAGES, CRM_TASK_STATUSES, OrgCrmEditor, crmErrorMessage, type OrgCrmEditorState } from "./OrgCrmEditor";
import { OrgCrmTimeline, type CrmTimelineSource } from "./OrgCrmTimeline";

interface Props {
  organizationId: string;
  entityType: "company" | "student";
  entityId: string;
  entityName: string;
  canWrite: boolean;
  canOpenDocuments?: boolean;
}

export function OrgCrmContextPanel(props: Props) {
  return <ContextPanel key={`${props.organizationId}:${props.entityType}:${props.entityId}`} {...props} />;
}

function ContextPanel({ organizationId, entityType, entityId, entityName, canWrite, canOpenDocuments = false }: Props) {
  const context = useOrgCrmContext(organizationId, entityType, entityId);
  const [linkOpen, setLinkOpen] = useState(false);
  const [editor, setEditor] = useState<OrgCrmEditorState | null>(null);
  const [linking, setLinking] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const active = useRef(true);
  const busy = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  const linkClient = async (clientId: string | null) => {
    if (!canWrite || busy.current) return;
    busy.current = true; setLinking(true); setFeedback(null);
    try {
      await context.linkClient.mutateAsync(clientId);
      if (active.current) { setLinkOpen(false); setFeedback({ text: "Связь с CRM сохранена.", error: false }); }
    } catch (error) {
      if (active.current) setFeedback({ text: crmErrorMessage(error), error: true });
    } finally { if (active.current) { busy.current = false; setLinking(false); } }
  };

  if (context.isLoading) return <p role="status" className="rounded-xl border p-6">Загрузка CRM карточки…</p>;
  if (context.error || !context.data) return <div role="alert" className="space-y-3 rounded-xl border p-6"><p>Не удалось загрузить CRM этой карточки.</p><p className="text-sm text-muted-foreground">Проверьте подключение и доступ к записи.</p><Button variant="outline" onClick={() => { void context.refetch(); }}>Повторить загрузку CRM</Button></div>;

  const data = context.data;
  const client = data.client;
  const sourceLinks: Partial<Record<CrmTimelineSource, string>> = {
    ...(client ? { crm: `${organizationTabPath("sales")}&crmClient=${encodeURIComponent(client.id)}&crmTab=history` } : {}),
    ...(entityType === "student" ? { learning: `${studentDetailsPath(entityId)}&studentSection=courses`, activity: `${studentDetailsPath(entityId)}&studentSection=activity` } : {}),
    ...(canOpenDocuments ? { documents: entityType === "student" ? `${studentDetailsPath(entityId)}&studentSection=documents` : `${companiesPath(entityId)}&companySection=documents` } : {}),
  };
  const scopeLabel = entityType === "student" ? "CRM ученика" : "CRM компании";
  const name = data.subject.name || entityName;
  const snapshot = data.crm;
  const isPartial = Object.values(snapshot.truncated).some(Boolean);

  return <section className="space-y-5" aria-label={scopeLabel}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-semibold">{scopeLabel} <Badge variant="secondary">Beta</Badge></h3><p className="mt-1 text-sm text-muted-foreground">{name}</p></div><Button size="sm" variant="outline" onClick={() => { void context.refetch(); }}>Обновить CRM карточки</Button></div>
    {!canWrite && <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Доступен просмотр. Для изменения CRM требуется право на управление продажами.</p>}
    {feedback && <p role={feedback.error ? "alert" : "status"} className={`rounded-lg border p-3 text-sm ${feedback.error ? "border-destructive/30 text-destructive" : ""}`}>{feedback.text}</p>}

    {!client ? <div className="space-y-3 rounded-xl border border-dashed p-5">
      <p>Эта {entityType === "student" ? "карточка ученика ещё не связана" : "компания ещё не связана"} с клиентом CRM.</p>
      {canWrite ? <><p className="text-sm text-muted-foreground">Создайте клиента CRM на основе этой карточки или выберите уже существующего. Связь используется для сделок, задач и заметок.</p><div className="flex flex-wrap gap-2"><Button disabled={linking} onClick={() => { void linkClient(null); }}>{linking ? "Сохранение связи…" : "Создать связанного клиента CRM"}</Button><Button variant="outline" disabled={linking} onClick={() => { setFeedback(null); setLinkOpen(true); }}>Связать существующего клиента</Button></div></> : <p className="text-sm text-muted-foreground">Сотрудник с правом управления продажами может создать или выбрать клиента CRM.</p>}
    </div> : <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-4"><div><p className="text-xs text-muted-foreground">Связанный клиент CRM</p><p className="font-medium">{client.org_name}</p></div><Button asChild size="sm" variant="outline"><Link to={`${organizationTabPath("sales")}&crmClient=${encodeURIComponent(client.id)}`}>Открыть клиента в CRM</Link></Button></div>
      {isPartial && <p role="status" className="rounded-lg border border-amber-400/40 p-3 text-sm">Показана часть записей CRM этого клиента. Сделки: {snapshot.deals.length} из {snapshot.counts.deals}; задачи: {snapshot.tasks.length} из {snapshot.counts.tasks}; заметки: {snapshot.activities.length} из {snapshot.counts.activities}.</p>}
      <div className="space-y-3"><PanelHeading title="Сделки клиента" action={canWrite ? () => setEditor({ kind: "deal" }) : undefined} label="Добавить сделку" />
        {snapshot.deals.length ? <div className="grid gap-3 sm:grid-cols-2">{snapshot.deals.map(deal => <article key={deal.id} className="space-y-2 rounded-xl border p-4" aria-label={`Сделка: ${deal.title}`}><p className="font-medium">{deal.title}</p><div className="flex flex-wrap justify-between gap-2"><Badge variant="outline">{CRM_STAGES[deal.stage]}</Badge><span>{Number(deal.amount).toLocaleString("ru-RU")} ₽</span></div>{canWrite && <Button size="sm" variant="outline" onClick={() => setEditor({ kind: "deal", record: deal })}>Изменить сделку</Button>}</article>)}</div> : <p className="text-sm text-muted-foreground">Сделок этого клиента пока нет.</p>}
      </div>
      <div className="space-y-3"><PanelHeading title="Задачи клиента" action={canWrite ? () => setEditor({ kind: "task" }) : undefined} label="Добавить задачу" /><p className="text-xs text-muted-foreground">Сроки отображаются в CRM; автоматические уведомления не отправляются.</p>
        {snapshot.tasks.length ? <div className="space-y-3">{snapshot.tasks.map(task => <article key={task.id} className="space-y-2 rounded-xl border p-4" aria-label={`Задача: ${task.title}`}><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{task.title}</p><Badge variant="outline">{CRM_TASK_STATUSES[task.status]}</Badge></div><p className="text-sm text-muted-foreground">Срок: {new Date(task.due_date).toLocaleString("ru-RU")}{task.status === "pending" && new Date(task.due_date).getTime() < Date.now() ? " · Просрочено" : ""}</p>{task.deal_id && <p className="text-sm">Сделка: {snapshot.deals.find(deal => deal.id === task.deal_id)?.title || "Не загружена"}</p>}{canWrite && <Button size="sm" variant="outline" onClick={() => setEditor({ kind: "task", record: task })}>Изменить задачу</Button>}</article>)}</div> : <p className="text-sm text-muted-foreground">Задач этого клиента пока нет.</p>}
      </div>
      {canWrite && <Button variant="outline" onClick={() => setEditor({ kind: "activity" })}>Добавить заметку / общение</Button>}
    </>}

    {entityType === "student" && data.related_company && <aside className="space-y-2 rounded-xl border bg-muted/30 p-4" aria-label="CRM компании ученика"><h4 className="font-medium">CRM компании ученика</h4><p className="text-sm">{data.related_company.name}</p><p className="text-xs text-muted-foreground">Сделки и история компании доступны в её отдельной карточке.</p><Button asChild size="sm" variant="outline"><Link to={`${companiesPath(data.related_company.id)}&companySection=crm`}>Открыть CRM компании</Link></Button></aside>}
    <OrgCrmTimeline key={`${entityType}:${entityId}`} timeline={data.timeline} sourceLinks={sourceLinks} onRetry={() => { void context.refetch(); }} />

    {canWrite && linkOpen && !client && <ExistingClientPicker organizationId={organizationId} busy={linking} error={feedback?.error ? feedback.text : null} onClose={() => { if (!linking) setLinkOpen(false); }} onSelect={clientId => { void linkClient(clientId); }} />}
    {canWrite && client && editor && <OrgCrmEditor editor={editor} snapshot={snapshot} selectedClientId={client.id} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); setFeedback({ text: "Изменения CRM сохранены.", error: false }); }}
      saveClient={async () => { throw new Error("Измените данные клиента в основной CRM."); }} saveDeal={context.saveDeal.mutateAsync} saveTask={context.saveTask.mutateAsync} addActivity={context.addActivity.mutateAsync} />}
  </section>;
}

function PanelHeading({ title, action, label }: { title: string; action?: () => void; label: string }) {
  return <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">{title}</h4>{action && <Button size="sm" onClick={action}>{label}</Button>}</div>;
}

/** Loaded only after an explicit linking action; merely opening a card performs no writes. */
function ExistingClientPicker({ organizationId, busy, error, onClose, onSelect }: { organizationId: string; busy: boolean; error: string | null; onClose: () => void; onSelect: (clientId: string) => void }) {
  const crm = useOrgCrm(organizationId);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const candidates = (crm.data?.clients || []).filter(client => !client.company_id && !client.student_user_id && !client.linked_at);
  const filtered = candidates.filter(client => `${client.org_name} ${client.inn || ""} ${client.email || ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selectionValid = candidates.some(client => client.id === selected);
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Связать существующего клиента CRM</DialogTitle><DialogDescription>Выберите клиента без связи с другой компанией или учеником. Новая запись клиента при этом не создаётся.</DialogDescription></DialogHeader>
    {crm.isLoading ? <p role="status">Загрузка клиентов…</p> : crm.error || !crm.data ? <div role="alert" className="space-y-3"><p>Не удалось загрузить клиентов для связи.</p><Button variant="outline" onClick={() => { void crm.refetch(); }}>Повторить загрузку клиентов</Button></div> : <>
      {crm.data.truncated.clients && <p role="status" className="text-sm text-muted-foreground">Загружено {crm.data.clients.length} из {crm.data.counts.clients} клиентов. Поиск выполняется среди загруженных записей.</p>}
      <div className="space-y-2"><Label htmlFor="crm-link-search">Поиск клиента для связи</Label><Input id="crm-link-search" value={query} disabled={busy} onChange={event => setQuery(event.target.value)} /></div>
      <div className="max-h-72 space-y-2 overflow-y-auto" role="radiogroup" aria-label="Существующие клиенты CRM">{filtered.length ? filtered.map(client => <label key={client.id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"><input type="radio" name="crm-existing-client" value={client.id} checked={selected === client.id} disabled={busy} onChange={() => setSelected(client.id)} /><span><span className="block font-medium">{client.org_name}</span>{client.inn && <span className="block text-xs text-muted-foreground">ИНН {client.inn}</span>}</span></label>) : <p className="text-sm text-muted-foreground">Подходящих несвязанных клиентов среди загруженных записей нет.</p>}</div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>Отмена</Button><Button disabled={busy || !selectionValid} onClick={() => onSelect(selected)}>{busy ? "Сохранение связи…" : "Связать выбранного клиента"}</Button></div>
    </>}
  </DialogContent></Dialog>;
}
