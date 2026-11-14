import { useEffect, useRef, useState } from "react";
import { getRtnAttempt, hydrateRtnAttempt, RtnApiError, saveRtnAttemptDraft } from "@/api/rostechnadzor";
import type { RtnAnswers, RtnAttempt } from "@/types/rostechnadzor";

// Empty selections are not edits. Stable ordering also makes an uncertain save
// retry byte-identical while a newer local selection waits behind it.
export function canonicalDraft(answers: RtnAnswers): RtnAnswers {
  return Object.fromEntries(Object.keys(answers).sort().filter(id => answers[id].length)
    .map(id => [id, [...answers[id]].sort()]));
}

export function useRtnDraftSync(input: {
  initial: RtnAttempt; answers: RtnAnswers; enabled: boolean;
  onReplace: (attempt: RtnAttempt) => void; onSubmitted: (attempt: RtnAttempt) => void;
}) {
  const callbacks = useRef(input);
  callbacks.current = input;
  const latest = useRef(canonicalDraft(input.answers));
  latest.current = canonicalDraft(input.answers);
  const confirmed = useRef(JSON.stringify(canonicalDraft(input.initial.answers || {})));
  const revision = useRef(input.initial.draft_revision || 0);
  const pending = useRef<{ answers: RtnAnswers; revision: number } | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const failure = useRef<unknown>(null);
  const [state, setState] = useState<"saved" | "saving" | "error" | "conflict">("saved");
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  const value = JSON.stringify(latest.current);
  const dirty = value !== confirmed.current;

  useEffect(() => {
    if (!input.enabled || (!dirty && state !== "saving" && state !== "error" && state !== "conflict")) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [input.enabled, dirty, state]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function send() {
    if (!mounted.current || busy.current || failure.current || !callbacks.current.enabled) return;
    if (!pending.current && JSON.stringify(latest.current) === confirmed.current) return;
    pending.current ||= { answers: structuredClone(latest.current), revision: revision.current };
    const payload = pending.current;
    busy.current = true;
    setState("saving");
    try {
      const saved = await saveRtnAttemptDraft(input.initial.attempt_id, payload.answers, payload.revision);
      if (!mounted.current) return;
      if (saved.status === "submitted") {
        const final = await getRtnAttempt(input.initial.attempt_id);
        if (!mounted.current) return;
        if (final.status !== "submitted") throw new RtnApiError("invalid_response", "Не удалось подтвердить отправленный результат.");
        pending.current = null;
        callbacks.current.onSubmitted(final);
      } else {
        if (JSON.stringify(canonicalDraft(saved.answers)) !== JSON.stringify(payload.answers) || saved.revision < payload.revision) {
          throw new RtnApiError("invalid_response", "Сервер не подтвердил сохранение выбранных ответов.");
        }
        confirmed.current = JSON.stringify(payload.answers);
        revision.current = saved.revision;
        pending.current = null;
      }
      setState("saved");
      setError(null);
    } catch (reason) {
      if (!mounted.current) return;
      failure.current = reason;
      setError(reason);
      setState(reason instanceof RtnApiError && reason.code === "conflict" ? "conflict" : "error");
    } finally {
      busy.current = false;
      if (mounted.current) setTick(value => value + 1);
    }
  }

  useEffect(() => {
    if (!input.enabled || busy.current || failure.current || value === confirmed.current) return;
    const timer = window.setTimeout(() => void send(), 500);
    return () => window.clearTimeout(timer);
    // Re-evaluate only when the actual answers or a completed request change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, input.enabled, tick]);

  function retry() {
    if (busy.current) return;
    failure.current = null;
    setError(null);
    void send();
  }

  async function reload() {
    if (busy.current) return;
    busy.current = true;
    setState("saving");
    try {
      const loaded = await hydrateRtnAttempt(await getRtnAttempt(input.initial.attempt_id));
      if (!mounted.current) return;
      latest.current = canonicalDraft(loaded.answers || {});
      confirmed.current = JSON.stringify(latest.current);
      revision.current = loaded.draft_revision || 0;
      pending.current = null;
      failure.current = null;
      setError(null);
      if (loaded.status === "submitted") callbacks.current.onSubmitted(loaded);
      else callbacks.current.onReplace(loaded);
      setState("saved");
    } catch (reason) {
      if (!mounted.current) return;
      failure.current = reason;
      setError(reason);
      setState("conflict");
    } finally {
      busy.current = false;
      if (mounted.current) setTick(value => value + 1);
    }
  }
  return { state, error, retry, reload, dirty };
}
