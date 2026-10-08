/** Product scope of the first Android release. Web routes and server access are unchanged. */
export const NATIVE_LEARNER_SCOPE = 'Первый выпуск для ученика: назначенные курсы, уроки, тесты, результаты, документы и настройки своего аккаунта. Чаты, вебинары и управление организацией доступны в веб-версии.';
export const NATIVE_PROFILE_SECTIONS = ['profile', 'notifications', 'documents'] as const;
export const SINTAGMA_WEB_ORIGIN = 'https://xn--80aaiswd0ak.xn--p1ai';

type ScopeLocation = { pathname: string; search: string };
export type NativeScopeDecision =
  | { allowed: true }
  | { allowed: false; destination: string; reason: string };

const withSearch = (path: string, params: URLSearchParams) => path + (params.size ? `?${params}` : '');
export function isNativeLearnerPage(path: string): boolean {
  return path === '/student' || path === '/student/profile' || /^\/(course\/[^/]+\/learn|learning\/[^/]+)$/.test(path);
}

export function nativeLearnerRoute(location: ScopeLocation, role?: string | null): NativeScopeDecision {
  const path = location.pathname;
  const params = new URLSearchParams(location.search);
  const learnerPage = isNativeLearnerPage(path);
  if (learnerPage && role && role !== 'student') {
    return { allowed: false, destination: '/account', reason: 'В первой версии приложения доступен кабинет ученика. Управление организацией открывается на сайте; настройки вашего аккаунта доступны здесь.' };
  }
  if (path === '/student' || path === '/student/profile') {
    // Inspect every value: an ambiguous repeated parameter must never mount a chat.
    if (params.getAll('tab').some(tab => !['catalog', 'profile', 'store', 'library'].includes(tab))) {
      params.delete('tab');
      params.delete('section');
      return { allowed: false, destination: withSearch('/student', params), reason: 'Чаты доступны в веб-версии. В приложении можно продолжить обучение.' };
    }
    if (params.getAll('section').some(section => !(NATIVE_PROFILE_SECTIONS as readonly string[]).includes(section))) {
      params.delete('section');
      params.set('tab', 'profile');
      return { allowed: false, destination: withSearch('/student', params), reason: 'Этот раздел профиля доступен в веб-версии. Личные настройки и документы доступны в приложении.' };
    }
    return { allowed: true };
  }
  if (learnerPage || /^\/login(?:\/[^/]+)?$/.test(path) || path === '/reset-password'
    || ['/account', '/account/deletion-complete', '/account/deletion-status', '/documents', '/privacy', '/personal-data', '/terms', '/student-agreement', '/public-offer'].includes(path)
    || /^\/documents\/[^/]+$/.test(path)) return { allowed: true };
  return { allowed: false, destination: '/student', reason: 'Этот раздел доступен в веб-версии. Первый выпуск приложения предназначен для обучения ученика.' };
}

/** Fixed video-player URLs may remain inline; arbitrary web pages are not video players. */
export function nativeInlineVideoAllowed(raw: string | undefined | null): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    const host = url.hostname;
    const path = url.pathname;
    return (['www.youtube.com', 'www.youtube-nocookie.com'].includes(host) && /^\/embed\/[\w-]+$/.test(path))
      || (host === 'player.vimeo.com' && /^\/video\/\d+$/.test(path))
      || (host === 'rutube.ru' && /^\/play\/embed\/[a-z0-9]+\/?$/i.test(path))
      || (host === 'vk.com' && path === '/video_ext.php')
      || (host === 'ok.ru' && /^\/videoembed\/\d+$/.test(path))
      || (host === 'my.mail.ru' && path.startsWith('/video/embed/'))
      || (host === 'dzen.ru' && /^\/embed\/[\w-]+$/.test(path));
  } catch { return false; }
}

/** A public web destination only. Never transfer native Auth tokens or return-session data. */
export function nativeWebDestination(location: ScopeLocation): string {
  let path = location.pathname;
  try {
    if (!path.startsWith('/') || path.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(decodeURIComponent(path))) path = '/student';
  } catch { path = '/student'; }
  const url = new URL(path, SINTAGMA_WEB_ORIGIN);
  if (url.origin !== SINTAGMA_WEB_ORIGIN) return `${SINTAGMA_WEB_ORIGIN}/student`;
  const input = new URLSearchParams(location.search);
  // These are screen selectors, not credentials. All other parameters and hashes are omitted.
  for (const key of ['tab', 'section', 'view']) {
    const value = input.get(key);
    if (value && /^[a-z_-]{1,32}$/.test(value)) url.searchParams.set(key, value);
  }
  return url.href;
}
