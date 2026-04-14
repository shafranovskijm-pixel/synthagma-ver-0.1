/**
 * Safe wrapper around supabase.functions.invoke with automatic retry
 * for network-level blocks (antivirus / VPN / extensions).
 *
 * Usage — drop-in replacement:
 *   const { data, error } = await safeInvoke("my-function", { body: { ... } });
 */

import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  isBlockedBySecuritySoftware,
  markBlockDetected,
  wasBlockAlreadyShown,
} from './networkErrorDetector';

const RETRY_DELAYS = [0, 2000, 5000]; // immediate, 2 s, 5 s
const MAX_RETRIES = 3;

interface SafeInvokeOptions {
  body?: unknown;
  headers?: Record<string, string>;
}

interface SafeInvokeResult<T = unknown> {
  data: T | null;
  error: Error | null;
}

export async function safeInvoke<T = unknown>(
  functionName: string,
  options?: SafeInvokeOptions,
): Promise<SafeInvokeResult<T>> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Wait before retry (skip for first attempt)
    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt] ?? 5000;
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: options?.body,
        headers: options?.headers,
      });

      if (error) {
        // Check if this is a network-level block vs a real HTTP error
        const blockCheck = isBlockedBySecuritySoftware(error);
        if (blockCheck.blocked) {
          lastError = new Error(blockCheck.userMessage);
          console.warn(`[safeInvoke] ${functionName} blocked (attempt ${attempt + 1}):`, blockCheck.technicalReason);
          continue; // retry
        }
        // HTTP error (4xx, 5xx) — do NOT retry, return immediately
        return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
      }

      return { data: data as T, error: null };
    } catch (err: unknown) {
      const blockCheck = isBlockedBySecuritySoftware(err);
      if (blockCheck.blocked) {
        lastError = new Error(blockCheck.userMessage);
        console.warn(`[safeInvoke] ${functionName} blocked (attempt ${attempt + 1}):`, blockCheck.technicalReason);
        continue; // retry
      }
      // Non-block exception — return immediately
      return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  // All retries exhausted — show persistent warning
  if (!wasBlockAlreadyShown()) {
    markBlockDetected();
    toast.error(
      'Обнаружена блокировка сетевых запросов. Добавьте сайт в исключения антивируса/VPN и перезагрузите страницу.',
      { duration: 15000 },
    );
  }

  return { data: null, error: lastError };
}

/**
 * Safe wrapper for direct fetch() calls (e.g. ElevenLabs TTS).
 * Retries on network-level blocks, returns Response on success.
 */
export async function safeFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt] ?? 5000;
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      const response = await fetch(url, init);
      return response; // Even 4xx/5xx — let caller handle HTTP status
    } catch (err: unknown) {
      const blockCheck = isBlockedBySecuritySoftware(err);
      if (blockCheck.blocked) {
        lastError = new Error(blockCheck.userMessage);
        console.warn(`[safeFetch] blocked (attempt ${attempt + 1}):`, blockCheck.technicalReason);
        continue;
      }
      throw err; // Non-block error — throw immediately
    }
  }

  // All retries exhausted
  if (!wasBlockAlreadyShown()) {
    markBlockDetected();
    toast.error(
      'Обнаружена блокировка сетевых запросов. Добавьте сайт в исключения антивируса/VPN и перезагрузите страницу.',
      { duration: 15000 },
    );
  }

  throw lastError ?? new Error('Запрос заблокирован');
}
