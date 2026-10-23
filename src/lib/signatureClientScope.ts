import { supabase } from '@/integrations/supabase/client';
import { captureDocumentOutputFence } from '@/lib/documents/outputFence';
import { captureOfflineContext } from '@/utils/courseCache';

export interface SignatureReadOptions { assertCurrent?: () => void; signal?: AbortSignal }
export function captureSignatureRead(options: SignatureReadOptions = {}) {
  const fence = captureDocumentOutputFence(), deadline = performance.now() + 45000;
  const actorId = captureOfflineContext()?.actorId ?? null;
  const active = () => {
    fence(); options.assertCurrent?.();
    if (options.signal?.aborted) throw new Error('Чтение документа отменено.');
    if (performance.now() >= deadline) throw new Error('Не удалось дождаться документа. Повторите чтение.');
  };
  const wait = async <T>(request: PromiseLike<T>): Promise<T> => {
    active(); let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    try {
      const value = await Promise.race([Promise.resolve(request), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Не удалось дождаться документа. Повторите чтение.')), Math.max(0, deadline - performance.now()));
        abort = () => reject(new Error('Чтение документа отменено.'));
        options.signal?.addEventListener('abort', abort, { once: true });
      })]); active(); return value;
    } finally { if (timer !== undefined) clearTimeout(timer); if (abort) options.signal?.removeEventListener('abort', abort); }
  };
  return { active, wait, actorId };
}

/** Verify the captured token, then pin it on each request; never mutate the shared SDK headers. */
export async function signatureAuthorization(read: ReturnType<typeof captureSignatureRead>, requireUser = true) {
  read.active();
  const session = await read.wait(supabase.auth.getSession()); read.active();
  const original = session.data.session;
  if (session.error || (!original && requireUser)) throw new Error('Требуется авторизация.');
  if ((original?.user.id ?? null) !== read.actorId) throw new Error('Доступ изменился. Откройте документ заново.');
  if (!original) {
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!key) throw new Error('Не удалось проверить доступ.');
    return { bearer: `Bearer ${key}`, user: null };
  }
  read.active(); const verified = await read.wait(supabase.auth.getUser(original.access_token)); read.active();
  if (verified.error || verified.data.user?.id !== original.user.id) throw new Error('Не удалось проверить доступ.');
  return { bearer: `Bearer ${original.access_token}`, user: verified.data.user };
}
