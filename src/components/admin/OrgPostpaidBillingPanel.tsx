import { useState } from "react";
import { AlertCircle, CheckCircle2, Receipt } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useOrgPostpaidBilling, type PostpaidAgreement, type PostpaidFeature, type PostpaidStatement } from "@/hooks/useOrgPostpaidBilling";

const FEATURES: Record<PostpaidFeature, string> = { crm: "CRM", webinar: "Вебинары", videoserviceplus: "Видеосервис+", frdoplus: "ФРДО+" };
const PLANS = { start: "Старт", standard: "Стандарт", professional: "Профессиональный" };
const STATUSES = { needs_review: "Требует проверки", approved: "Расчёт подтверждён", invoiced: "Счёт создан", superseded: "Заменён новым расчётом" };
const WRAPPING_BUTTON = "max-w-full whitespace-normal h-auto min-h-9 text-center";
const money = (amount: number) => `${amount.toLocaleString("ru-RU")} ₽`;
const dateLabel = (date: string) => date.split("T")[0].split("-").reverse().join(".");
const countValue = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= 2147483647 ? Number(value) : null;
const timestamp = (value: string) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null;
type BillingHook = ReturnType<typeof useOrgPostpaidBilling>;

// Remount on organization changes: neither an unsaved agreement nor an approved
// statement from one organization can become an action for another one.
export function OrgPostpaidBillingPanel({ organizationId }: { organizationId: string }) {
  return <PostpaidBillingContent key={organizationId} organizationId={organizationId} />;
}

