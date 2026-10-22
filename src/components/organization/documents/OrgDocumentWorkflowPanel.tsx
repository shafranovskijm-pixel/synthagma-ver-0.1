import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReviewableDocument, type ReviewComment } from "@/components/signing/ReviewableDocument";
import { useOrgDocumentWorkflow } from "@/hooks/useOrgDocumentWorkflow";
import { acceptedContentChange, canApproveWorkflow, normalizeWorkflowLinks, workflowLabels, type WorkflowLink, type WorkflowComment } from "@/lib/orgDocumentWorkflow";
import { loadOrgDocumentReviewContent } from "@/lib/orgDocumentReviewContent";
import { openPrivateFile, downloadPrivateFile } from "@/utils/storageHelpers";
import { toast } from "sonner";
import type { OrgDocumentVersion } from "@/hooks/useOrgDocumentVersions";
import type { ScopedOrgDocumentTransport } from "@/lib/programFiles";

interface Props { organizationId: string; documentId: string; currentVersionId?: string | null; versions?: OrgDocumentVersion[]; onOpenFiles?: () => void; transport?: ScopedOrgDocumentTransport }
const fileLabels: Record<string, string> = { none: "Нет файла", fileless: "Нет файла", active: "Файл актуален", expiring: "Срок файла истекает", expired: "Срок файла истёк", archived: "В архиве", deleted: "В корзине", unconfirmed: "Неизменность файла не подтверждена" };
const reviewComment = (c: WorkflowComment): ReviewComment => ({ id: c.id, author_name: c.author_name, author_role: c.author_role,
  quoted_text: c.quoted_text, comment_text: c.comment_text, position_anchor: c.position_anchor, resolved: c.resolved, created_at: c.created_at });
