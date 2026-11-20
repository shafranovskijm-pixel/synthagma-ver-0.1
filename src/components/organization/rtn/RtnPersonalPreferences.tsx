import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RtnApiError } from "@/api/rostechnadzor";
import { getMyRtnSubscription, saveMyRtnSubscription, notifyRtnPersonalRefresh } from "@/api/rtn-personal-notifications";
import type { RtnPreferenceEnvelope, RtnPersonalScope } from "@/types/rtn-personal-notifications";
import type { RtnUpdateKind } from "@/types/rtn-updates";
import { rtnUpdateBox } from "./RtnUpdatePresentation";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kindLabel: Record<RtnUpdateKind, string> = { news: "Новости официального сайта", source_change: "Изменения источников вопросов", bank_release: "Выпуски учебных редакций" };
const topicLabel = (topic: string) => ({ general: "Общие новости Ростехнадзора", "industrial-safety": "Промышленная безопасность", energy_supervision_knowledge_check: "Энергонадзор — проверка знаний" }[topic] || topic);
const equal = (a: string[], b: string[]) => a.length === b.length && a.every(v => b.includes(v));
function Preferences({ scope }: { scope: RtnPersonalScope }) {
  const [data, setData] = useState<RtnPreferenceEnvelope | null>(null), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null), [conflict, setConflict] = useState(false), [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState<{ enabled: boolean; topics: string[]; kinds: RtnUpdateKind[] }>({ enabled: false, topics: [], kinds: [] });
  const epoch = useRef(0), generation = useRef(0), busy = useRef(false);
  const apply = (value: RtnPreferenceEnvelope) => {
    if (value.subscription.generation < generation.current) throw new RtnApiError("conflict", "Получена прежняя версия настроек. Обновите раздел.");
    generation.current = value.subscription.generation; setData(value);
    setDraft({ enabled: value.subscription.enabled, topics: value.subscription.topics.filter(v => value.options.topics.includes(v)), kinds: value.subscription.kinds });
  };
  const load = async () => {
    const current = ++epoch.current; setLoading(true); setError(null); setSaved(false);
    try { const value = await getMyRtnSubscription(scope); if (current === epoch.current) { apply(value); setConflict(false); } }
    catch (e) { if (current === epoch.current) { setError(e); setData(null); } }
    finally { if (current === epoch.current) setLoading(false); }
  };
  useEffect(() => { void load(); return () => { epoch.current++; }; }, []);
  const save = async () => {
    if (!data || busy.current || conflict) return;
    busy.current = true; const current = epoch.current; setSaving(true); setError(null); setSaved(false);
    try {
      const value = await saveMyRtnSubscription(scope, { ...draft, expectedGeneration: data.subscription.generation });
      if (current === epoch.current) { apply(value); setSaved(true); notifyRtnPersonalRefresh(scope, value.subscription.generation); }
    } catch (e) { if (current === epoch.current) { setError(e); setConflict(e instanceof RtnApiError && e.code === "conflict"); } }
    finally { if (current === epoch.current) { setSaving(false); busy.current = false; } }
  };
  const changed = data && (draft.enabled !== data.subscription.enabled || !equal(draft.topics, data.subscription.topics) || !equal(draft.kinds, data.subscription.kinds));
  const invalid = draft.enabled && (!draft.topics.length || !draft.kinds.length);
  const patch = (value: Partial<typeof draft>) => { setDraft(previous => ({ ...previous, ...value })); setSaved(false); };
  return <section className={`${rtnUpdateBox} space-y-4`} aria-label="Мои уведомления Ростехнадзора">
    <h3 className="font-semibold">Мои уведомления</h3><p className="text-sm text-muted-foreground">Только для вашей учётной записи в этой организации. Новые события появятся в существующем колокольчике после проверки; это не мгновенные push-уведомления и не email-рассылка.</p>
    {loading ? <p role="status" className="text-sm text-muted-foreground">Проверяем ваши настройки…</p> : <>
      {error && <div role="alert" className="space-y-2"><p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "Личные настройки не подтверждены."}</p><Button variant="outline" className="min-h-10" disabled={saving} onClick={() => void load()}>{conflict ? "Загрузить актуальные настройки" : "Повторить загрузку настроек"}</Button></div>}
      {data && <>
        {data.subscription.needs_reconfiguration && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">Прежний выбор больше не доступен. Выберите направления заново; до сохранения доставка не включена.</p>}
        <label className="flex min-h-10 items-center gap-3 text-sm"><Checkbox checked={draft.enabled} disabled={saving || conflict} onCheckedChange={v => patch({ enabled: v === true })} /><span>Получать уведомления в колокольчике</span></label>
        <fieldset disabled={saving || conflict} className="min-w-0 space-y-2"><legend className="mb-2 text-sm font-medium">Направления</legend>{data.options.topics.map(topic => <label key={topic} className="flex min-h-10 items-center gap-3 text-sm"><Checkbox checked={draft.topics.includes(topic)} onCheckedChange={v => patch({ topics: v === true ? [...draft.topics, topic] : draft.topics.filter(t => t !== topic) })} /><span className="min-w-0 break-words">{topicLabel(topic)}</span></label>)}</fieldset>
        <fieldset disabled={saving || conflict} className="space-y-2"><legend className="mb-2 text-sm font-medium">Какие изменения получать</legend>{data.options.kinds.map(kind => <label key={kind} className="flex min-h-10 items-center gap-3 text-sm"><Checkbox checked={draft.kinds.includes(kind)} onCheckedChange={v => patch({ kinds: v === true ? [...draft.kinds, kind] : draft.kinds.filter(k => k !== kind) })} /><span>{kindLabel[kind]}</span></label>)}</fieldset>
        {invalid && <p role="status" className="text-sm text-muted-foreground">Для включения выберите хотя бы одно направление и один вид изменений.</p>}
        {saved && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{data.subscription.effective_enabled ? "Личные уведомления включены для будущих событий. Старые публикации не рассылаются." : "Новые уведомления отключены. Уже полученные останутся в истории."}</p>}
        <Button className="h-auto min-h-10 whitespace-normal" disabled={!changed || invalid || saving || conflict} onClick={() => void save()}>{saving ? "Сохраняем…" : "Сохранить мои уведомления"}</Button>
      </>}
    </>}
  </section>;
}
export function RtnPersonalPreferences({ organizationId, actorId }: RtnPersonalScope) {
  if (!UUID.test(organizationId) || !UUID.test(actorId)) return null;
  return <Preferences key={`${actorId}:${organizationId}`} scope={{ organizationId, actorId }} />;
}
