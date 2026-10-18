import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROGRAM_TYPES, SPECIAL_AREAS, type EducationProfileV1, type ProfileBooleanField } from "@/lib/uc-compliance/model";
import type { EducationProfileSnapshot } from "@/hooks/useEducationComplianceProfile";
import type { OrgDocument } from "@/hooks/useOrgDocumentsManager";

const PROGRAM_LABELS: Record<typeof PROGRAM_TYPES[number], string> = {
  dpo_upskilling: "Повышение квалификации", dpo_retraining: "Профессиональная переподготовка",
  professional_training: "Профессиональное обучение", internal_nonformal: "Внутреннее обучение вне образовательных программ",
};
const AREA_LABELS: Record<typeof SPECIAL_AREAS[number], string> = {
  medical_pharmaceutical: "Медицина и фармация", pedagogical: "Педагогическая деятельность", transport: "Транспорт",
  security: "Безопасность и охрана", occupational_safety: "Охрана труда", other_regulated: "Другая регулируемая область",
};
const BOOLEAN_FIELDS: readonly [ProfileBooleanField, string][] = [
  ["educationalActivity", "Ведётся образовательная деятельность"], ["usesElearning", "Применяется электронное обучение"],
  ["usesDistanceLearning", "Применяются дистанционные образовательные технологии"], ["paidEducation", "Оказываются платные образовательные услуги"],
  ["hasEmployees", "Есть работники"], ["hiresTeachers", "Привлекаются педагогические работники"],
  ["hasPracticalTraining", "Есть практическая подготовка или стажировка"], ["usesNetworkForm", "Применяется сетевая форма обучения"],
  ["servesMinors", "Обучаются несовершеннолетние"], ["servesDisabilities", "Обучаются лица с ОВЗ или инвалидностью"],
];

function Choice({ label, value, options, onChange }: { label: string; value: string | null; options: readonly (readonly [string, string])[]; onChange: (value: string | null) => void }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Select value={value ?? "unknown"} onValueChange={value => onChange(value === "unknown" ? null : value)}>
    <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent>
      <SelectItem value="unknown">Не указано</SelectItem>{options.map(([value, text]) => <SelectItem key={value} value={value}>{text}</SelectItem>)}
    </SelectContent></Select></div>;
}
function MultiChoice<T extends string>({ label, value, options, labels, onChange }: { label: string; value: T[] | null; options: readonly T[]; labels: Record<T, string>; onChange: (value: T[] | null) => void }) {
  return <fieldset className="space-y-2"><legend className="text-sm font-medium">{label}</legend>
    <p className="text-xs text-muted-foreground">{value === null ? "Сведения не указаны" : value.length === 0 ? "Указано: ничего из перечисленного" : "Отмечены сведения центра"}</p>
    <div className="grid gap-2 sm:grid-cols-2">{options.map(option => <label key={option} className="flex items-start gap-2 text-sm">
      <Checkbox aria-label={`${label}: ${labels[option]}`} checked={value?.includes(option) ?? false} onCheckedChange={checked => onChange(checked ? [...(value ?? []), option] : (value ?? []).filter(item => item !== option))} />{labels[option]}
    </label>)}</div>
    <div className="flex flex-wrap gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>Сведения неизвестны</Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>Ничего из перечисленного</Button></div>
  </fieldset>;
}

