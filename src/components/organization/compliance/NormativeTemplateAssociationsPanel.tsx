import { useLayoutEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useNormativeTemplateAssociations } from "@/hooks/useNormativeTemplateAssociations";
import type { ManifestVersion } from "@/lib/normativeGovernance/model";
import type { TemplateLink, TemplateTarget, TemplateTargetKind } from "@/lib/normativeGovernance/templateAssociations";
const kindLabel = { contract_template_version: "Версии шаблонов договоров", org_document_version: "Версии документов организации" };
export function NormativeTemplateAssociationsPanel({ organizationId, manifest, canWrite }: { organizationId: string; manifest: ManifestVersion; canWrite: boolean }) {
  const journal = useNormativeTemplateAssociations(organizationId, manifest.id, manifest.manifest.sha256, canWrite);
  const [targetKind, setTargetKind] = useState<TemplateTargetKind>("contract_template_version"), [selected, setSelected] = useState<TemplateTarget | null>(null);
  const [sourceId, setSourceId] = useState(""), [reason, setReason] = useState(""), [acknowledged, setAcknowledged] = useState(false);
  useLayoutEffect(() => { setTargetKind("contract_template_version"); setSelected(null); setSourceId(""); setReason(""); setAcknowledged(false); }, [journal.key]);
  const source = manifest.manifest.sources.find(item => item.id === sourceId), page = journal.page;
  const mutable = journal.writable && !!page && !journal.loading && !journal.saving && !journal.uncertain && !journal.conflict;
  const deliberate = mutable && acknowledged && !!reason.trim();
  const versions = () => { setSelected(null); void journal.read({ kind: "versions", targetKind, afterId: null, limit: 25 }); };
  const links = (target: TemplateTarget) => { setSelected(target); setAcknowledged(false); void journal.read({ kind: "links", targetKind: target.kind, targetVersionId: target.versionId, afterRevision: null, limit: 25 }); };
  const unlink = async (link: TemplateLink) => {
    if (!deliberate || link.action !== "link") return;
    if (await journal.record({ action: "unlink", targetKind: link.target.kind, targetVersionId: link.target.versionId, targetSha256: link.pinnedTargetSha256,
      manifestId: link.manifestId, manifestSha256: link.manifestSha256, sourceId: link.sourceId, sourceSha256: link.sourceSha256, reason: reason.trim() })) { setReason(""); setAcknowledged(false); }
  };
  const link = async () => {
    if (!deliberate || !source || selected?.availability !== "available" || !selected.contentSha256) return;
    if (await journal.record({ action: "link", targetKind: selected.kind, targetVersionId: selected.versionId, targetSha256: selected.contentSha256,
      manifestId: manifest.id, manifestSha256: manifest.manifest.sha256, sourceId: source.id, sourceSha256: source.sha256, reason: reason.trim() })) { setReason(""); setAcknowledged(false); }
  };
  const more = () => {
    if (!page || page.complete) return;
    if (page.kind === "versions") void journal.read({ kind: "versions", targetKind, afterId: page.nextAfterId, limit: 25 }, true);
    else if (page.kind === "impacts") void journal.read({ kind: "impacts", afterRevision: page.nextAfterRevision, limit: 25 }, true);
    else if (selected) void journal.read({ kind: page.kind, targetKind: selected.kind, targetVersionId: selected.versionId, afterRevision: page.nextAfterRevision, limit: 25 }, true);
  };
  return <section className="rounded-xl border p-3 space-y-3 text-sm" aria-label="Явные связи нормативов с версиями шаблонов">
    <h4 className="font-medium">Связи источников с точными версиями шаблонов</h4>
    <p className="text-muted-foreground">Связь фиксирует выбранную редакцию и хеш версии. Она допускает непроверенный черновик источника и не утверждает норму, шаблон или прежние решения центра. Новые версии не наследуют связи автоматически.</p>
    <p className="text-muted-foreground">Для документов проверяется ссылка на метаданные и объект хранилища; это не хеш байтов файла. Версии договоров могут измениться: несовпадение хеша показывается отдельно.</p>
    <div className="flex flex-wrap gap-2 items-end"><div><Label htmlFor="normative-template-kind">Область версий</Label><select id="normative-template-kind" className="w-full rounded-md border bg-background p-2" value={targetKind} disabled={journal.loading || journal.saving} onChange={event => { const kind = event.target.value as TemplateTargetKind; setTargetKind(kind); setSelected(null); void journal.read({ kind: "versions", targetKind: kind, afterId: null, limit: 25 }); }}>{Object.entries(kindLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
      <Button size="sm" variant="outline" disabled={journal.loading || journal.saving} onClick={versions}>Обновить версии и сверить журнал</Button>
      <Button size="sm" variant="outline" disabled={journal.loading || journal.saving} onClick={() => { setSelected(null); void journal.read({ kind: "impacts", afterRevision: null, limit: 25 }); }}>Затронутые версии по явным связям</Button>
      {journal.uncertain && <Button size="sm" variant="outline" disabled={journal.saving} onClick={() => void journal.retry()}>Повторить прежний запрос связи</Button>}
    </div>
    {journal.loading && <p role="status">Загрузка связей…</p>}{journal.error && <p role="alert" className="text-destructive">{journal.error}</p>}
    {page?.kind === "versions" && <ul className="space-y-2">{page.items.map(item => <li key={item.versionId} className="rounded-lg border p-2"><p>{item.label || "Версия недоступна для подтверждения"} · версия {item.versionNumber ?? "не подтверждена"}</p><p className="text-xs break-all text-muted-foreground">ID версии: {item.versionId}</p><Badge variant="outline">{item.activeLinks === 0 ? "Без явных связей" : "Явных связей: " + item.activeLinks}</Badge>{item.availability === "available" && <Button size="sm" variant="outline" className="ml-2" disabled={journal.loading || journal.saving} onClick={() => links(item)}>Открыть связи версии</Button>}</li>)}</ul>}
    {page && page.kind !== "versions" && <><p className="font-medium">{page.kind === "impacts" ? "Версии, связанные с изменёнными или исчезнувшими источниками" : page.kind === "history" ? "Неизменяемая история выбранной версии" : "Последнее решение по каждому источнику выбранной версии"}</p>
      {page.items.length === 0 && <p>В этой странице явные записи не найдены. Это не подтверждает отсутствие влияния на несвязанные шаблоны.</p>}
      <ul className="space-y-2">{page.items.map(item => <li key={item.id} className="rounded-lg border p-2 space-y-1"><p>{item.target.label || "Содержимое версии сейчас недоступно"} · версия {item.pinnedVersionNumber} · {item.action === "link" ? "связана" : "связь снята"}</p>
        <p className="text-xs break-all">Версия: {item.target.versionId} · источник: {item.sourceId} · запись {item.revision}</p>
        <div className="flex flex-wrap gap-1"><Badge variant="outline">Содержимое: {item.targetState === "matching" ? "совпадает с закреплённым хешем" : item.targetState === "changed" ? "изменилось" : "не подтверждено"}</Badge><Badge variant="outline">Источник в выбранном снимке: {item.sourceState === "matching" ? "тот же хеш" : item.sourceState === "changed" ? "новый хеш" : "отсутствует"}</Badge><Badge variant="outline">Проверка источника: {item.sourceStatus.checked ? "отдельно зафиксирована" : "не зафиксирована"}</Badge><Badge variant="outline">Публикация связанной редакции: {item.sourceStatus.published ? "зафиксирована" : "не зафиксирована"}</Badge></div>
        <p className="whitespace-pre-wrap break-words">{item.reason}</p><p className="text-xs text-muted-foreground">{item.occurredAt} · связь не подтверждает правовое соответствие.</p>
        {page.kind !== "history" && item.action === "link" && <Button size="sm" variant="outline" disabled={!deliberate} onClick={() => void unlink(item)}>Снять эту связь с сохранением истории</Button>}
      </li>)}</ul></>}
    {page && <p className="text-muted-foreground">{page.complete ? "Список в выбранной области дочитан полностью." : "Показана часть списка; для полного перечня откройте следующие записи."} Личные настройки без версий: покрытие неизвестно, переноса старых данных не было.</p>}
    {page && !page.complete && <Button size="sm" variant="outline" disabled={journal.loading || journal.saving} onClick={more}>Следующие записи</Button>}
    {selected && <><p className="text-xs break-all">Выбрана точная версия: {selected.versionId} · хеш {selected.contentSha256 ?? "не подтверждён"}</p>
      <Button size="sm" variant="outline" disabled={journal.loading || journal.saving} onClick={() => void journal.read({ kind: "history", targetKind: selected.kind, targetVersionId: selected.versionId, afterRevision: null, limit: 25 })}>История всех изменений связей этой версии</Button></>}
    {journal.writable && <fieldset disabled={!mutable} className="space-y-2"><div><Label htmlFor="normative-template-reason">Фактическое основание связи или её снятия</Label><Textarea id="normative-template-reason" maxLength={2000} value={reason} onChange={event => { setReason(event.target.value); setAcknowledged(false); }} /></div>
      <label className="flex gap-2"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />Фиксирую только фактическую связь; правовая проверка и публикация остаются отдельными решениями.</label>
      {selected && <><div><Label htmlFor="normative-template-source">Источник выбранного снимка, включая непроверенный черновик</Label><select id="normative-template-source" className="w-full rounded-md border bg-background p-2" value={sourceId} onChange={event => { setSourceId(event.target.value); setAcknowledged(false); }}><option value="">Выберите источник</option>{manifest.manifest.sources.map(item => <option key={item.id} value={item.id}>{item.id} · {item.sha256.slice(0, 12)}</option>)}</select></div><Button size="sm" variant="outline" disabled={!deliberate || !source || selected.availability !== "available"} onClick={() => void link()}>Зафиксировать связь точной версии</Button></>}
    </fieldset>}
  </section>;
}