function PostpaidBillingContent({ organizationId }: { organizationId: string }) {
  const billing = useOrgPostpaidBilling(organizationId);
  const [month, setMonth] = useState("2026-10");
  const [statement, setStatement] = useState<PostpaidStatement | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const run = async (action: () => Promise<void>) => {
    setError(""); setNotice("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Не удалось выполнить операцию постоплаты"); }
  };
  const overview = billing.overview;
  return <Card className="rounded-xl">
    <CardHeader className="pb-3">
      <CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4 text-primary" />Постоплата по фактическому использованию</CardTitle>
      <CardDescription>Расчёт за календарный месяц: действовавший доступ, курсы и уникальные обучавшиеся. Подключается по согласованному договору для выбранной организации.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5">
      {billing.loading ? <p className="text-sm text-muted-foreground">Загрузка условий постоплаты…</p> : billing.error ? <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>Не удалось загрузить условия постоплаты. <Button size="sm" variant="outline" onClick={() => void billing.refresh()}>Повторить</Button></AlertDescription></Alert> : overview && <>
        <div className="grid gap-2 sm:grid-cols-3 text-xs">
          <div className="rounded-lg border p-3"><strong className="block text-sm">Старт · 4 490 ₽/мес.</strong>До 15 курсов и 100 обучавшихся</div>
          <div className="rounded-lg border p-3"><strong className="block text-sm">Стандарт · 6 990 ₽/мес.</strong>До 30 курсов и 200 обучавшихся; CRM</div>
          <div className="rounded-lg border p-3"><strong className="block text-sm">Профессиональный · 16 990 ₽/мес.</strong>Выше лимитов; вебинары, Видеосервис+, ФРДО+</div>
        </div>
        <p className="text-xs text-muted-foreground">Функции повышают тариф только при фактическом использовании после предварительного уведомления и подтверждения клиента. За полный месяц доступа без активности — 4 490 ₽; при досрочном прекращении — пропорционально дням доступа.</p>
        <AgreementForm key={overview.agreement ? `${overview.agreement.id}:${overview.agreement.effective_from}:${overview.agreement.effective_to}:${overview.agreement.contract_reference}:${overview.agreement.customer_confirmation}` : "new"} agreement={overview.agreement} pending={billing.pending} onSave={input => run(async () => { await billing.saveAgreement(input); setStatement(null); setNotice("Условия постоплаты сохранены"); })} />
        {overview.agreement && <>
          <FeatureEvidence billing={billing} run={run} notify={message => { setStatement(null); setNotice(message); }} />
          <div className="space-y-3 border-t pt-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1"><Label htmlFor={`postpaid-month-${organizationId}`}>Расчётный месяц</Label><Input id={`postpaid-month-${organizationId}`} type="month" value={month} className="w-44" onChange={e => { setMonth(e.target.value); setStatement(null); }} disabled={billing.pending} /></div>
              <Button className={WRAPPING_BUTTON} variant="outline" disabled={billing.pending || !/^\d{4}-\d{2}$/.test(month)} onClick={() => void run(async () => { setStatement(await billing.prepare(`${month}-01`)); setNotice("Черновик расчёта подготовлен. Проверьте данные перед подтверждением."); })}>Подготовить расчёт</Button>
            </div>
            <p className="text-xs text-muted-foreground">Например, октябрь: с 01.10.2026 включительно до 01.11.2026. Счёт можно создать после окончания месяца и проверки расчёта.</p>
            {overview.statements.length > 0 && <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Сохранённые расчёты ({overview.statements.length})</summary><div className="mt-2 space-y-2">{overview.statements.map(item => <button key={item.id} disabled={billing.pending} onClick={() => { setStatement(item); setError(""); setNotice(""); }} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-left hover:bg-muted/30"><span>{dateLabel(item.period_start)} — {dateLabel(item.period_end)} · версия {item.revision}</span><Badge variant="outline">{STATUSES[item.status]}</Badge></button>)}</div></details>}
            {statement && <StatementReview key={`${statement.id}:${statement.status}`} statement={statement} pending={billing.pending}
              onApprove={(note, courses, learners) => run(async () => { setStatement(await billing.approve(statement.id, note, courses, learners)); setNotice("Расчёт подтверждён. Теперь можно создать счёт."); })}
              onIssue={() => run(async () => { const result = await billing.issue(statement.id); setStatement({ ...statement, status: "invoiced", invoice_id: result.invoice_id }); setNotice(result.already_issued ? "Счёт уже был создан; повторный счёт не создавался" : "Счёт создан и доступен в списке счетов"); })} />}
          </div>
        </>}
      </>}
      {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
      {notice && <p role="status" className="flex items-start gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />{notice}</p>}
    </CardContent>
  </Card>;
}

function AgreementForm({ agreement, pending, onSave }: { agreement: PostpaidAgreement | null; pending: boolean; onSave: (input: Parameters<BillingHook["saveAgreement"]>[0]) => Promise<void> }) {
  const [effectiveFrom, setEffectiveFrom] = useState(agreement?.effective_from || "2026-10-01");
  const [effectiveTo, setEffectiveTo] = useState(agreement?.effective_to || "");
  const [reference, setReference] = useState(agreement?.contract_reference || "");
  const [confirmation, setConfirmation] = useState(agreement?.customer_confirmation || "");
  const [acknowledged, setAcknowledged] = useState(false);
  const valid = /^\d{4}-\d{2}-01$/.test(effectiveFrom) && (!effectiveTo || effectiveTo > effectiveFrom) && reference.trim().length >= 3 && reference.trim().length <= 500 && confirmation.trim().length >= 10 && confirmation.trim().length <= 4000 && acknowledged;
  return <details open={!agreement} className="rounded-lg border p-3">
    <summary className="cursor-pointer text-sm font-medium">{agreement ? `Договор постоплаты · с ${dateLabel(agreement.effective_from)}` : "Подключить постоплату по договору"}</summary>
    <form className="mt-4 space-y-3" onSubmit={event => { event.preventDefault(); if (valid && !pending) void onSave({ effectiveFrom, effectiveTo: effectiveTo || null, contractReference: reference.trim(), customerConfirmation: confirmation.trim() }); }}>
      <fieldset disabled={pending} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="postpaid-from">Начало доступа по постоплате</Label><Input id="postpaid-from" type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} required /><p className="text-xs text-muted-foreground">Первое число согласованного месяца.</p></div>
          <div className="space-y-1"><Label htmlFor="postpaid-to">Дата прекращения доступа (не включается)</Label><Input id="postpaid-to" type="date" value={effectiveTo} onChange={e => setEffectiveTo(e.target.value)} /><p className="text-xs text-muted-foreground">Оставьте пустым, если доступ продолжается.</p></div>
        </div>
        <div className="space-y-1"><Label htmlFor="postpaid-reference">Договор / основание</Label><Input id="postpaid-reference" value={reference} onChange={e => setReference(e.target.value)} minLength={3} maxLength={500} placeholder="Номер, дата, ссылка на подписанный договор" required /></div>
        <div className="space-y-1"><Label htmlFor="postpaid-confirmation">Подтверждение клиента</Label><Textarea id="postpaid-confirmation" value={confirmation} onChange={e => setConfirmation(e.target.value)} minLength={10} maxLength={4000} placeholder="Кто и когда согласовал постоплату, где сохранено подтверждение (от 10 символов)" required /></div>
        <label className="flex items-start gap-2 text-sm"><Checkbox checked={acknowledged} onCheckedChange={value => setAcknowledged(value === true)} className="mt-0.5" /><span>Проверены договор и полученное согласие клиента на эти условия</span></label>
        {agreement && <p className="text-xs text-muted-foreground">Срок договора: по {dateLabel(agreement.contract_through)}{agreement.annual_renewal ? ", с ежегодным продлением" : ""}. Учёт событий начат {dateLabel(agreement.recording_started_at)}.</p>}
        <Button className={WRAPPING_BUTTON} type="submit" size="sm" disabled={!valid || pending}>{agreement ? "Сохранить условия постоплаты" : "Подключить постоплату"}</Button>
      </fieldset>
    </form>
  </details>;
}

function StatementReview({ statement, pending, onApprove, onIssue }: { statement: PostpaidStatement; pending: boolean; onApprove: (note: string, courses: number | null, learners: number | null) => Promise<void>; onIssue: () => Promise<void> }) {
  const [courses, setCourses] = useState("");
  const [learners, setLearners] = useState("");
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState(false);
  const snapshot = statement.snapshot;
  const manual = snapshot.completeness.status === "requires_manual_review";
  const reviewed = statement.status === "approved" || statement.status === "invoiced";
  const closed = snapshot.period_closed;
  const reviewedCourses = countValue(courses), reviewedLearners = countValue(learners);
  const countsValid = reviewedCourses !== null && reviewedLearners !== null && reviewedCourses >= snapshot.ledger_courses_count && reviewedLearners >= snapshot.ledger_learners_count && ((reviewedCourses === 0) === (reviewedLearners === 0));
  const canApprove = statement.status === "needs_review" && closed && checked && note.trim().length >= 10 && note.trim().length <= 4000 && (!manual || countsValid);
  const usedFeatures = Object.entries(snapshot.features).filter(([, used]) => used).map(([feature]) => FEATURES[feature as PostpaidFeature]).filter(Boolean);
  return <div className="rounded-lg border bg-muted/10 p-4 space-y-4">
    <div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{dateLabel(statement.period_start)} — {dateLabel(statement.period_end)} · версия {statement.revision}</strong><Badge variant={reviewed ? "secondary" : "outline"}>{STATUSES[statement.status]}</Badge></div>
    {manual && !reviewed && <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>Учёт не покрывает весь период. События ниже — только зарегистрированная часть, их нельзя считать точными итогами месяца. Сверьте курсы и уникальных обучавшихся с первичными данными и укажите источник.</AlertDescription></Alert>}
    <dl className="grid gap-3 sm:grid-cols-3 text-sm">
      <div><dt className="text-muted-foreground">{manual && !reviewed ? "Курсы в журнале событий" : "Курсы"}</dt><dd className="font-medium">{manual && !reviewed ? snapshot.ledger_courses_count : statement.reviewed_courses ?? snapshot.courses_count}</dd></div>
      <div><dt className="text-muted-foreground">{manual && !reviewed ? "Обучавшиеся в журнале событий" : "Уникальные обучавшиеся"}</dt><dd className="font-medium">{manual && !reviewed ? snapshot.ledger_learners_count : statement.reviewed_learners ?? snapshot.learners_count}</dd></div>
      <div><dt className="text-muted-foreground">Дни доступа</dt><dd className="font-medium">{snapshot.access_days} из {snapshot.month_days}</dd></div>
    </dl>
    <p className="text-xs text-muted-foreground">Подтверждённое использование функций: {usedFeatures.length ? usedFeatures.join(", ") : "не зафиксировано"}.</p>
    {snapshot.completeness.reasons.includes("unconfirmed_feature_use_excluded") && <p className="text-xs text-muted-foreground">В журнале есть использование функций без предварительного подтверждения клиента. Эти события исключены из тарификации.</p>}
    {manual && !reviewed ? <p className="text-sm font-medium">Тариф и сумма — после ручной сверки</p> : <p className="text-sm"><span className="text-muted-foreground">{reviewed ? "Подтверждённый расчёт" : "Предварительный расчёт"}: </span><strong>{PLANS[statement.plan]} · {money(statement.amount)}</strong></p>}
    {!closed && <p className="text-sm text-muted-foreground">Месяц ещё не завершён. Подтвердить расчёт и создать счёт можно с {dateLabel(statement.period_end)} после обновления расчёта.</p>}
    {statement.status === "needs_review" && <fieldset disabled={pending || !closed} className="space-y-3 border-t pt-3">
      {manual && <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="reviewed-postpaid-courses">Курсы за месяц после сверки</Label><Input id="reviewed-postpaid-courses" inputMode="numeric" type="number" min={snapshot.ledger_courses_count} step="1" value={courses} onChange={e => setCourses(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="reviewed-postpaid-learners">Уникальные обучавшиеся после сверки</Label><Input id="reviewed-postpaid-learners" inputMode="numeric" type="number" min={snapshot.ledger_learners_count} step="1" value={learners} onChange={e => setLearners(e.target.value)} /></div>
      </div>}
      {manual && <p className="text-xs text-muted-foreground">Итоги не могут быть меньше уже зарегистрированных событий. Если активности не было, оба показателя равны нулю.</p>}
      <div className="space-y-1"><Label htmlFor="postpaid-review-note">Основание проверки расчёта</Label><Textarea id="postpaid-review-note" value={note} onChange={e => setNote(e.target.value)} minLength={10} maxLength={4000} placeholder="Источник данных и результат сверки, включая отдельные сервисы (от 10 символов)" /></div>
      <label className="flex items-start gap-2 text-sm"><Checkbox checked={checked} onCheckedChange={value => setChecked(value === true)} className="mt-0.5" /><span>Проверены период, фактическое использование и согласованные условия</span></label>
      <Button className={WRAPPING_BUTTON} size="sm" disabled={pending || !canApprove} onClick={() => void onApprove(note.trim(), manual ? countValue(courses) : null, manual ? countValue(learners) : null)}>Подтвердить расчёт</Button>
    </fieldset>}
    {statement.review_note && <p className="text-xs text-muted-foreground">Проверка: {statement.review_note}</p>}
    {statement.status === "approved" && <Button className={WRAPPING_BUTTON} size="sm" disabled={pending || !closed} onClick={() => void onIssue()}>Создать счёт по подтверждённому расчёту</Button>}
    {statement.invoice_id && <Button className={WRAPPING_BUTTON} size="sm" variant="outline" asChild><a href={`/invoice/${encodeURIComponent(statement.invoice_id)}`} target="_blank" rel="noreferrer">Открыть созданный счёт</a></Button>}
    {statement.status === "superseded" && <p className="text-sm text-muted-foreground">Откройте последнюю версию расчёта или подготовьте новую.</p>}
  </div>;
}

function FeatureEvidence({ billing, run, notify }: { billing: BillingHook; run: (action: () => Promise<void>) => Promise<void>; notify: (message: string) => void }) {
  const [feature, setFeature] = useState<PostpaidFeature>("crm");
  const [notifiedAt, setNotifiedAt] = useState("");
  const [confirmedAt, setConfirmedAt] = useState("");
  const [evidence, setEvidence] = useState("");
  const [usageFeature, setUsageFeature] = useState<PostpaidFeature>("videoserviceplus");
  const [occurredAt, setOccurredAt] = useState("");
  const [usageEvidence, setUsageEvidence] = useState("");
  const [bytes, setBytes] = useState("");
  const notified = timestamp(notifiedAt), confirmed = timestamp(confirmedAt), occurred = timestamp(occurredAt);
  const byteCount = /^\d+$/.test(bytes) && Number.isSafeInteger(Number(bytes)) ? Number(bytes) : null;
  const now = new Date().toISOString();
  const canConfirm = notified && confirmed && notified <= confirmed && confirmed <= now && evidence.trim().length >= 10 && evidence.trim().length <= 4000;
  const canRecord = occurred && occurred <= now && usageEvidence.trim().length >= 10 && usageEvidence.trim().length <= 4000 && (usageFeature !== "videoserviceplus" || (byteCount !== null && byteCount > 2147483648));
  return <details className="rounded-lg border p-3">
    <summary className="cursor-pointer text-sm font-medium">Подтверждения и использование платных функций</summary>
    <div className="space-y-4 mt-4">
      <p className="text-xs text-muted-foreground">Здесь фиксируются уже полученные подтверждения и факты использования. CRM и вебинары учитываются по событиям системы; Видеосервис+ и ФРДО+ можно подтвердить первичными данными. Видеосервис+ — загрузка отдельного видеофайла больше 2 ГБ, а не общий объём хранилища.</p>
      <fieldset disabled={billing.pending} className="space-y-3">
        <div className="space-y-1"><Label>Функция для согласования</Label><Select value={feature} onValueChange={value => setFeature(value as PostpaidFeature)}><SelectTrigger aria-label="Функция для согласования"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(FEATURES).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid sm:grid-cols-2 gap-3"><div className="space-y-1"><Label htmlFor="feature-notified">Клиент уведомлён (местное время)</Label><Input id="feature-notified" type="datetime-local" value={notifiedAt} onChange={e => setNotifiedAt(e.target.value)} /></div><div className="space-y-1"><Label htmlFor="feature-confirmed">Клиент подтвердил (местное время)</Label><Input id="feature-confirmed" type="datetime-local" value={confirmedAt} onChange={e => setConfirmedAt(e.target.value)} /></div></div>
        <div className="space-y-1"><Label htmlFor="feature-evidence">Основание подтверждения функции</Label><Textarea id="feature-evidence" value={evidence} onChange={e => setEvidence(e.target.value)} placeholder="Ссылка на согласование, документ, переписку" /></div>
        <Button className={WRAPPING_BUTTON} size="sm" variant="outline" disabled={billing.pending || !canConfirm} onClick={() => void run(async () => { await billing.confirmFeature({ feature, notifiedAt: notified!, confirmedAt: confirmed!, evidence: evidence.trim() }); setEvidence(""); notify("Подтверждение клиента сохранено. Обновите черновик расчёта, чтобы учесть новые данные."); })}>Сохранить подтверждение функции</Button>
      </fieldset>
      <fieldset disabled={billing.pending} className="space-y-3 border-t pt-3">
        <div className="space-y-1"><Label>Фактически использованная функция</Label><Select value={usageFeature} onValueChange={value => setUsageFeature(value as PostpaidFeature)}><SelectTrigger aria-label="Фактически использованная функция"><SelectValue /></SelectTrigger><SelectContent>{(["videoserviceplus", "frdoplus"] as const).map(value => <SelectItem key={value} value={value}>{FEATURES[value]}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label htmlFor="feature-occurred">Когда использована (местное время)</Label><Input id="feature-occurred" type="datetime-local" value={occurredAt} onChange={e => setOccurredAt(e.target.value)} /></div>
        {usageFeature === "videoserviceplus" && <div className="space-y-1"><Label htmlFor="feature-bytes">Размер загруженного видеофайла, байт</Label><Input id="feature-bytes" type="number" min="2147483649" step="1" value={bytes} onChange={e => setBytes(e.target.value)} /></div>}
        <div className="space-y-1"><Label htmlFor="feature-usage-evidence">Доказательство фактического использования</Label><Textarea id="feature-usage-evidence" value={usageEvidence} onChange={e => setUsageEvidence(e.target.value)} placeholder="Видео и подтверждение загрузки / запись о работе с ФРДО+" /></div>
        <Button className={WRAPPING_BUTTON} size="sm" variant="outline" disabled={billing.pending || !canRecord} onClick={() => void run(async () => { await billing.recordFeatureUsage({ feature: usageFeature, occurredAt: occurred!, evidence: usageEvidence.trim(), bytes: usageFeature === "videoserviceplus" ? byteCount : null }); setUsageEvidence(""); notify("Факт использования сохранён. Обновите черновик расчёта, чтобы учесть новые данные."); })}>Зафиксировать использование</Button>
      </fieldset>
      <p className="text-xs text-muted-foreground">Подтверждений: {billing.overview?.feature_confirmations.length || 0}. Событий использования: {billing.overview?.feature_usage.length || 0}. Учитываются только события после предварительного подтверждения клиента.</p>
    </div>
  </details>;
}