interface Props {
  snapshot: EducationProfileSnapshot; organization: Record<string, unknown> | null; documents: OrgDocument[];
  canWrite: boolean; saving: boolean; conflict: boolean; uncertain: boolean; error: string | null;
  onSave: (profile: EducationProfileV1) => Promise<boolean>; onReload: () => void; onClose: () => void;
  loadHistory?: (beforeRevision?: number | null) => Promise<EducationProfileSnapshot[] | null>;
}
/** Mounted with organization/revision as key: drafts never transfer to another center. */
function ProfileForm({ snapshot, organization, documents, canWrite, saving, conflict, uncertain, error, onSave, onReload, onClose }: Props) {
  const [draft, setDraft] = useState<EducationProfileV1>(() => structuredClone(snapshot.profile));
  const set = <K extends keyof EducationProfileV1>(key: K, value: EducationProfileV1[K]) => setDraft(previous => ({ ...previous, [key]: value }));
  const license = <K extends keyof EducationProfileV1["license"]>(key: K, value: EducationProfileV1["license"][K]) => setDraft(previous => ({ ...previous, license: { ...previous.license, [key]: value } }));
  const text = (value: string) => value.trim() ? value : null;
  const selectedEvidence = documents.find(document => document.id === draft.license.evidenceDocumentId);
  const disabled = !canWrite || saving || conflict || uncertain;
  return <div className="space-y-4">
    <div className="rounded-xl border bg-muted/30 p-3 text-sm space-y-1">
      <p className="font-medium">Реквизиты из карточки организации</p>
      <p>{String(organization?.name || "Название не указано")}</p>
      <p className="text-muted-foreground">ИНН: {String(organization?.inn || "не указан")} · ОГРН / ОГРНИП: {String(organization?.ogrn || "не указан")}</p>
      <p className="text-muted-foreground">{String(organization?.legal_address || "Адрес не указан")}</p>
      <p className="text-xs text-muted-foreground">Реквизиты здесь не изменяются. Они не определяют правовой статус центра автоматически.</p>
    </div>
    <fieldset disabled={disabled} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Choice label="Организационная форма" value={draft.legalForm} options={[["legal_entity", "Юридическое лицо"], ["individual_entrepreneur", "Индивидуальный предприниматель"]]} onChange={value => set("legalForm", value as EducationProfileV1["legalForm"])} />
        <Choice label="Как организовано обучение" value={draft.providerKind} options={[["educational_organization", "Образовательная организация"], ["training_unit", "Обучающее подразделение организации"], ["entrepreneur_direct", "ИП обучает лично"], ["entrepreneur_with_teachers", "ИП привлекает преподавателей"], ["internal_nonformal", "Внутреннее обучение вне образовательной деятельности"]]} onChange={value => set("providerKind", value as EducationProfileV1["providerKind"])} />
      </div>
      <MultiChoice label="Виды программ" value={draft.programTypes} options={PROGRAM_TYPES} labels={PROGRAM_LABELS} onChange={value => set("programTypes", value)} />
      <Accordion type="multiple" defaultValue={["activity"]}>
        <AccordionItem value="activity"><AccordionTrigger>Условия работы центра</AccordionTrigger><AccordionContent>
          <div className="grid gap-3 sm:grid-cols-2">{BOOLEAN_FIELDS.map(([field, label]) => <Choice key={field} label={label} value={draft[field] === null ? null : String(draft[field])}
            options={[["true", "Да"], ["false", "Нет"]]} onChange={value => set(field, value === null ? null : value === "true")} />)}</div>
        </AccordionContent></AccordionItem>
        <AccordionItem value="areas"><AccordionTrigger>Специальные области</AccordionTrigger><AccordionContent>
          <MultiChoice label="Области подготовки" value={draft.specialAreas} options={SPECIAL_AREAS} labels={AREA_LABELS} onChange={value => set("specialAreas", value)} />
        </AccordionContent></AccordionItem>
        <AccordionItem value="license"><AccordionTrigger>Лицензия или основание исключения</AccordionTrigger><AccordionContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Это сведения, заявленные центром. Автоматическая проверка государственного реестра не выполняется.</p>
          <Choice label="Заявленный статус лицензии" value={draft.license.status} options={[["declared_active", "По сведениям центра лицензия действует"], ["declared_exempt", "Заявлено исключение из лицензирования"], ["suspended", "Действие приостановлено"], ["terminated", "Действие прекращено"]]} onChange={value => license("status", value as EducationProfileV1["license"]["status"])} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="education-license-number">Номер записи в реестре</Label><Input id="education-license-number" maxLength={2000} value={draft.license.registryNumber ?? ""} onChange={event => license("registryNumber", text(event.target.value))} /></div>
            <div className="space-y-1.5"><Label htmlFor="education-license-authority">Лицензирующий орган</Label><Input id="education-license-authority" maxLength={2000} value={draft.license.authority ?? ""} onChange={event => license("authority", text(event.target.value))} /></div>
            <div className="space-y-1.5"><Label htmlFor="education-license-url">Ссылка на источник</Label><Input id="education-license-url" type="url" maxLength={2000} value={draft.license.sourceUrl ?? ""} onChange={event => license("sourceUrl", text(event.target.value))} /></div>
            <div className="space-y-1.5"><Label htmlFor="education-license-date">Когда центр проверил сведения</Label><Input id="education-license-date" type="date" value={draft.license.checkedOn ?? ""} onChange={event => license("checkedOn", text(event.target.value))} /></div>
          </div>
          <MultiChoice label="Виды программ по сведениям о лицензии" value={draft.license.licensedActivities} options={PROGRAM_TYPES} labels={PROGRAM_LABELS} onChange={value => license("licensedActivities", value)} />
          <div className="space-y-1.5"><Label htmlFor="education-license-exemption">Основание заявленного исключения</Label><Textarea id="education-license-exemption" maxLength={2000} value={draft.license.exemptionReason ?? ""} onChange={event => license("exemptionReason", text(event.target.value))} /></div>
          <Choice label="Документ-основание из файлов центра" value={draft.license.evidenceDocumentId} options={[
            ...(draft.license.evidenceDocumentId && !selectedEvidence ? [[draft.license.evidenceDocumentId, "Ранее выбранный документ (сейчас недоступен)"] as const] : []),
            ...documents.filter(document => !document.deleted_at).map(document => [document.id, document.name] as const),
          ]} onChange={value => {
            const document = documents.find(document => document.id === value);
            setDraft(previous => ({ ...previous, license: { ...previous.license, evidenceDocumentId: value, evidenceVersionId: document?.current_version_id ?? null } }));
          }} />
          {draft.license.evidenceDocumentId && <p className="text-xs text-muted-foreground">{draft.license.evidenceVersionId ? "Основание связано с сохранённой версией файла. Замена файла не меняет эту ссылку." : "Связан прежний документ без истории версий. Проверка содержания остаётся за центром."}</p>}
        </AccordionContent></AccordionItem>
      </Accordion>
    </fieldset>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap justify-end gap-2">
      {(conflict || uncertain) && <Button type="button" variant="outline" disabled={saving} onClick={onReload}>Загрузить сохранённый профиль</Button>}
      <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Закрыть</Button>
      {canWrite && <Button type="button" disabled={saving || conflict} onClick={async () => { if (await onSave(draft)) onClose(); }}>{saving ? "Сохранение…" : uncertain ? "Повторить сохранение" : "Сохранить профиль"}</Button>}
    </div>
  </div>;
}

