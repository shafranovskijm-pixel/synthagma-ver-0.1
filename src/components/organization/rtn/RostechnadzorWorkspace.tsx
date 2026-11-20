import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, BookOpen, CheckCircle2, Clock3, ExternalLink, Factory, Loader2, RefreshCw, Search, Users, ChartNoAxesCombined, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RtnWorkspaceView } from "@/lib/rtnWorkspaceNavigation";
import { assignRtnTraining, checkRtnSource, getRtnWorkspace, saveRtnSettings } from "@/api/rostechnadzor";
import { canAssignRtnBank, type RtnBank, type RtnCheckResult, type RtnCheckStatus, type RtnReleaseMetadata, type RtnSettings, type RtnWorkspace } from "@/types/rostechnadzor";
import { RtnEditorialPanel } from "./RtnEditorialPanel";
import { RtnUpdatesFeed } from "./RtnUpdatesFeed";
import { RtnPersonalPreferences } from "./RtnPersonalPreferences";

type Panel = "assign" | "results";
interface RtnWorkspaceNavigation {
  view: RtnWorkspaceView;
  bankId: string | null;
  eventId: string | null;
  invalidTarget: boolean;
}
type RtnNavigationTarget = { view: RtnWorkspaceView; bankId?: string | null; eventId?: string | null };
interface RtnWorkspaceProps {
  organizationId: string;
  actorId: string | null;
  isAdminView?: boolean;
  onUsageChanged?: () => void;
  navigation?: RtnWorkspaceNavigation;
  onNavigate?: (target: RtnNavigationTarget) => void;
}
const controlClass = "flex min-h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const boxClass = "min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5";

