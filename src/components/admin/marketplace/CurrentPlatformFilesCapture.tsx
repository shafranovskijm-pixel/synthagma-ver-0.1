import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { currentPlatformFileCapture } from "@/api/currentPlatformFileCapture";
import { currentPlatformFileFromReview, type CapturedCurrentPlatformFile } from "@/lib/currentPlatformFileCapture";
import type { PublicationReviewContext } from "@/lib/platformCoursePublication";
import { captureOfflineAuthRevision, captureOfflineContext, subscribeOfflineAuthRevision } from "@/utils/courseCache";

interface Props {
  context: PublicationReviewContext; scopeVersion: number; enabled: boolean;
  isCurrentContext: (context: PublicationReviewContext) => boolean;
  onRefresh: () => Promise<unknown>;
}
export function CurrentPlatformFilesCapture({ context, scopeVersion, enabled, isCurrentContext, onRefresh }: Props) {
  const auth = useAuth();
  const authRevision = useSyncExternalStore(subscribeOfflineAuthRevision, captureOfflineAuthRevision, captureOfflineAuthRevision);
  const [epoch, setEpoch] = useState(0);
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");
  const key = JSON.stringify([context.actorId, context.marketplaceId, context.courseId, context.currentEditionSha256,
    scopeVersion, enabled, auth.user?.id, auth.userRole, auth.loading, auth.authError, authRevision, visible, epoch]);
  const scopeRef = useRef({ key, context, valid: true });
  if (scopeRef.current.key !== key || scopeRef.current.context !== context || !scopeRef.current.valid)
    scopeRef.current = { key, context, valid: true };
  const scope = scopeRef.current;
  const mounted = useRef(false);
  const active = useRef<{ scope: typeof scope; abort: AbortController } | null>(null);
  const [snapshot, setSnapshot] = useState<{ scope: typeof scope; state: "loading" | "held" | "confirmed"; receipt?: CapturedCurrentPlatformFile } | null>(null);
  const current = () => mounted.current && scopeRef.current === scope && scope.valid && enabled && visible
    && !auth.loading && !auth.authError && auth.userRole === "admin" && auth.user?.id === context.actorId
    && captureOfflineContext()?.actorId === context.actorId && captureOfflineAuthRevision() === authRevision && isCurrentContext(context);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; active.current?.abort.abort(); active.current = null; };
  }, []);
  useEffect(() => {
    const invalidate = () => {
      scopeRef.current.valid = false; active.current?.abort.abort(); active.current = null;
      setEpoch(value => value + 1);
    };
    const visibility = () => { invalidate(); setVisible(document.visibilityState === "visible"); };
    const unsubscribe = subscribeOfflineAuthRevision(invalidate);
    window.addEventListener("focus", invalidate); document.addEventListener("visibilitychange", visibility);
    return () => { unsubscribe(); window.removeEventListener("focus", invalidate); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  useEffect(() => {
    // A newly rendered actor/context/edition never reuses an old in-flight action.
    if (active.current && active.current.scope !== scope) { active.current.abort.abort(); active.current = null; }
    return () => { if (active.current?.scope === scope) { active.current.abort.abort(); active.current = null; } };
  }, [scope]);
  const state = snapshot?.scope === scope && scope.valid ? snapshot.state : null;
  const allowed = enabled && visible && !auth.loading && !auth.authError && auth.userRole === "admin"
    && auth.user?.id === context.actorId && captureOfflineContext()?.actorId === context.actorId
    && captureOfflineAuthRevision() === authRevision && isCurrentContext(context);
  const capture = async (kind: "course_document" | "lesson_attachment", referenceId: string) => {
    if (!current() || active.current) return;
    const request = { scope, abort: new AbortController() }; active.current = request;
    setSnapshot({ scope, state: "loading" });
    try {
      const selection = currentPlatformFileFromReview(context, kind, referenceId);
      const receipt = await currentPlatformFileCapture.capture(selection, crypto.randomUUID(), request.abort.signal,
        () => current() && active.current === request);
      if (current() && active.current === request) setSnapshot({ scope, state: "confirmed", receipt });
    } catch {
      if (current() && active.current === request) setSnapshot({ scope, state: "held" });
    } finally { if (active.current === request) active.current = null; }
  };
  const references = context.currentSource.fileBindings;
  if (!references.length) return null;
  return <section className="space-y-2 rounded-lg border p-3" aria-label="Фиксация текущих файлов">
    <h4 className="text-sm font-semibold">Текущие файлы для новой редакции</h4>
    <p className="text-xs text-muted-foreground">Создаётся отдельная копия байтов файла. Досье, методическая готовность и выпуск подтверждаются отдельно.</p>
    <p className="text-xs text-muted-foreground">Фиксация снимает текущую отметку проверки собственного курса в каталоге: потребуется новое досье и отдельное решение.</p>
    <div className="space-y-2">{references.map((ref, index) => <div key={ref.kind + ":" + ref.referenceId + ":" + index} className="space-y-1">
      <p className="text-xs text-muted-foreground">{ref.kind === "course_document" ? "Документ" : "Вложение"} {index + 1}</p>
      <Button type="button" variant="outline" size="sm" disabled={!allowed || state === "loading"}
        onClick={() => void capture(ref.kind, ref.referenceId)}>Зафиксировать текущий файл для новой редакции</Button>
    </div>)}</div>
    {state === "loading" && <p role="status" className="text-sm text-muted-foreground">Фиксирую файл и повторно проверяю сохранённые байты…</p>}
    {state === "held" && <p role="status" className="text-sm text-muted-foreground">Фиксация не подтверждена. Обновите состояние. Пока поддержаны только файлы, прикреплённые прямо к курсу; для документа из хранилища нужна точная версия.</p>}
    {state === "confirmed" && <div className="space-y-2">
      <p role="status" className="text-sm text-muted-foreground">Копия файла сохранена и подтверждена повторным чтением сервера. Создайте новое досье после обновления состояния. Готовность программы и выпуск ещё не подтверждены.</p>
      <Button type="button" variant="outline" size="sm" disabled={!allowed} onClick={() => { if (current()) void onRefresh(); }}>Обновить состояние досье</Button>
    </div>}
  </section>;
}
