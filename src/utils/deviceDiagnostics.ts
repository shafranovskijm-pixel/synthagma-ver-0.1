/**
 * Сбор расширенной информации об устройстве, сети и кеше для диагностического отчёта.
 * Все значения собираются клиентом, IP в отчёт не пишется (только страна/провайдер).
 */

import { getProxyStatus } from './proxyFetch';
import { APP_VERSION, BUILD_DATE_SHORT } from '@/lib/appVersion';

export interface DeviceInfo {
  // Устройство
  deviceType: 'Desktop' | 'Mobile' | 'Tablet';
  os: string;
  browser: string;
  embeddedBrowser: string | null; // Telegram, VK, Instagram, FB, etc.
  isPwa: boolean;
  language: string;
  timezone: string;
  screen: string;
  // Сеть
  online: boolean;
  connection: string;
  ipCountry: string;
  ipRegion: string;
  ipOrg: string;
  ipAsn: string;
  vpnSuspect: boolean;
  // Кеш / PWA
  serviceWorker: string;
  cacheStorage: string;
  storageEstimate: string;
  appVersion: string;
  proxyMode: string;
  // Домен
  origin: string;
  cyrillicRedirect: boolean;
}

function detectOs(ua: string): string {
  if (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream) {
    const m = ua.match(/OS (\d+[_\.]\d+)/);
    return `iOS ${m ? m[1].replace('_', '.') : ''}`.trim();
  }
  if (/Android/.test(ua)) {
    const m = ua.match(/Android (\d+(\.\d+)?)/);
    return `Android ${m ? m[1] : ''}`.trim();
  }
  if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
  if (/Windows NT 6\.3/.test(ua)) return 'Windows 8.1';
  if (/Windows NT 6\.1/.test(ua)) return 'Windows 7';
  if (/Mac OS X (\d+[_\.]\d+)/.test(ua)) {
    const m = ua.match(/Mac OS X (\d+[_\.]\d+)/);
    return `macOS ${m ? m[1].replace('_', '.') : ''}`;
  }
  if (/Linux/.test(ua)) return 'Linux';
  return 'Неизвестно';
}

function detectBrowser(ua: string): string {
  if (/YaBrowser\/(\d+)/.test(ua)) return `Yandex Browser ${ua.match(/YaBrowser\/(\d+)/)![1]}`;
  if (/Edg\/(\d+)/.test(ua)) return `Edge ${ua.match(/Edg\/(\d+)/)![1]}`;
  if (/OPR\/(\d+)/.test(ua) || /Opera/.test(ua)) {
    const m = ua.match(/OPR\/(\d+)/);
    return `Opera ${m ? m[1] : ''}`.trim();
  }
  if (/Firefox\/(\d+)/.test(ua)) return `Firefox ${ua.match(/Firefox\/(\d+)/)![1]}`;
  if (/SamsungBrowser\/(\d+)/.test(ua)) return `Samsung Browser ${ua.match(/SamsungBrowser\/(\d+)/)![1]}`;
  if (/MiuiBrowser\/(\d+)/.test(ua)) return `MIUI Browser ${ua.match(/MiuiBrowser\/(\d+)/)![1]}`;
  if (/Chrome\/(\d+)/.test(ua) && !/Edg|OPR|YaBrowser/.test(ua)) return `Chrome ${ua.match(/Chrome\/(\d+)/)![1]}`;
  if (/Version\/(\d+).*Safari/.test(ua)) return `Safari ${ua.match(/Version\/(\d+)/)![1]}`;
  return 'Неизвестно';
}

function detectEmbeddedBrowser(ua: string): string | null {
  if (/Telegram/i.test(ua)) return 'Telegram WebView';
  if (/VKAndroid|VKiOS|VK_Messenger/i.test(ua)) return 'ВКонтакте';
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'Facebook';
  if (/Line\//i.test(ua)) return 'LINE';
  if (/MicroMessenger/i.test(ua)) return 'WeChat';
  if (/wv\)/i.test(ua) && /Android/.test(ua)) return 'Android WebView';
  return null;
}

function detectDeviceType(ua: string): 'Desktop' | 'Mobile' | 'Tablet' {
  if (/iPad/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) return 'Tablet';
  if (/Mobi|Android|iPhone|iPod/.test(ua)) return 'Mobile';
  return 'Desktop';
}

async function fetchIpInfo(): Promise<{ country: string; region: string; org: string; asn: string; vpn: boolean }> {
  const fallback = { country: 'недоступно', region: '—', org: '—', asn: '—', vpn: false };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const resp = await fetch('https://ipapi.co/json/', { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!resp.ok) return fallback;
    const data: any = await resp.json();
    const country = data.country_code || data.country || '—';
    const region = [data.region, data.city].filter(Boolean).join(', ') || '—';
    const org = data.org || data.org_name || '—';
    const asn = data.asn || '—';
    const vpn = country !== 'RU' || /vpn|proxy|hosting|datacenter|cloud/i.test(`${org} ${asn}`);
    return { country, region, org, asn, vpn };
  } catch {
    return fallback;
  }
}