export function OrgDocumentWorkflowPanel({ organizationId, documentId, currentVersionId, versions = [], onOpenFiles, transport }: Props) {
  const h = useOrgDocumentWorkflow(organizationId, documentId, currentVersionId, transport);
  const sourceFile = async (path: string, name?: string) => transport
    ? downloadPrivateFile('org-documents', path, name, { assertCurrent: transport.assertCurrent, signUrl: transport.signUrl })
    : openPrivateFile('org-documents', path);
  const scopeCurrent = () => { try { transport?.assertCurrent(); return true; } catch { return false; } };
  const sourceError = (message: string) => { if (scopeCurrent()) toast.error(message); };
  const [responsible, setResponsible] = useState(""), [reviewer, setReviewer] = useState("");
  const [links, setLinks] = useState<WorkflowLink[]>([]);
  const [comment, setComment] = useState(""), [note, setNote] = useState(""), [number, setNumber] = useState(""), [date, setDate] = useState("");
  const [selectedCycle, setSelectedCycle] = useState("current");
  const [showContent, setShowContent] = useState(false);
  const [content, setContent] = useState<{ key: string; html: string | null; loading: boolean; error: string | null } | null>(null);
  const d = h.data, w = d?.workflow;
  const view = selectedCycle === "current" ? w : d?.cycles.find(c => c.id === selectedCycle);
  const history = selectedCycle !== "current";
  const viewedVersion = versions.find(v => v.id === view?.version_id && v.document_id === documentId && v.organization_id === organizationId);
  const fileKey = `${documentId}:${d?.document.current_version_id ?? ""}`;
  useEffect(() => {
    setResponsible(w?.responsible_user_id ?? ""); setReviewer(w?.reviewer_user_id ?? ""); setLinks(w?.links ?? []);
    setNumber(""); setDate(""); setNote(""); setComment("");
  }, [w?.id, w?.revision, documentId]);
  useEffect(() => { setSelectedCycle("current"); setShowContent(false); setContent(null); }, [fileKey]);
  useEffect(() => {
    if (!showContent || !d?.document.file_url || history || !scopeCurrent()) return;
    const abort = new AbortController();
    setContent({ key: fileKey, html: null, loading: true, error: null });
    void loadOrgDocumentReviewContent(d.document.file_path || d.document.file_url, d.document.file_name || "", abort.signal)
      .then(html => { if (!abort.signal.aborted && scopeCurrent()) setContent({ key: fileKey, html, loading: false, error: null }); })
      .catch(error => { if (!abort.signal.aborted && scopeCurrent()) setContent({ key: fileKey, html: null, loading: false, error: error.message || "Не удалось открыть содержимое версии" }); });
    return () => abort.abort();
  }, [showContent, fileKey, d?.document.file_url, history, transport]);
  const disabled = h.loading || h.saving || h.conflict || h.denied;
  const editable = !history && !!d?.capabilities.can_configure && (!w || ["draft", "changes_requested"].includes(w.state));
  const draftDirty = !!w && (responsible !== w.responsible_user_id || reviewer !== w.reviewer_user_id || JSON.stringify(normalizeWorkflowLinks(links)) !== JSON.stringify(normalizeWorkflowLinks(w.links)));
  const nameOf = (id: string) => h.candidates?.actors.find(a => a.user_id === id)?.display_name || "Сотрудник, указанный в истории";
  const submit = async (action: "submit" | "request_changes" | "approve" | "cancel") => {
    if (await h.transition(action, note, number, date)) toast.success(action === "approve" ? "Внутреннее утверждение сохранено для этой версии" : "Согласование обновлено");
  };
  const toggleLink = (link: WorkflowLink, checked: boolean) => setLinks(current => checked ? [...current.filter(x => x.kind !== link.kind || x.id !== link.id), link] : current.filter(x => x.kind !== link.kind || x.id !== link.id));
  const relationGroups = h.candidates ? [
    { label: "Курсы", kind: "course" as const, rows: h.candidates.courses.map(x => ({ ...x, name: x.title, version_id: null })) },
    { label: "Группы", kind: "group" as const, rows: h.candidates.groups.map(x => ({ ...x, version_id: null })) },
    { label: "Документы центра", kind: "document" as const, rows: h.candidates.related_documents.filter(x => x.id !== documentId).map(x => ({ ...x, version_id: x.current_version_id })) },
  ] : [];

  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Внутреннее согласование относится к конкретной версии файла. Оно не создаёт электронную подпись и не подтверждает юридическую готовность документа.</p>
    {h.error && <div role="alert" className="rounded-lg border p-3 space-y-2 text-sm"><p className="flex items-start gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{h.error}</p><Button variant="outline" size="sm" disabled={h.loading || h.saving} onClick={() => void h.reload()}>Обновить согласование</Button></div>}
    {h.loading && <div role="status" className="flex items-center gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" />Загрузка согласования…</div>}
    {d && <>
      <div className="flex flex-wrap gap-2"><Badge variant="outline">{fileLabels[d.document.file_state]}</Badge><Badge variant="secondary">{w ? workflowLabels[w.state] : "Нет согласования текущей версии"}</Badge></div>
      {d.document.file_state === "unconfirmed" && <div role="status" className="rounded-lg border p-3 space-y-2 text-sm">
        <p>Для внутреннего согласования нужна версия с зафиксированным файлом. Неизменность прежнего файла пока не подтверждена; его просмотр и история доступны. Загрузите новую версию на вкладке «Файлы и версии».</p>
        <div className="flex flex-wrap gap-2">
          {d.document.file_url && <Button size="sm" variant="outline" onClick={async () => { if (!await sourceFile(d.document.file_path || d.document.file_url!, d.document.file_name || undefined)) sourceError("Не удалось открыть прежний файл"); }}>{transport ? 'Скачать прежний файл' : 'Открыть прежний файл'}</Button>}
          {onOpenFiles && <Button size="sm" variant="outline" className="max-w-full h-auto min-h-9 whitespace-normal" onClick={onOpenFiles}>Перейти к файлам и версиям</Button>}
        </div>
      </div>}
      {!d.document.current_version_id && <p className="text-sm text-muted-foreground">Сначала загрузите версию файла на вкладке «Файлы и версии». Прежние даты и фамилии не считаются записью согласования.</p>}
      {d.cycles.length > 0 && <div className="space-y-2"><Label htmlFor="review-cycle">Текущее согласование и история</Label><Select value={selectedCycle} onValueChange={setSelectedCycle}><SelectTrigger id="review-cycle"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="current">Текущая версия</SelectItem>{d.cycles.filter(c => c.id !== w?.id).map((c, i) => <SelectItem key={c.id} value={c.id}>{workflowLabels[c.state]} · запись {i + 1}{c.approval ? ` · ${c.approval.number} от ${c.approval.date}` : ""}</SelectItem>)}</SelectContent></Select></div>}
      {history && <p className="text-sm text-muted-foreground">Историческое согласование другой версии. Его решение не переносится на текущий файл.</p>}
      {editable && <div className="rounded-lg border p-3 space-y-3">
        {h.candidates?.actors.length === 0 && <p role="status" className="text-sm text-muted-foreground">Нет действующих сотрудников с полномочиями для этого согласования. Сначала проверьте владельца и права сотрудников организации; затем обновите согласование. Файлы и история остаются доступны.</p>}
        <div className="space-y-2"><Label htmlFor="document-responsible">Ответственный</Label><Select value={responsible} onValueChange={setResponsible} disabled={disabled}><SelectTrigger id="document-responsible"><SelectValue placeholder="Выберите сотрудника" /></SelectTrigger><SelectContent>{h.candidates?.actors.map(a => <SelectItem key={a.user_id} value={a.user_id}>{a.display_name}{a.kind === "owner" ? " · владелец" : ""}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="document-reviewer">Проверяющий</Label><Select value={reviewer} onValueChange={setReviewer} disabled={disabled}><SelectTrigger id="document-reviewer"><SelectValue placeholder="Выберите сотрудника" /></SelectTrigger><SelectContent>{h.candidates?.actors.map(a => <SelectItem key={a.user_id} value={a.user_id}>{a.display_name}{a.kind === "owner" ? " · владелец" : ""}</SelectItem>)}</SelectContent></Select></div>
        <details><summary className="cursor-pointer text-sm">Связанные курсы, группы и документы</summary><div className="max-h-52 overflow-auto space-y-3 pt-3">{relationGroups.map(group => <div key={group.kind} className="space-y-2"><p className="text-xs font-medium">{group.label}</p>{group.rows.length ? group.rows.map(row => <label key={row.id} className="flex items-start gap-2 text-sm"><Checkbox disabled={disabled} checked={links.some(x => x.kind === group.kind && x.id === row.id)} onCheckedChange={value => toggleLink({ kind: group.kind, id: row.id, version_id: row.version_id }, value === true)} />{row.name}</label>) : <p className="text-xs text-muted-foreground">Нет доступных записей</p>}</div>)}</div></details>
        <Button size="sm" className="max-w-full h-auto min-h-9 whitespace-normal" disabled={disabled || !responsible || !reviewer || !d.document.current_version_id || !h.candidates} onClick={async () => { if (await h.saveDraft(responsible, reviewer, links)) toast.success("Участники и связи согласования сохранены"); }}>Сохранить участников и связи</Button>
      </div>}
      {view && <div className="space-y-3">
        {viewedVersion && <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">Версия v{viewedVersion.version_number}</Badge><span className="text-xs text-muted-foreground">{viewedVersion.file_name || "Файл этой версии"}</span>{history && viewedVersion.file_url && <Button size="sm" variant="outline" onClick={async () => { if (!await sourceFile(viewedVersion.file_path || viewedVersion.file_url!, viewedVersion.file_name || undefined)) sourceError("Не удалось открыть историческую версию"); }}>{transport ? 'Скачать файл этой версии' : 'Открыть файл этой версии'}</Button>}</div>}
        <p className="text-sm">Ответственный: {view.responsible_name || nameOf(view.responsible_user_id)}. Проверяющий: {view.reviewer_name || nameOf(view.reviewer_user_id)}.</p>
        {view.approval && <div className="rounded-lg border p-3 text-sm"><p>Внутреннее утверждение № {view.approval.number} от {view.approval.date}</p><p className="text-muted-foreground">Внесено: {view.approval.recorded_at}. Решение относится только к версии этого согласования.</p></div>}
        {(view.requires_new_version || view.comments.some(acceptedContentChange)) && <p role="status" className="text-sm text-muted-foreground">Приняты изменения текста. Внесите их в файл, загрузите новую версию и начните новое согласование. Текущий файл автоматически не изменён.</p>}
        {!history && d.document.file_url && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setShowContent(v => !v)}>{showContent ? "Скрыть содержимое" : "Показать содержимое для проверки"}</Button><Button size="sm" variant="outline" onClick={async () => { if (!await sourceFile(d.document.file_path || d.document.file_url!, d.document.file_name || undefined)) sourceError("Не удалось открыть исходный файл"); }}>{transport ? 'Скачать исходный файл' : 'Открыть исходный файл'}</Button></div>}
        {!history && showContent && content?.key === fileKey && <>
          {content.loading && <p className="text-sm">Чтение файла…</p>}{content.error && <p role="alert" className="text-sm">{content.error}</p>}
          {!content.loading && !content.error && content.html === null && <p className="text-sm text-muted-foreground">Для этого формата откройте исходный файл. Замечания можно оставить ниже.</p>}
          {content.html && <><p className="text-xs text-muted-foreground">Текстовое представление для замечаний. Перед утверждением проверьте исходный файл.</p><ReviewableDocument proposalsOnly documentHtml={content.html} comments={view.comments.map(reviewComment)} authorName="Сотрудник центра" canComment={!disabled && d.capabilities.can_comment} onAddComment={async p => { if (!await h.addComment(p.commentText, p.quotedText || null, p.positionAnchor)) throw new Error("Замечание не сохранено"); }} /></>}
        </>}
        <div className="space-y-2"><p className="text-sm font-medium">Замечания к версии</p>{view.comments.length === 0 && <p className="text-sm text-muted-foreground">Замечаний пока нет.</p>}{view.comments.map(c => <div key={c.id} className="rounded-lg border p-3 space-y-2 text-sm"><p className="font-medium">{c.author_name}</p>{c.quoted_text && <blockquote className="border-l-2 pl-3 text-muted-foreground">{c.quoted_text}</blockquote>}<p className="whitespace-pre-wrap">{c.comment_text}</p><p className="text-xs text-muted-foreground">{c.resolution_status === "accepted" ? "Учтено" : c.resolution_status === "declined" ? "Отклонено" : "Требует решения"}{c.org_reply ? ` · ${c.org_reply}` : ""}</p>{!history && !c.resolved && d.capabilities.can_decide && ["in_review", "changes_requested"].includes(view.state) && <div className="flex gap-2"><Button variant="outline" size="sm" disabled={disabled} onClick={() => void h.resolveComment(c.id, "accepted")}>Учтено</Button><Button variant="ghost" size="sm" disabled={disabled} onClick={() => void h.resolveComment(c.id, "declined")}>Отклонить</Button></div>}</div>)}</div>
        {!history && d.capabilities.can_comment && <div className="space-y-2"><Label htmlFor="review-comment">Общее замечание</Label><Textarea id="review-comment" maxLength={4000} value={comment} onChange={e => setComment(e.target.value)} disabled={disabled} /><Button size="sm" variant="outline" disabled={disabled || !comment.trim()} onClick={async () => { if (await h.addComment(comment)) setComment(""); }}>Добавить замечание</Button></div>}
        {!history && <div className="space-y-3 border-t pt-3">
          {d.capabilities.can_submit && ["draft", "changes_requested"].includes(view.state) && <><Button disabled={disabled || draftDirty || view.requires_new_version} onClick={() => void submit("submit")}>Передать на проверку</Button>{draftDirty && <p className="text-xs text-muted-foreground">Сначала сохраните изменённых участников и связи.</p>}</>}
          {(d.capabilities.can_request_changes || d.capabilities.can_decide || d.capabilities.can_cancel) && <div className="space-y-2"><Label htmlFor="review-note">Комментарий к решению</Label><Textarea id="review-note" value={note} maxLength={4000} onChange={e => setNote(e.target.value)} disabled={disabled} /></div>}
          {d.capabilities.can_request_changes && view.state === "in_review" && <Button variant="outline" disabled={disabled || !note.trim()} onClick={() => void submit("request_changes")}>Вернуть на доработку</Button>}
          {d.capabilities.can_decide && view.state === "in_review" && <div className="rounded-lg border p-3 space-y-3"><p className="text-sm">Проверьте исходный файл и решения по всем замечаниям. Номер и дата вводятся по документам центра.</p><div className="space-y-2"><Label htmlFor="approval-number">Номер утверждения</Label><Input id="approval-number" value={number} maxLength={200} onChange={e => setNumber(e.target.value)} disabled={disabled} /></div><div className="space-y-2"><Label htmlFor="approval-date">Дата утверждения</Label><Input id="approval-date" type="date" value={date} onChange={e => setDate(e.target.value)} disabled={disabled} /></div><Button className="max-w-full h-auto min-h-9 whitespace-normal" disabled={disabled || !canApproveWorkflow(d) || !number.trim() || !date} onClick={() => void submit("approve")}>Утвердить эту версию внутри центра</Button>{!canApproveWorkflow(d) && <p className="text-xs text-muted-foreground">До утверждения нужно решить все замечания. Принятые изменения текста требуют новой версии файла.</p>}</div>}
          {d.capabilities.can_cancel && <Button variant="ghost" disabled={disabled} onClick={() => void submit("cancel")}>Отменить согласование</Button>}
        </div>}
        {view.events.length > 0 && <details><summary className="text-sm cursor-pointer">События согласования</summary><div className="space-y-2 pt-2 text-xs text-muted-foreground">{view.events.map(e => <p key={e.id}>{e.created_at} · {({ create: "Создано", configure: "Обновлены участники", submit: "Передано на проверку", request_changes: "Возвращено на доработку", approve: "Внесено внутреннее утверждение", cancel: "Отменено", comment: "Добавлено замечание", resolve_comment: "Решение по замечанию" } as Record<string, string>)[e.action] || "Событие согласования"}{e.note ? ` · ${e.note}` : ""}</p>)}</div></details>}
      </div>}
    </>}
  </div>;
}
