import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Локальный draft-автосохранение для урока в редакторе.
 * Защищает от потери данных при закрытии вкладки/обрыве сети.
 *
 * Хранит снапшот в localStorage с TTL 7 дней.
 * При открытии того же урока возвращает draft, если он новее, чем lesson.updated_at
 * (в текущей упрощённой версии — просто возвращаем при наличии).
 */

const STORAGE_PREFIX = "lesson-draft:";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней

interface DraftSnapshot<T> {
  data: T;
  savedAt: number;
}

export function useLessonDraft<T>(lessonKey: string | null, current: T, isOpen: boolean) {
  const [hasDraft, setHasDraft] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const lastSavedRef = useRef<string>("");

  // Detect existing draft on open
  useEffect(() => {
    if (!isOpen || !lessonKey) {
      setHasDraft(false);
      setDraftSavedAt(null);
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + lessonKey);
      if (!raw) return;
      const snap = JSON.parse(raw) as DraftSnapshot<T>;
      if (Date.now() - snap.savedAt > TTL_MS) {
        localStorage.removeItem(STORAGE_PREFIX + lessonKey);
        return;
      }
      setHasDraft(true);
      setDraftSavedAt(snap.savedAt);
    } catch {
      // ignore corrupted draft
    }
  }, [isOpen, lessonKey]);

  // Debounced save
  useEffect(() => {
    if (!isOpen || !lessonKey) return;
    const serialized = JSON.stringify(current);
    if (serialized === lastSavedRef.current) return;
    const timer = window.setTimeout(() => {
      try {
        const snap: DraftSnapshot<T> = { data: current, savedAt: Date.now() };
        localStorage.setItem(STORAGE_PREFIX + lessonKey, JSON.stringify(snap));
        lastSavedRef.current = serialized;
        setDraftSavedAt(snap.savedAt);
        setHasDraft(true);
      } catch {
        // quota exceeded — silently ignore
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [current, isOpen, lessonKey]);

  // beforeunload warning if there are unsaved changes
  useEffect(() => {
    if (!isOpen || !lessonKey) return;
    const handler = (e: BeforeUnloadEvent) => {
      const serialized = JSON.stringify(current);
      if (serialized !== lastSavedRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isOpen, lessonKey, current]);

  const restoreDraft = useCallback((): T | null => {
    if (!lessonKey) return null;
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + lessonKey);
      if (!raw) return null;
      const snap = JSON.parse(raw) as DraftSnapshot<T>;
      return snap.data;
    } catch {
      return null;
    }
  }, [lessonKey]);

  const discardDraft = useCallback(() => {
    if (!lessonKey) return;
    try {
      localStorage.removeItem(STORAGE_PREFIX + lessonKey);
      lastSavedRef.current = "";
      setHasDraft(false);
      setDraftSavedAt(null);
    } catch {
      // ignore
    }
  }, [lessonKey]);

  return { hasDraft, draftSavedAt, restoreDraft, discardDraft };
}