async function getServiceWorkerInfo(): Promise<string> {
  if (!('serviceWorker' in navigator)) return 'не поддерживается браузером';
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    if (regs.length === 0) return 'не зарегистрирован';
    const r = regs[0];
    const state = r.active?.state || r.installing?.state || r.waiting?.state || 'unknown';
    return `активен (scope ${r.scope}, state ${state})`;
  } catch (e) {
    return `ошибка: ${(e as Error).message}`;
  }
}

async function getCacheStorageInfo(): Promise<string> {
  if (!('caches' in window)) return 'не поддерживается';
  try {
    const keys = await caches.keys();
    let total = 0;
    for (const k of keys) {
      const c = await caches.open(k);
      const reqs = await c.keys();
      total += reqs.length;
    }
    return `${keys.length} кеш(ей), ${total} записей`;
  } catch (e) {
    return `ошибка: ${(e as Error).message}`;
  }
}

async function getStorageEstimate(): Promise<string> {
  if (!navigator.storage?.estimate) return 'не поддерживается';
  try {
    const est = await navigator.storage.estimate();
    const usedMb = est.usage ? (est.usage / 1024 / 1024).toFixed(1) : '?';
    const quotaMb = est.quota ? (est.quota / 1024 / 1024).toFixed(0) : '?';
    return `${usedMb} МБ из ~${quotaMb} МБ`;
  } catch {
    return 'недоступно';
  }
}

function getConnectionInfo(): string {
  const c = (navigator as any).connection;
  if (!c) return 'API недоступно';
  const parts: string[] = [];
  if (c.effectiveType) parts.push(c.effectiveType);
  if (typeof c.downlink === 'number') parts.push(`${c.downlink} Мбит/с`);
  if (typeof c.rtt === 'number') parts.push(`RTT ${c.rtt} мс`);
  if (c.saveData) parts.push('saveData');
  return parts.join(', ') || '—';
}

export async function collectDeviceInfo(): Promise<DeviceInfo> {
  const ua = navigator.userAgent;
  const isPwa =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
  const proxy = getProxyStatus();
  const origin = window.location.hostname;

  const [ip, sw, cache, storage] = await Promise.all([
    fetchIpInfo(),
    getServiceWorkerInfo(),
    getCacheStorageInfo(),
    getStorageEstimate(),
  ]);

  return {
    deviceType: detectDeviceType(ua),
    os: detectOs(ua),
    browser: detectBrowser(ua),
    embeddedBrowser: detectEmbeddedBrowser(ua),
    isPwa,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: `${window.screen.width}×${window.screen.height} @${window.devicePixelRatio}x`,
    online: navigator.onLine,
    connection: getConnectionInfo(),
    ipCountry: ip.country,
    ipRegion: ip.region,
    ipOrg: ip.org,
    ipAsn: ip.asn,
    vpnSuspect: ip.vpn,
    serviceWorker: sw,
    cacheStorage: cache,
    storageEstimate: storage,
    appVersion: `${APP_VERSION} (${BUILD_DATE_SHORT})`,
    proxyMode: proxy.enabled ? 'включён (через резервный канал)' : 'выключен (прямой канал)',
    origin,
    cyrillicRedirect: /xn--/.test(origin) === false && document.referrer.includes('xn--'),
  };
}

export function buildDeviceInfoReport(info: DeviceInfo): string {
  const lines: string[] = [];
  lines.push('--- Устройство ---');
  lines.push(`Тип: ${info.deviceType}`);
  lines.push(`ОС: ${info.os}`);
  lines.push(`Браузер: ${info.browser}`);
  if (info.embeddedBrowser) lines.push(`Встроенный браузер: ${info.embeddedBrowser}`);
  lines.push(`PWA-режим: ${info.isPwa ? 'да' : 'нет'}`);
  lines.push(`Экран: ${info.screen}`);
  lines.push(`Язык: ${info.language}, часовой пояс ${info.timezone}`);
  lines.push('');
  lines.push('--- Сеть ---');
  lines.push(`Онлайн: ${info.online ? 'да' : 'нет'}`);
  lines.push(`Соединение: ${info.connection}`);
  lines.push(`IP-страна: ${info.ipCountry}`);
  lines.push(`Регион: ${info.ipRegion}`);
  lines.push(`Провайдер: ${info.ipOrg}`);
  lines.push(`ASN: ${info.ipAsn}`);
  lines.push(`Подозрение на VPN/прокси: ${info.vpnSuspect ? 'да' : 'нет'}`);
  lines.push('');
  lines.push('--- Кеш и версия ---');
  lines.push(`Версия приложения: ${info.appVersion}`);
  lines.push(`Service Worker: ${info.serviceWorker}`);
  lines.push(`Cache Storage: ${info.cacheStorage}`);
  lines.push(`Использовано хранилище: ${info.storageEstimate}`);
  lines.push(`Прокси-режим: ${info.proxyMode}`);
  lines.push('');
  lines.push('--- Домен ---');
  lines.push(`Открыто с: ${info.origin}`);
  lines.push(`Редирект с кириллического домена: ${info.cyrillicRedirect ? 'да' : 'нет'}`);
  return lines.join('\n');
}
