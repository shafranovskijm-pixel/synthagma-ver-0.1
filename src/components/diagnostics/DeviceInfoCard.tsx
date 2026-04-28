import { useState } from 'react';
import { ChevronDown, ChevronUp, Monitor, Wifi, Database, Globe, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DeviceInfo } from '@/utils/deviceDiagnostics';

interface Props {
  info: DeviceInfo | null;
  loading: boolean;
}

export function DeviceInfoCard({ info, loading }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border bg-muted/20 overflow-hidden mb-4">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition"
      >
        <div className="flex items-center gap-3">
          <Monitor className="w-5 h-5 text-primary" />
          <div>
            <div className="font-medium text-sm">Подробная информация об устройстве</div>
            <div className="text-xs text-muted-foreground">
              {loading ? 'собираем данные…' : 'Помогает поддержке быстро понять причину'}
            </div>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && info && (
        <div className="px-4 pb-4 space-y-4 text-sm">
          {info.vpnSuspect && (
            <div className="flex items-start gap-2 rounded-lg p-3 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">Возможно, активен VPN или зарубежный прокси</div>
                <div className="text-xs opacity-90">Это часто мешает оплате и работе со встроенным видео.</div>
              </div>
            </div>
          )}

          <Section icon={<Monitor className="w-4 h-4" />} title="Устройство">
            <Row k="Тип" v={info.deviceType} />
            <Row k="ОС" v={info.os} />
            <Row k="Браузер" v={info.browser} />
            {info.embeddedBrowser && <Row k="Встроенный браузер" v={info.embeddedBrowser} highlight />}
            <Row k="PWA" v={info.isPwa ? 'Да (установлено на главный экран)' : 'нет'} />
            <Row k="Экран" v={info.screen} />
            <Row k="Язык / часовой пояс" v={`${info.language} • ${info.timezone}`} />
          </Section>

          <Section icon={<Wifi className="w-4 h-4" />} title="Сеть">
            <Row k="Онлайн" v={info.online ? 'да' : 'нет'} />
            <Row k="Соединение" v={info.connection} />
            <Row k="Страна" v={info.ipCountry} />
            <Row k="Регион" v={info.ipRegion} />
            <Row k="Провайдер" v={info.ipOrg} />
            <Row k="ASN" v={info.ipAsn} />
          </Section>

          <Section icon={<Database className="w-4 h-4" />} title="Кеш и версия">
            <Row k="Версия приложения" v={info.appVersion} />
            <Row k="Service Worker" v={info.serviceWorker} />
            <Row k="Cache Storage" v={info.cacheStorage} />
            <Row k="Хранилище" v={info.storageEstimate} />
            <Row k="Прокси-режим" v={info.proxyMode} />
          </Section>

          <Section icon={<Globe className="w-4 h-4" />} title="Домен">
            <Row k="Открыто с" v={info.origin} />
            <Row k="Редирект с кириллического" v={info.cyrillicRedirect ? 'да' : 'нет'} />
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">
        {icon} {title}
      </div>
      <div className="space-y-1 pl-1">{children}</div>
    </div>
  );
}

function Row({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <div className="flex items-start gap-3 text-xs">
      <div className="w-44 shrink-0 text-muted-foreground">{k}</div>
      <div className={`flex-1 break-all ${highlight ? 'font-medium text-amber-600 dark:text-amber-400' : ''}`}>{v}</div>
    </div>
  );
}
