import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useNormativeGovernance } from "@/hooks/useNormativeGovernance";
import { DESIGNATED_NORMATIVE_OWNER, type ImpactCentresPage, type NormativeCommand, type NormativeEvent } from "@/lib/normativeGovernance/model";
import { NormativeTemplateAssociationsPanel } from "./NormativeTemplateAssociationsPanel";
const labels: Record<NormativeEvent["kind"], string> = { owner_assigned: "Назначение ответственного", draft_registered: "Снимок редакции", review_due_set: "Срок пересмотра", source_checked: "Проверка источника", legal_reviewed: "Правовая проверка", published: "Публикация в журнале", runtime_verified: "Техническая проверка", centre_accepted: "Приёмка центром" };
export function NormativeGovernancePanel({ organizationId, canWrite, profileRevision }: { organizationId: string; canWrite: boolean; profileRevision: number | null }) {
  const governance = useNormativeGovernance(organizationId, true, canWrite, profileRevision);
  const data = governance.data, selected = data?.manifests.find(entry => entry.id === data.selectedManifestId);
  const [reason, setReason] = useState(""), [dueOn, setDueOn] = useState(""), [sourceId, setSourceId] = useState(""), [acknowledged, setAcknowledged] = useState(false);
  const [centres, setCentres] = useState<ImpactCentresPage | null>(null), [centresLoading, setCentresLoading] = useState(false), [centresError, setCentresError] = useState(false);
  const viewEpoch = useRef(0);
  useLayoutEffect(() => { ++viewEpoch.current; setReason(""); setDueOn(""); setSourceId(""); setAcknowledged(false); setCentres(null); setCentresError(false); setCentresLoading(false); return () => { ++viewEpoch.current; }; }, [organizationId, selected?.id, profileRevision]);
  const source = selected?.manifest.sources.find(item => item.id === sourceId);
  const mutable = canWrite && !!data && !governance.loading && !governance.saving && !governance.conflict && !governance.uncertain;
  const deliberate = mutable && acknowledged && !!reason.trim();
  const record = async (command: NormativeCommand) => { if (await governance.record(command)) { setReason(""); setAcknowledged(false); } };
  const loadCentres = async (before: string | null = null) => {
    const run = viewEpoch.current; setCentresLoading(true); setCentresError(false); const page = await governance.loadImpactCentres(before);
    if (run !== viewEpoch.current) return;
    setCentresLoading(false); if (!page) { setCentresError(true); return; }
    setCentres(previous => before && previous ? { ...page, items: [...previous.items, ...page.items] } : page);
  };
  return <details className="bg-card rounded-2xl border border-border p-4 space-y-3" aria-label="Нормативный каталог и журнал пересмотра"><summary className="cursor-pointer font-medium">Нормативный каталог и журнал пересмотра</summary>
    <p className="text-sm text-muted-foreground">Ответственный: Максим Шафрановский. Назначение не утверждает правовые тексты. Проверка источника, правовая проверка, публикация, техническая проверка и приёмка центром фиксируются отдельно.</p>
    {governance.loading && <p role="status" className="text-sm">Загрузка журнала…</p>}
    {governance.error && <p role="alert" className="text-sm text-destructive">{governance.error}</p>}
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={governance.saving} onClick={() => void governance.reload()}>Обновить журнал</Button>
      {governance.uncertain && <Button size="sm" variant="outline" disabled={governance.saving} onClick={() => void governance.retry()}>Повторить прежний запрос</Button>}</div>
    {data && <>
      {!data.projection.ownerAssigned && <p className="text-sm text-amber-700">Назначение пользователя ещё не зафиксировано в рабочем журнале.</p>}
      {data.canManage && <div className="flex flex-wrap gap-2">
        {!data.projection.ownerAssigned && <Button size="sm" variant="outline" disabled={!mutable} onClick={() => void record({ kind: "owner_assigned", manifestId: null, body: { ownerId: DESIGNATED_NORMATIVE_OWNER, designation: "human_2026_10_22" } })}>Зафиксировать назначение ответственного</Button>}
        <Button size="sm" variant="outline" disabled={!mutable || !data.projection.ownerAssigned} onClick={() => void governance.registerCurrent()}>Зафиксировать текущий встроенный каталог</Button>
      </div>}
      <p className="text-xs text-muted-foreground">Снимок содержит метаданные источников и доказательства. Его хеш не является хешем полного действующего текста закона. Новая запись не изменяет старые решения центра и не включает новую версию правил автоматически.</p>
      {data.manifests.length > 0 && <div className="space-y-1"><Label htmlFor="normative-manifest">Редакция журнала</Label><select id="normative-manifest" className="w-full rounded-md border bg-background p-2 text-sm" disabled={governance.saving} value={selected?.id ?? ""} onChange={event => void governance.reload(event.target.value)}>{data.manifests.map(entry => <option key={entry.id} value={entry.id}>Редакция {entry.revision} · {entry.manifest.catalogVersion} · {entry.manifest.sha256.slice(0, 12)}</option>)}</select></div>}
      {selected && <>
        <p className="text-xs break-all text-muted-foreground">Хеш снимка: {selected.manifest.sha256}</p>
        <div className="flex flex-wrap gap-2"><Badge variant="outline">Источники: {data.projection.checkedSourceIds.length}/{selected.manifest.sources.length}</Badge><Badge variant="outline">Правовая проверка: {data.projection.legalReviewed ? "зафиксирована" : "не зафиксирована"}</Badge><Badge variant="outline">Публикация: {data.projection.published ? "зафиксирована" : "не зафиксирована"}</Badge><Badge variant="outline">Техническая проверка: {data.projection.runtimeVerified ? "есть отдельный отчёт" : "не подтверждена"}</Badge><Badge variant="outline">Центр: {data.projection.centreAccepted ? "принял для текущего профиля" : "приёмка не подтверждена"}</Badge></div>
        <p className="text-sm">{data.projection.reviewDueOn ? "Пересмотр до: " + data.projection.reviewDueOn + (data.projection.reviewDueOn < data.serverAsOf.slice(0, 10) ? " · срок наступил" : "") : "Срок пересмотра ещё не назначен ответственным."}</p>
        <div className="rounded-xl border p-3 space-y-2 text-sm"><p>Изменённые источники: {data.impact.changedSourceIds.join(", ") || "нет изменений относительно предыдущего снимка"}.</p><p>Задачи для повторной проверки: {data.impact.affectedRequirementIds.join(", ") || "по имеющимся связям не определены"}.</p><p>Прежних решений этого центра: {data.impact.affectedDecisions.length}. Документов по явно связанным типам: {data.impact.documentCount}.</p><p className="text-muted-foreground">Ниже доступны явные связи с точными версиями шаблонов. Несвязанные версии и настройки без версий остаются отдельным неизвестным покрытием; отсутствие записи не подтверждает отсутствие влияния. Прежние решения и документы сохраняются.</p>
          {data.canManage && <Button size="sm" variant="outline" disabled={centresLoading || governance.saving} onClick={() => void loadCentres()}>Показать доступные центры для проверки влияния</Button>}
          {centresLoading && <p role="status">Загрузка доступных центров…</p>}{centresError && <p role="alert">Не удалось подтвердить список центров.</p>}
          {centres && <><ul className="space-y-1">{centres.items.map(item => <li key={item.organizationId}>{item.name || item.organizationId}: профиль {item.profileRevision ?? "не сохранён"}, прежних решений {item.impact.affectedDecisions.length}, документов по явным связям {item.impact.documentCount}.</li>)}</ul><p className="text-muted-foreground">Это потенциальные связи в доступных центрах; полный анализ пользовательских шаблонов не подтверждён.</p>{!centres.complete && <Button size="sm" variant="outline" disabled={centresLoading} onClick={() => void loadCentres(centres.nextBeforeOrganizationId)}>Следующие центры</Button>}</>}
        </div>
        <NormativeTemplateAssociationsPanel organizationId={organizationId} manifest={selected} canWrite={canWrite} />
        {canWrite && (data.canManage || data.canAccept) && <fieldset disabled={!mutable} className="space-y-3">
          <div><Label htmlFor="normative-reason">Обоснование выполненного действия</Label><Textarea id="normative-reason" value={reason} maxLength={4000} onChange={event => { setReason(event.target.value); setAcknowledged(false); }} /></div>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />Подтверждаю выполненное действие и указанное обоснование для выбранной редакции.</label>
          {data.canManage && <>
            <div className="flex flex-wrap items-end gap-2"><div><Label htmlFor="normative-due">Явный срок пересмотра</Label><Input id="normative-due" type="date" value={dueOn} onChange={event => { setDueOn(event.target.value); setAcknowledged(false); }} /></div><Button size="sm" variant="outline" disabled={!deliberate || !dueOn} onClick={() => void record({ kind: "review_due_set", manifestId: selected.id, body: { dueOn, reason: reason.trim() } })}>Назначить срок</Button></div>
            <div className="space-y-1"><Label htmlFor="normative-source">Источник, который проверил ответственный</Label><select id="normative-source" className="w-full rounded-md border bg-background p-2 text-sm" value={sourceId} onChange={event => { setSourceId(event.target.value); setAcknowledged(false); }}><option value="">Выберите источник</option>{selected.manifest.sources.map(item => <option key={item.id} value={item.id}>{item.id}</option>)}</select></div>
            <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!deliberate || !source} onClick={() => source && void record({ kind: "source_checked", manifestId: selected.id, body: { sourceId: source.id, sourceSha256: source.sha256, reason: reason.trim() } })}>Зафиксировать проверку источника</Button><Button size="sm" variant="outline" disabled={!deliberate || data.projection.checkedSourceIds.length !== selected.manifest.sources.length} onClick={() => void record({ kind: "legal_reviewed", manifestId: selected.id, body: { reason: reason.trim() } })}>Зафиксировать правовую проверку</Button><Button size="sm" variant="outline" disabled={!deliberate || !data.projection.legalReviewed || !data.projection.reviewDueOn || data.projection.published} onClick={() => void record({ kind: "published", manifestId: selected.id, body: { reason: reason.trim() } })}>Опубликовать редакцию в журнале</Button></div>
            <p className="text-xs text-muted-foreground">Техническая проверка записывается отдельно по фактическому отчёту проверяющего сервиса. Эта форма не может подтвердить её кнопкой.</p>
          </>}
          {data.canAccept && <Button size="sm" variant="outline" disabled={!deliberate || !data.projection.published || !data.projection.runtimeVerified || !profileRevision} onClick={() => profileRevision && void record({ kind: "centre_accepted", manifestId: selected.id, body: { profileRevision, reason: reason.trim() } })}>Зафиксировать приёмку редакции центром</Button>}
        </fieldset>}
        <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium">Неизменяемая история выбранной редакции</summary><ul className="mt-2 space-y-2 text-sm">{data.events.map(event => <li key={event.id} className="rounded-lg border p-2"><p>{labels[event.kind]} · {event.occurredAt} · запись {event.sequence}</p>{"reason" in event.body && <p className="whitespace-pre-wrap break-words">{event.body.reason}</p>}</li>)}</ul>{!data.historyComplete && <p className="text-sm text-muted-foreground">Показаны последние 100 записей. Сводные статусы рассчитаны сервером по всей истории.</p>}</details>
      </>}
    </>}
  </details>;
}
