/**
 * Diagnostics utility — runs 4 independent network probes to detect
 * which class of requests is blocked by corporate firewall / antivirus.
 *
 * Each check is independent (Promise.allSettled) so one failure does not
 * cancel others. Timeout per probe — 7 s.
 */

export type ProbeStatus = 'pending' | 'ok' | 'blocked' | 'slow' | 'error';

export type ProbeId = 'internet' | 'api' | 'edge' | 'storage' | 'cloudflare' | 'kinescope';

export interface ProbeResult {
  id: ProbeId;
  label: string;
  status: ProbeStatus;
  durationMs: number;
  detail?: string;
}

const TIMEOUT_MS = 7000;

async function timedFetch(url: string, init?: RequestInit): Promise<{ ok: boolean; status?: number; ms: number; error?: string }> {
  const start = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' });
    return { ok: res.ok || res.status === 204 || res.status === 401, status: res.status, ms: Math.round(performance.now() - start) };
  } catch (err) {
    return { ok: false, ms: Math.round(performance.now() - start), error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// An image does not require the CORS header that this public icon does not send.
// Its availability is connectivity evidence, not proof of video playback.
function probeKinescopeResource(): Promise<ProbeResult> {
  const start = performance.now();
  return new Promise(resolve => {
    const image = new Image();
    let settled = false;
    const finish = (status: ProbeStatus, detail: string) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      image.onload = null; image.onerror = null; image.removeAttribute('src');
      resolve({ id: 'kinescope', label: 'Видео-сервис (Kinescope)', status,
        durationMs: Math.round(performance.now() - start), detail });
    };
    const timer = setTimeout(() => finish('error', 'Контрольный ресурс не загрузился за 7 секунд. Доступность плеера не подтверждена.'), TIMEOUT_MS);
    image.onload = () => finish(performance.now() - start > 4000 ? 'slow' : 'ok',
      'Контрольный ресурс провайдера доступен. Запуск видео проверяется отдельно.');
    image.onerror = () => finish('error', 'Не удалось загрузить контрольный ресурс провайдера. Это не устанавливает причину ошибки видео.');
    image.src = 'https://kinescope.io/favicon.ico';
  });
}

function getInternetProbeUrl() {
  const url = new URL('/robots.txt', window.location.origin);
  url.searchParams.set('_probe', Date.now().toString());
  return url.toString();
}

export async function runConnectionDiagnostics(): Promise<ProbeResult[]> {
  const probes: Promise<ProbeResult>[] = [
    // 1. Базовая доступность сайта. Проверяем same-origin статический файл,
    // чтобы не ловить ложные срабатывания из-за no-cors/opaque-ответов.
    timedFetch(getInternetProbeUrl(), {
      method: 'GET',
      headers: { 'cache-control': 'no-cache' },
    }).then((r): ProbeResult => ({
      id: 'internet',
      label: 'Интернет-соединение',
      status: r.ok ? (r.ms > 3000 ? 'slow' : 'ok') : 'blocked',
      durationMs: r.ms,
      detail: r.error ?? `${r.ms} мс${navigator.onLine ? '' : ' • браузер сообщает offline'}`,
    })).catch((e): ProbeResult => ({ id: 'internet', label: 'Интернет-соединение', status: 'blocked', durationMs: 0, detail: String(e) })),

    // 2. Главный API Sintagma (Supabase REST/Auth health)
    timedFetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } }).then((r): ProbeResult => ({
      id: 'api',
      label: 'Серверы Sintagma (база данных, авторизация)',
      status: r.ok ? (r.ms > 4000 ? 'slow' : 'ok') : 'blocked',
      durationMs: r.ms,
      detail: r.error ?? `HTTP ${r.status ?? '—'} • ${r.ms} мс`,
    })).catch((e): ProbeResult => ({ id: 'api', label: 'Серверы Sintagma', status: 'blocked', durationMs: 0, detail: String(e) })),

    // 3. Edge-функции (тесты, ИИ, выдача результатов)
    timedFetch(`${SUPABASE_URL}/functions/v1/health-check`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    }).then((r): ProbeResult => ({
      id: 'edge',
      label: 'Серверные функции (проверка тестов, ИИ)',
      status: r.ok ? (r.ms > 4000 ? 'slow' : 'ok') : 'blocked',
      durationMs: r.ms,
      detail: r.error ?? `HTTP ${r.status ?? '—'} • ${r.ms} мс`,
    })).catch((e): ProbeResult => ({ id: 'edge', label: 'Серверные функции', status: 'blocked', durationMs: 0, detail: String(e) })),

    // 4. Storage (картинки, материалы, видео)
    timedFetch(`${SUPABASE_URL}/storage/v1/object/public/course-files/__nonexistent__.txt`).then((r): ProbeResult => ({
      id: 'storage',
      label: 'Хранилище файлов (материалы, видео, картинки)',
      // 400/404 — это «всё работает, файла нет», а блок — это сетевая ошибка
      status: r.status !== undefined ? (r.ms > 4000 ? 'slow' : 'ok') : 'blocked',
      durationMs: r.ms,
      detail: r.error ?? `HTTP ${r.status ?? '—'} • ${r.ms} мс`,
    })).catch((e): ProbeResult => ({ id: 'storage', label: 'Хранилище файлов', status: 'blocked', durationMs: 0, detail: String(e) })),

    // 5. Cloudflare — независимый эталон, чтобы понять, есть ли вообще выход в мир
    timedFetch('https://cloudflare.com/cdn-cgi/trace', { method: 'GET' }).then((r): ProbeResult => ({
      id: 'cloudflare',
      label: 'Сторонний эталон (Cloudflare)',
      status: r.status !== undefined ? (r.ms > 4000 ? 'slow' : 'ok') : 'blocked',
      durationMs: r.ms,
      detail: r.error ?? `HTTP ${r.status ?? '—'} • ${r.ms} мс`,
    })).catch((e): ProbeResult => ({ id: 'cloudflare', label: 'Сторонний эталон', status: 'blocked', durationMs: 0, detail: String(e) })),

    // 6. Kinescope — для жалоб на видео
    probeKinescopeResource(),
  ];

  const settled = await Promise.allSettled(probes);
  const ids: ProbeId[] = ['internet', 'api', 'edge', 'storage', 'cloudflare', 'kinescope'];
  return settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value;
    return { id: ids[i], label: 'Проверка', status: 'error', durationMs: 0, detail: String(s.reason) };
  });
}