export function rtnDate(value: string | null | undefined, time = false, timeZone?: string): string {
  if (!value) return "Не подтверждено";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Не подтверждено";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } as const : {}), ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

function officialSource(url: string | null): string | null {
  try {
    const parsed = new URL(url || "");
    if (parsed.username || parsed.password || parsed.port) return null;
    return parsed.protocol === "https:" && (parsed.hostname === "gosnadzor.ru" || parsed.hostname.endsWith(".gosnadzor.ru")) ? parsed.href : null;
  } catch { return null; }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Не удалось выполнить запрос. Повторите попытку.";
}

function checkLabel(status: RtnCheckStatus | null | undefined): string {
  switch (status) {
    case "queued": return "В очереди";
    case "running": return "Проверяем официальный источник…";
    case "unchanged": return "Изменений не обнаружено";
    case "changed": return "Проверка обнаружила изменение источника";
    case "success": return "Источник проверен";
    case "error": return "Не удалось проверить источник";
    default: return "Источник ещё не проверен";
  }
}

function keyLabel(bank: RtnBank): string {
  if (bank.key_status === "released" && bank.normative_status !== "current") return "Нужна повторная нормативная проверка";
  if (canAssignRtnBank(bank)) return "Проверенные учебные ответы";
  if (bank.key_status === "reviewed") return "Ключи проверены · редакция готовится к выпуску";
  if (bank.key_status === "released") return "Редакция временно не доступна для назначения";
  return "Ответы проходят предметную проверку";
}

function confirmedQuestionCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

// The workspace RPC uses zero when no normalized bank revision exists.
// A numeric value alone therefore cannot confirm the size of a question bank.
function bankQuestionCount(bank: RtnBank): number | null {
  return typeof bank.bank_revision_id === "string" && bank.bank_revision_id.trim()
    ? confirmedQuestionCount(bank.question_count) : null;
}

function applicationDate(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return rtnDate(value, false, "UTC");
}

function applicationDateLabel(value: string | null | undefined): string {
  const date = applicationDate(value);
  return date ? `Применяется с ${date}` : "Дата применения не подтверждена";
}

function hasPendingSourceRevision(bank: RtnBank): boolean {
  return typeof bank.pending_source_revision_id === "string" && bank.pending_source_revision_id.trim().length > 0;
}

function domainLabel(value: string): string {
  return ({ 'industrial-safety': 'Промышленная безопасность', energy_supervision_knowledge_check: 'Энергонадзор · проверка знаний' } as Record<string, string>)[value] || 'Другое направление';
}

function ErrorBox({ message, retry, busy = false }: { message: string; retry?: () => void; busy?: boolean }) {
  return <div role="alert" className={`${boxClass} flex items-start gap-3`}>
    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
    <div className="min-w-0 flex-1 space-y-3"><p className="break-words text-sm">{message}</p>
      {retry && <Button variant="outline" size="sm" disabled={busy} onClick={retry} className="gap-2"><RefreshCw className="h-4 w-4" />Повторить</Button>}
    </div>
  </div>;
}

// A keyed child resets local selections and pending requests when the active tenant changes.
export function RostechnadzorWorkspace({ organizationId, actorId, isAdminView = false, onUsageChanged, navigation, onNavigate }: RtnWorkspaceProps) {
  if (!actorId) return <ErrorBox message="Не удалось подтвердить текущую учётную запись. Дождитесь восстановления сеанса или войдите заново." />;
  return <div className="min-w-0 space-y-5"><RtnWorkspaceContent key={`${actorId}:${organizationId}`} organizationId={organizationId} actorId={actorId} onUsageChanged={onUsageChanged} navigation={navigation} onNavigate={onNavigate} />{isAdminView && <RtnEditorialPanel organizationId={organizationId} />}</div>;
}

function RtnWorkspaceContent({ organizationId, actorId, onUsageChanged, navigation, onNavigate }: Omit<RtnWorkspaceProps, "actorId"> & { actorId: string }) {
  const client = useQueryClient();
  const queryKey = ["rtn-workspace", actorId, organizationId];
  const [panel, setPanel] = useState<Panel | null>(null);
  const [localView, setLocalView] = useState<RtnWorkspaceView>("training");
  const view = navigation?.view ?? localView;
  const navigateView = (target: RtnNavigationTarget) => {
    setLocalView(target.view);
    setPanel(null);
    setDetail(null);
    onNavigate?.(target);
  };
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState("");
  const [detail, setDetail] = useState<RtnBank | null>(null);
  const [selectedBank, setSelectedBank] = useState("");
  const [checkResults, setCheckResults] = useState<Record<string, RtnCheckResult>>({});
  const [checkFailures, setCheckFailures] = useState<Record<string, boolean>>({});
  const [pendingRuns, setPendingRuns] = useState<Record<string, { id: string; until: number }>>({});
  const query = useQuery({
    queryKey, queryFn: () => getRtnWorkspace(organizationId), retry: false, staleTime: 0,
    refetchInterval: () => Object.values(pendingRuns).some(run => Date.now() < run.until) ? 2000 : false,
  });
  useEffect(() => {
    if (!navigation?.bankId || navigation.view !== "training" || !query.data?.access.allowed) {
      setDetail(null);
      return;
    }
    // A URL never grants access or asks for a bank outside the current scoped response.
    setDetail(query.data.banks.find(bank => bank.id === navigation.bankId) ?? null);
  }, [navigation?.bankId, navigation?.view, query.data]);

  useEffect(() => {
    if (!query.data) return;
    const completed = Object.entries(pendingRuns).flatMap(([sourceId, run]) => {
      const check = query.data.checks.find(item => item.id === run.id);
      return check && check.status !== "queued" && check.status !== "running" ? [{ sourceId, check }] : [];
    });
    if (!completed.length) return;
    setCheckResults(previous => {
      const next = { ...previous };
      for (const { sourceId, check } of completed) next[sourceId] = { run_id: check.id, status: check.status, last_success_at: check.last_success_at, error: check.error };
      return next;
    });
    setPendingRuns(previous => {
      const next = { ...previous };
      for (const { sourceId } of completed) delete next[sourceId];
      return next;
    });
  }, [query.data, pendingRuns]);

  const check = useMutation({
    mutationFn: (sourceId: string) => checkRtnSource(organizationId, sourceId),
    onMutate: sourceId => setCheckFailures(previous => ({ ...previous, [sourceId]: false })),
    onError: (_error, sourceId) => setCheckFailures(previous => ({ ...previous, [sourceId]: true })),
    onSuccess: (result, sourceId) => {
      setCheckResults(previous => ({ ...previous, [sourceId]: result }));
      if (result.status === "queued" || result.status === "running") {
        setPendingRuns(previous => ({ ...previous, [sourceId]: { id: result.run_id, until: Date.now() + 60000 } }));
      }
      void client.invalidateQueries({ queryKey });
    },
  });

  const banks = query.data?.banks || [];
  const domains = useMemo(() => [...new Set(banks.map(bank => bank.domain).filter(Boolean))], [banks]);
  const visibleBanks = banks.filter(bank => (!domain || bank.domain === domain) &&
    `${bank.code} ${bank.title}`.toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru").trim()));
  const sources = banks.filter((bank, index) => banks.findIndex(other => other.source_id === bank.source_id) === index);
  const openAssign = (bank?: RtnBank) => { if (bank) setSelectedBank(bank.id); setPanel("assign"); };
  const openBank = (bank: RtnBank) => {
    setDetail(bank);
    onNavigate?.({ view: "training", bankId: bank.id });
  };
  const closeBank = () => {
    setDetail(null);
    if (navigation?.bankId) onNavigate?.({ view: "training" });
  };

  if (query.isPending) return <div role="status" className="flex items-center justify-center gap-3 py-12 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Загружаем программы и проверяем доступ…</div>;
  // A failed refresh must not keep showing stale authorizations or another tenant's rows.
  if (query.isError || !query.data) return <ErrorBox message={errorMessage(query.error)} retry={() => void query.refetch()} busy={query.isFetching} />;
  const workspace = query.data;
  if (!workspace.access.allowed) {
    const reasons: Record<string, string> = {
      active_platform_access_required: "Программы Ростехнадзора входят в действующий оплаченный доступ СИНТАГМЫ и договоры постоплаты. Отдельная покупка не нужна.",
      inactive_subscription: "Сейчас нет действующего оплаченного доступа или договора постоплаты. После продления раздел подключится без дополнительной платы.",
      permission_denied: "Для просмотра программ нужны права на курсы этой организации. Обратитесь к её администратору.",
      access_suspended: "Доступ организации приостановлен. Обратитесь к администратору для проверки статуса доступа.",
      pilot_not_enabled: "Пилот в этой организации пока не подключён. Раздел доступен организациям с действующим оплаченным доступом и договорами постоплаты.",
    };
    return <section className={`${boxClass} space-y-3`}><h2 className="text-xl font-semibold">Ростехнадзор</h2><p className="text-sm text-muted-foreground">{reasons[workspace.access.reason || ""] || "Сервер пока не подтвердил доступ к программам этой организации. Обновите состояние или обратитесь к администратору."}</p><Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()} className="gap-2"><RefreshCw className="h-4 w-4" />Обновить доступ</Button></section>;
  }

  // Filter before grouping: another bank sharing this source may be the one awaiting review.
  const changedSources = [...banks.filter(bank => hasPendingSourceRevision(bank) || checkResults[bank.source_id]?.status === "changed" || bank.check_status === "changed")
    .reduce((groups, bank) => {
      const affected = groups.get(bank.source_id) ?? [];
      affected.push(bank);
      groups.set(bank.source_id, affected);
      return groups;
    }, new Map<string, RtnBank[]>())];
  const missingLinkedBank = !!navigation?.bankId && !banks.some(bank => bank.id === navigation.bankId);
  return <section className="min-w-0 space-y-5" aria-label="Программы Ростехнадзора">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold sm:text-2xl">Ростехнадзор</h2><p className="mt-1 text-sm text-muted-foreground">Подготовка по официальным вопросам</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{workspace.access.pilot ? "Бесплатный пилот" : "Включено в доступ организации"}</span></div>
    <Tabs value={view} onValueChange={value => {
      if (value === "training" || value === "changes" || value === "sources") navigateView({ view: value });
    }} className="min-w-0 space-y-4">
      <TabsList className="grid h-auto w-full grid-cols-3 rounded-none border-b border-border bg-transparent p-0 sm:w-auto sm:inline-flex" aria-label="Разделы Ростехнадзора">
        <TabsTrigger value="training" className="min-h-11 rounded-none border-b-2 border-transparent px-2 py-3 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none sm:px-5">Подготовка</TabsTrigger>
        <TabsTrigger value="changes" className="min-h-11 rounded-none border-b-2 border-transparent px-2 py-3 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none sm:px-5">Изменения</TabsTrigger>
        <TabsTrigger value="sources" className="min-h-11 rounded-none border-b-2 border-transparent px-2 py-3 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none sm:px-5">Источники</TabsTrigger>
      </TabsList>
      {navigation?.invalidTarget && <p role="status" className={`${boxClass} text-sm text-muted-foreground`}>Ссылка на раздел некорректна. Выберите программу или раздел Ростехнадзора заново.</p>}
      <TabsContent value="training" className="min-w-0 space-y-4">
        {missingLinkedBank && <p role="status" className={`${boxClass} text-sm text-muted-foreground`}>Программа из ссылки недоступна в текущем кабинете. Выберите программу из доступного списка.</p>}
    <div className={`${boxClass} flex flex-col gap-3 sm:flex-row`}>
      <label className="relative min-w-0 flex-1"><Search aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><span className="sr-only">Поиск программы</span><input className={`${controlClass} pl-9`} placeholder="Поиск программы…" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label className="min-w-0 sm:w-64"><span className="sr-only">Направление</span><select className={controlClass} value={domain} onChange={event => setDomain(event.target.value)}><option value="">Все направления</option>{domains.map(value => <option key={value} value={value}>{domainLabel(value)}</option>)}</select></label>
    </div>
        <div className="flex flex-wrap gap-2" aria-label="Действия с программами">
          <Button variant={panel === "assign" ? "default" : "outline"} onClick={() => openAssign()} className="h-auto min-h-11 gap-2 whitespace-normal text-left"><Users className="h-4 w-4 shrink-0" />Назначить обучение</Button>
          <Button variant={panel === "results" ? "default" : "outline"} onClick={() => setPanel("results")} className="min-h-11 gap-2"><ChartNoAxesCombined className="h-4 w-4" />Результаты</Button>
        </div>
        {panel === "assign" && <AssignmentPanel organizationId={organizationId} workspace={workspace} selectedBank={selectedBank} onSelectBank={setSelectedBank} onSaved={() => { void query.refetch(); onUsageChanged?.(); }} onOpenResults={() => setPanel("results")} />}
        {panel === "results" && <ResultsPanel workspace={workspace} />}
    {visibleBanks.length ? <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">{visibleBanks.map(bank => {
      const ready = canAssignRtnBank(bank);
      const questionCount = bankQuestionCount(bank);
      return <article key={bank.id} className={`${boxClass} flex flex-col gap-4`}>
        <div className="flex items-start gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{/энерг|электр/i.test(`${bank.domain} ${bank.title}`) ? <Zap className="h-6 w-6" /> : <Factory className="h-6 w-6" />}</div><div className="min-w-0 space-y-2"><h3 className="break-words font-semibold">{bank.code ? `${bank.code}. ` : ""}{bank.title}</h3><p className="text-xs text-muted-foreground">{questionCount === null ? "Количество вопросов не подтверждено" : `${questionCount} вопросов`} · {applicationDateLabel(bank.effective_from)}</p><span className={`inline-flex items-start gap-1.5 rounded-md px-2 py-1 text-xs ${ready ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-800 dark:text-amber-300"}`}>{ready ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <Clock3 className="h-3.5 w-3.5 shrink-0" />}{keyLabel(bank)}</span></div></div>
        {bank.normative_cutoff_at && <p className="text-xs text-muted-foreground">Контроль актуальности редакции: до {rtnDate(bank.normative_cutoff_at, true, 'Europe/Moscow')} МСК.</p>}
        {ready && hasPendingSourceRevision(bank) && <p className={workspace.settings.notify_updates ? "text-xs font-medium text-amber-800 dark:text-amber-300" : "text-xs text-muted-foreground"}>Источник обновился. Новая редакция проходит проверку; обучение продолжается по выпущенной редакции.</p>}
        <div className="mt-auto flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => openBank(bank)} className="gap-2"><BookOpen className="h-4 w-4" />Посмотреть состав</Button>{ready && <Button size="sm" disabled={!workspace.access.can_assign} onClick={() => openAssign(bank)}>Назначить обучение</Button>}</div>
      </article>;
    })}</div> : <div className={`${boxClass} text-sm text-muted-foreground`}>{banks.length ? "По вашему запросу программы не найдены." : "Подтверждённые источники ещё не загружены. Здесь появятся программы после проверки редакций."}</div>}
        <p className="text-sm text-muted-foreground">Для новых попыток используется выпущенная редакция с проверенными учебными ответами. Старые попытки и результаты сохраняют свою редакцию. Подготовка не заменяет официальную аттестацию.</p>
      </TabsContent>
      <TabsContent value="changes" className="min-w-0 space-y-4">
        {view === "changes" && <RtnUpdatesFeed organizationId={organizationId} actorId={actorId} eventId={navigation?.invalidTarget ? null : navigation?.eventId} onSelectEvent={eventId => navigateView({ view: "changes", eventId })} onOpenBank={bankId => navigateView({ view: "training", bankId })} />}
        <section className={`${boxClass} space-y-4`} aria-label="Изменения вопросов">
          <div><h3 className="font-semibold">Состояние программ</h3><p className="mt-1 text-sm text-muted-foreground">Текущее состояние источников программ, отдельно от общей ленты событий. Изменение официального файла не означает, что новые учебные ответы уже проверены.</p></div>
          {!changedSources.length && <p className="text-sm text-muted-foreground">В данных программ пока нет отмеченных изменений источника. Дата и результат последней проверки показаны в разделе «Источники».</p>}
          {changedSources.map(([sourceId, affectedBanks]) => <article key={sourceId} className="space-y-3 border-t border-border pt-4"><h4 className="text-sm font-medium">Изменение источника вопросов</h4><div className="space-y-4">{affectedBanks.map(bank => <div key={bank.id} className="space-y-2"><p className="break-words text-sm font-medium">{bank.title}</p><p className="text-sm text-muted-foreground">{hasPendingSourceRevision(bank) ? "Новая редакция проходит предметную проверку; прежние попытки не пересчитываются." : "Проверка обнаружила изменение. Состояние редакции показано в программе."}</p><Button size="sm" variant="outline" className="min-h-11" onClick={() => { navigateView({ view: "training", bankId: bank.id }); setDetail(bank); }}>Посмотреть программу</Button></div>)}</div><Button size="sm" variant="outline" className="min-h-11" onClick={() => navigateView({ view: "sources" })}>Проверка источника</Button></article>)}
        </section>
      </TabsContent>
      <TabsContent value="sources" className="min-w-0 space-y-4">
    <section className={`${boxClass} space-y-4`} aria-label="Проверка источников"><div><h3 className="font-semibold">Проверка источников</h3><p className="mt-1 text-sm text-muted-foreground">Проверка файла и предметная проверка ответов — разные этапы. Здесь показано состояние, подтверждённое сервером.</p></div>
      {check.isError && <ErrorBox message={errorMessage(check.error)} />}
      {!sources.length && <p className="text-sm text-muted-foreground">Нет источников для проверки.</p>}
      {sources.map(bank => {
        const result = checkResults[bank.source_id];
        const pending = !!pendingRuns[bank.source_id];
        const status = check.isPending && check.variables === bank.source_id ? "running" : checkFailures[bank.source_id] ? "error" : result?.status || bank.check_status;
        const source = officialSource(bank.source_url);
        return <div key={bank.source_id} className="min-w-0 space-y-2 border-t border-border pt-4"><h4 className="break-words text-sm font-medium">{bank.title}</h4>{source && <a href={source} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary underline underline-offset-4">Официальный источник<ExternalLink className="h-3.5 w-3.5" /></a>}<p role="status" className={`text-sm ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>{checkLabel(status)}</p><p className="text-xs text-muted-foreground">Последняя успешная проверка: {rtnDate(result?.last_success_at || bank.last_success_at, true)}</p>
          {pending ? <div className="flex flex-wrap items-center gap-2"><p className="text-xs text-muted-foreground">Результат появится после завершения проверки.</p><Button size="sm" variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>Обновить состояние</Button></div> : <Button size="sm" variant="outline" className="h-auto min-h-11 gap-2 whitespace-normal" disabled={!workspace.access.can_manage || !bank.can_manual_check || check.isPending} onClick={() => check.mutate(bank.source_id)}>{check.isPending && check.variables === bank.source_id ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <RefreshCw className="h-4 w-4 shrink-0" />}Проверить обновления сейчас</Button>}
        </div>;
      })}
    </section>
        <SettingsPanel organizationId={organizationId} initial={workspace.settings} canManage={workspace.access.can_manage} onSaved={() => void query.refetch()} />
        {view === "sources" && <RtnPersonalPreferences organizationId={organizationId} actorId={actorId} />}
      </TabsContent>
    </Tabs>
    <Dialog open={!!detail} onOpenChange={open => { if (!open) closeBank(); }}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle className="break-words pr-4">{detail?.code} {detail?.title}</DialogTitle><DialogDescription>Источник вопросов, готовность учебной редакции и история выпусков.</DialogDescription></DialogHeader>{detail && <div className="space-y-4 text-sm"><p>{keyLabel(detail)}</p><dl className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div><dt className="text-muted-foreground">Вопросов в программе</dt><dd>{bankQuestionCount(detail) ?? "Не подтверждено"}</dd></div><div><dt className="text-muted-foreground">Источник утверждён</dt><dd>{rtnDate(detail.approved_on)}</dd></div><div><dt className="text-muted-foreground">Дата применения</dt><dd>{applicationDate(detail.effective_from) ?? "Не подтверждена"}</dd></div><div><dt className="text-muted-foreground">Последняя успешная проверка</dt><dd>{rtnDate(detail.last_success_at, true)}</dd></div></dl>{workspace.settings.show_archived_releases && <ReleaseHistory bankId={detail.id} releases={workspace.archived_releases || []} />}{officialSource(detail.source_url) && <a className="inline-flex items-center gap-2 text-primary underline underline-offset-4" href={officialSource(detail.source_url)!} rel="noopener noreferrer" target="_blank">Открыть официальный источник<ExternalLink className="h-4 w-4" /></a>}<p className="text-muted-foreground">Официальная публикация вопросов не подтверждает правильные ответы. К обучению допускается только выпущенная редакция с проверенными ключами.</p><Button disabled={!workspace.access.can_assign || !canAssignRtnBank(detail)} onClick={() => { openAssign(detail); closeBank(); }}>Назначить обучение</Button></div>}</DialogContent></Dialog>
  </section>;
}