function ProfileWithHistory(props: Props) {
  const [history, setHistory] = useState<EducationProfileSnapshot[] | null>(null);
  const [historyError, setHistoryError] = useState(false), [loading, setLoading] = useState(false), [more, setMore] = useState(false), [selected, setSelected] = useState<EducationProfileSnapshot | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = async (before: number | null = null) => {
    if (!props.loadHistory || loading) return;
    setLoading(true); setHistoryError(false);
    const rows = await props.loadHistory(before);
    if (!alive.current) return;
    setLoading(false);
    if (!rows) { setHistoryError(true); return; }
    setHistory(previous => before === null ? rows : [...(previous ?? []), ...rows]); setMore(rows.length === 25);
  };
  return <>
    {selected && <div className="rounded-lg border p-3 space-y-2 text-sm"><p>Просмотр сохранённой версии {selected.revision}. Текущий профиль не изменяется.</p><Button size="sm" variant="outline" onClick={() => setSelected(null)}>Вернуться к текущему профилю</Button></div>}
    <ProfileForm key={selected ? `history:${selected.revision}` : `current:${props.snapshot.revision}`} {...props} snapshot={selected ?? props.snapshot} canWrite={!selected && props.canWrite} />
    {props.loadHistory && <details className="border-t pt-3" onToggle={event => { if (event.currentTarget.open && history === null && !historyError) void load(); }}>
      <summary className="cursor-pointer text-sm font-medium">История профиля</summary><div className="mt-3 space-y-2">
        {loading && <p className="text-sm text-muted-foreground">Загрузка истории…</p>}
        {historyError && <div role="alert"><p className="text-sm text-destructive">Не удалось загрузить историю профиля.</p><Button size="sm" variant="outline" onClick={() => void load()}>Повторить</Button></div>}
        {history?.length === 0 && <p className="text-sm text-muted-foreground">Сохранённых версий пока нет.</p>}
        {history?.map(row => <Button key={row.revision} variant="outline" className="h-auto whitespace-normal text-left" onClick={() => setSelected(row)}>Версия {row.revision} · {row.updated_at && Number.isFinite(Date.parse(row.updated_at)) ? new Date(row.updated_at).toLocaleString("ru-RU") : "дата не указана"}</Button>)}
        {more && !loading && <Button size="sm" variant="outline" onClick={() => void load(history?.at(-1)?.revision ?? null)}>Более ранние профили</Button>}
      </div>
    </details>}
  </>;
}

export function EducationProfileDialog(props: Props & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return <Dialog open={props.open} onOpenChange={open => { if (!props.saving) props.onOpenChange(open); }}>
    <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto rounded-2xl">
      <DialogHeader><DialogTitle>Профиль учебного центра</DialogTitle><DialogDescription>Укажите известные сведения. «Не указано» сохраняется как неизвестное значение и требует уточнения.</DialogDescription></DialogHeader>
      <ProfileWithHistory key={`${props.snapshot.organization_id}:${props.snapshot.revision}`} {...props} />
    </DialogContent>
  </Dialog>;
}