/** Сводка для пользователя: общий вердикт + рекомендация. */
export function summarizeDiagnostics(results: ProbeResult[]): { headline: string; advice: string; severity: 'ok' | 'warn' | 'error' } {
  const blockedIds = results.filter(r => r.status === 'blocked').map(r => r.id);
  const slowCount = results.filter(r => r.status === 'slow').length;
  const incomplete = results.some(r => r.status === 'error' || r.status === 'pending');

  if (blockedIds.length === 0 && slowCount === 0 && !incomplete) {
    return { headline: 'Проверяемые серверы доступны', advice: 'Соединение установлено. Эта проверка не подтверждает прохождение тестов или воспроизведение видео. Если проблема повторяется — обратитесь в поддержку.', severity: 'ok' };
  }

  if (blockedIds.includes('internet')) {
    return {
      headline: 'Нет доступа в интернет',
      advice: 'Проверьте Wi-Fi или подключение к корпоративной сети. Попробуйте открыть любой сайт.',
      severity: 'error',
    };
  }

  if (blockedIds.includes('edge') || blockedIds.includes('api')) {
    return {
      headline: 'Сервер платформы недоступен',
      advice:
        'Запросы к серверу платформы не завершились. Причина этой проверкой не установлена. Скачайте отчёт и передайте в поддержку; настройки защиты менять не требуется.',
      severity: 'error',
    };
  }

  if (incomplete) {
    return { headline: 'Проверка соединения неполная', advice: 'Доступность части ресурсов не подтверждена. Проверьте проблемное действие в своём кабинете и передайте отчёт в поддержку.', severity: 'warn' };
  }

  if (slowCount > 0) {
    return {
      headline: 'Медленное соединение',
      advice: 'Соединение работает, но скорость низкая. Возможны задержки при загрузке тестов и видео. Попробуйте перезагрузить страницу или подключиться через другую сеть.',
      severity: 'warn',
    };
  }

  return { headline: 'Часть функций недоступна', advice: 'Не все серверы доступны. Передайте отчёт в поддержку.', severity: 'warn' };
}

/** Формирует текст отчёта для скачивания / отправки в поддержку. */
export function buildDiagnosticsReport(results: ProbeResult[], deviceReport?: string): string {
  const lines: string[] = [];
  lines.push('=== Отчёт о соединении с Sintagma ===');
  lines.push(`Дата: ${new Date().toLocaleString('ru-RU')}`);
  lines.push(`URL: ${window.location.href}`);
  lines.push(`Online (по данным браузера): ${navigator.onLine ? 'да' : 'нет'}`);
  lines.push('');
  lines.push('--- Результаты проверок ---');
  for (const r of results) {
    const status = { ok: 'OK', blocked: 'БЛОКИРОВАН', slow: 'МЕДЛЕННО', error: 'ОШИБКА', pending: '...' }[r.status];
    lines.push(`[${status}] ${r.label} (${r.durationMs} мс) — ${r.detail ?? ''}`);
  }
  lines.push('');
  if (deviceReport) {
    lines.push(deviceReport);
    lines.push('');
  }
  lines.push('--- Рекомендация для системного администратора ---');
  lines.push('Добавьте в исключения антивируса / firewall следующие домены:');
  lines.push('  • sintagma.com.ru');
  lines.push('  • *.sintagma.com.ru');
  lines.push('  • *.supabase.co');
  lines.push('  • *.functions.supabase.co');
  lines.push('  • *.kinescope.io (видео)');
  return lines.join('\n');
}