function AssignmentPanel({ organizationId, workspace, selectedBank, onSelectBank, onSaved, onOpenResults }: {
  organizationId: string; workspace: RtnWorkspace; selectedBank: string; onSelectBank: (id: string) => void; onSaved: () => void; onOpenResults: () => void;
}) {
  const [groupId, setGroupId] = useState("");
  const [students, setStudents] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const bank = workspace.banks.find(item => item.id === selectedBank);
  const assignable = workspace.banks.filter(canAssignRtnBank);
  const candidates = workspace.students.filter(student => (!groupId || (Array.isArray(student.group_ids) ? student.group_ids.includes(groupId) : student.group_id === groupId))
    && student.full_name.toLocaleLowerCase("ru").includes(studentSearch.toLocaleLowerCase("ru").trim()));
  const mutation = useMutation({ mutationFn: () => {
    if (!workspace.access.can_assign || !bank || !canAssignRtnBank(bank) || students.length === 0) throw new Error("Выберите выпущенную программу и учеников, доступных этой организации.");
    return assignRtnTraining({ organizationId, bankId: bank.id, studentIds: students, groupId: groupId || null });
  }, onSuccess: () => { setStudents([]); onSaved(); } });
  return <section className={`${boxClass} space-y-4`} aria-label="Назначение обучения"><h3 className="font-semibold">Назначить обучение</h3>
    {!workspace.access.can_assign && <p className="text-sm text-muted-foreground">Назначать обучение может сотрудник с правами на курсы и учеников организации.</p>}
    {!assignable.length && <p className="text-sm text-muted-foreground">Назначение появится после выпуска редакции с проверенными ответами. Непроверенный банк не назначается ученикам.</p>}
    <div className="grid min-w-0 gap-3 sm:grid-cols-2"><label className="min-w-0 space-y-1 text-sm"><span>Программа</span><select className={controlClass} value={selectedBank} disabled={!workspace.access.can_assign || mutation.isPending} onChange={event => { onSelectBank(event.target.value); mutation.reset(); }}><option value="">Выберите программу</option>{workspace.banks.map(item => <option key={item.id} value={item.id} disabled={!canAssignRtnBank(item)}>{item.code} {item.title}{!canAssignRtnBank(item) ? " — ответы проверяются" : ""}</option>)}</select></label><label className="min-w-0 space-y-1 text-sm"><span>Группа учеников</span><select className={controlClass} value={groupId} disabled={mutation.isPending} onChange={event => { setGroupId(event.target.value); setStudents([]); mutation.reset(); }}><option value="">Все группы</option>{workspace.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label></div>
    <label className="block space-y-1 text-sm"><span>Поиск ученика</span><input className={controlClass} value={studentSearch} onChange={event => setStudentSearch(event.target.value)} placeholder="Фамилия или имя" /></label>
    <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-2">{candidates.length ? candidates.map(student => <label key={student.id} className="flex min-w-0 cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted"><Checkbox checked={students.includes(student.id)} disabled={!workspace.access.can_assign || mutation.isPending} onCheckedChange={checked => { setStudents(previous => checked === true ? [...previous, student.id] : previous.filter(id => id !== student.id)); mutation.reset(); }} /><span className="min-w-0 break-words">{student.full_name}</span></label>) : <p className="p-2 text-sm text-muted-foreground">Ученики не найдены.</p>}</div>
    {mutation.isError && <ErrorBox message={errorMessage(mutation.error)} />}
    {mutation.isSuccess && <div className="space-y-2"><p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">Назначение сохранено. Программа появится в кабинете ученика; прежние попытки и результаты сохранены.</p><Button variant="outline" className="h-auto min-h-11 whitespace-normal" onClick={onOpenResults}>Посмотреть назначения и результаты</Button></div>}
    <Button className="h-auto min-h-10 gap-2 whitespace-normal" disabled={!workspace.access.can_assign || !bank || !canAssignRtnBank(bank) || !students.length || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}Назначить выбранным ({students.length})</Button>
  </section>;
}

function ReleaseHistory({ bankId, releases }: { bankId: string; releases: RtnReleaseMetadata[] }) {
  const history = releases.filter(release => release.bank_id === bankId);
  return <section className="space-y-3 border-t border-border pt-3" aria-label="История редакций"><h4 className="font-medium">История редакций</h4>{history.length ? history.map(release => <article key={release.release_id} className="space-y-1 rounded-lg border border-border p-3 text-xs"><p className="font-medium">{release.state === "current" ? "Действующая" : release.state === "scheduled" ? "Запланирована" : "Архивная"} · {confirmedQuestionCount(release.question_count) === null ? "Количество вопросов не подтверждено" : `${release.question_count} вопросов`}</p><p>{applicationDateLabel(release.effective_from)} · Выпуск {rtnDate(release.published_at, true)}</p><p className="break-all text-muted-foreground">Редакция: {release.release_id}</p>{officialSource(release.document_url) && <a className="inline-block text-primary underline underline-offset-4" href={officialSource(release.document_url)!} target="_blank" rel="noopener noreferrer">Документ источника</a>}</article>) : <p className="text-xs text-muted-foreground">Выпущенных редакций пока нет.</p>}</section>;
}

function ResultsPanel({ workspace }: { workspace: RtnWorkspace }) {
  return <section className={`${boxClass} space-y-4`} aria-label="Результаты обучения"><h3 className="font-semibold">Результаты обучения</h3>{!workspace.access.can_view_results ? <p className="text-sm text-muted-foreground">Для просмотра результатов нужны права на курсы и учеников организации.</p> : !workspace.results.length && <p className="text-sm text-muted-foreground">Завершённых попыток пока нет. После сдачи теста результат ученика появится здесь.</p>}{workspace.access.can_view_results && workspace.results.map(result => {
    const bank = workspace.banks.find(item => item.id === result.bank_id);
    const student = workspace.students.find(item => item.id === result.student_id);
    return <article key={result.attempt_id} className="min-w-0 space-y-2 border-t border-border pt-3"><h4 className="break-words text-sm font-medium">{result.student_name || student?.full_name || "Ученик"}</h4><p className="break-words text-sm">{result.title || (bank ? `${bank.code} ${bank.title}` : "Программа")}</p><p className="text-sm text-muted-foreground">{typeof result.score === "number" ? `Результат: ${result.score}%${typeof result.correct === "number" && typeof result.total === "number" ? ` · ${result.correct} из ${result.total}` : ""}` : "Оценка не указана"}{typeof result.passed === "boolean" ? result.passed ? " · Зачтено" : " · Не зачтено" : ""}</p><p className="break-all text-xs text-muted-foreground">Редакция: {result.release_id || "не указана"} · {rtnDate(result.submitted_at, true)}</p></article>;
  })}{workspace.access.can_view_results && workspace.assignments.length > 0 && <section className="space-y-3 border-t border-border pt-4" aria-label="Назначения программ"><h4 className="font-medium">Назначения ({workspace.assignments.length})</h4>{workspace.assignments.map(assignment => {
    const bank = workspace.banks.find(item => item.id === assignment.bank_id);
    const student = workspace.students.find(item => item.id === assignment.student_id);
    return <article key={assignment.id} className="space-y-1 rounded-lg border border-border p-3 text-sm"><p className="break-words font-medium">{assignment.student_name || student?.full_name || "Ученик"}</p><p className="break-words">{bank ? `${bank.code} ${bank.title}` : "Программа"}</p><p className="text-xs text-muted-foreground">Назначено: {rtnDate(assignment.assigned_at, true)}</p></article>;
  })}<p className="text-xs text-muted-foreground">Каждая попытка закрепляется за своей редакцией.</p></section>}</section>;
}

function SettingsPanel({ organizationId, initial, canManage, onSaved }: { organizationId: string; initial: RtnSettings; canManage: boolean; onSaved: () => void }) {
  const [draft, setDraft] = useState(initial);
  useEffect(() => setDraft(initial), [initial.notify_updates, initial.show_archived_releases]);
  const mutation = useMutation({ mutationFn: () => saveRtnSettings(organizationId, draft), onSuccess: saved => { setDraft(saved); onSaved(); } });
  const changed = draft.notify_updates !== initial.notify_updates || draft.show_archived_releases !== initial.show_archived_releases;
  return <section className={`${boxClass} space-y-4`} aria-label="Настройки Ростехнадзора"><h3 className="font-semibold">Настройки отображения</h3><p className="text-sm text-muted-foreground">Эти настройки действуют для организации: подсвечивают новые редакции и показывают историю. Они не включают личные уведомления, не меняют старые попытки и курсы организации.</p><label className="flex items-start gap-3 text-sm"><Checkbox checked={draft.notify_updates} disabled={!canManage || mutation.isPending} onCheckedChange={checked => { setDraft(value => ({ ...value, notify_updates: checked === true })); mutation.reset(); }} /><span>Подсвечивать новые редакции</span></label><label className="flex items-start gap-3 text-sm"><Checkbox checked={draft.show_archived_releases} disabled={!canManage || mutation.isPending} onCheckedChange={checked => { setDraft(value => ({ ...value, show_archived_releases: checked === true })); mutation.reset(); }} /><span>Показывать историю редакций</span></label>{mutation.isError && <ErrorBox message={errorMessage(mutation.error)} />}{mutation.isSuccess && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">Настройки сохранены</p>}<Button disabled={!canManage || !changed || mutation.isPending} onClick={() => mutation.mutate()} className="gap-2">{mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Сохранить настройки</Button></section>;
}
