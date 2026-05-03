import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Shield, Server, Globe2 } from 'lucide-react';
import { NGINX_PROXY_CONFIG } from '@/utils/nginxProxyConfig';
import { getProxyStatus, forceProxyMode } from '@/utils/proxyFetch';
import { toast } from 'sonner';

export default function ProxySetup() {
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState(getProxyStatus());

  const copyCode = async () => {
    await navigator.clipboard.writeText(NGINX_PROXY_CONFIG);
    setCopied(true);
    toast.success('Nginx-конфиг скопирован');
    setTimeout(() => setCopied(false), 2500);
  };

  const toggleProxy = (on: boolean) => {
    forceProxyMode(on);
    setStatus(getProxyStatus());
    toast.success(on ? 'Прокси-режим принудительно включён' : 'Прокси-режим выключен');
  };

  const checkUrl = `${window.location.origin}/sb-api/auth/v1/health`;

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <Helmet><title>Настройка прокси для обхода блокировок — Sintagma</title></Helmet>

      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Shield className="text-primary" /> Same-origin прокси через Timeweb / VPS
        </h1>
        <p className="text-muted-foreground mt-2">
          Резервный канал к backend через ваш собственный сервер на том же домене,
          что и фронтенд. Нужен, когда у пользователей в РФ заблокирован прямой
          доступ к <code>*.supabase.co</code> и Cloudflare Workers.
        </p>
      </div>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-sm text-muted-foreground">Текущий статус прокси</div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={status.enabled ? 'default' : 'secondary'}>
                {status.enabled ? 'АКТИВЕН' : 'Выключен (прямой канал)'}
              </Badge>
              {status.forced && <Badge variant="outline">принудительно для этого домена</Badge>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => toggleProxy(true)} disabled={status.enabled}>
              Включить принудительно
            </Button>
            <Button size="sm" variant="outline" onClick={() => toggleProxy(false)} disabled={!status.enabled || status.forced}>
              Выключить
            </Button>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Прокси активируется автоматически на устройстве пользователя при детекте блокировки
          и сохраняется в браузере. На основных доменах (sintagma.com.ru, *.twc1.net) — всегда включён.
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Server className="text-primary" /> Шаг 1. Установите Nginx-конфиг на Timeweb
        </h2>
        <p className="text-sm">
          Скопируйте конфиг ниже и вставьте его <b>внутрь</b> существующего <code>server {'{ ... }'}</code> блока,
          который уже отдаёт фронтенд (например, ваш Timeweb App Platform / VPS с Nginx).
        </p>
        <div className="relative">
          <Button size="sm" variant="secondary" className="absolute top-2 right-2 z-10" onClick={copyCode}>
            {copied ? <><Check className="w-4 h-4 mr-1"/> Скопировано</> : <><Copy className="w-4 h-4 mr-1"/> Копировать</>}
          </Button>
          <pre className="bg-muted/60 rounded-lg p-4 pt-12 text-xs overflow-auto max-h-[480px]">
            <code>{NGINX_PROXY_CONFIG}</code>
          </pre>
        </div>
        <p className="text-xs text-muted-foreground">
          Конфиг создаёт 4 маршрута на том же домене: <code>/sb-api</code>, <code>/sb-functions</code>,
          <code> /sb-storage</code>, <code>/sb-realtime</code> (WebSocket).
        </p>
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Globe2 className="text-primary" /> Шаг 2. Перезагрузите Nginx
        </h2>
        <p className="text-sm">
          На Timeweb App Platform — задеплойте обновлённый конфиг.<br/>
          На обычном VPS:
        </p>
        <pre className="bg-muted/40 rounded-lg p-3 font-mono text-xs">{`sudo nginx -t && sudo systemctl reload nginx`}</pre>
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="text-xl font-semibold">Шаг 3. Проверка</h2>
        <p className="text-sm">Откройте в браузере (без VPN):</p>
        <div className="bg-muted/40 rounded-lg p-3 font-mono text-xs break-all">{checkUrl}</div>
        <p className="text-sm">
          Должен вернуться JSON-ответ от Supabase (<code>{`{"name":"GoTrue", ...}`}</code>).
          Если так — прокси работает, и весь логин/база/функции/файлы пойдут через него автоматически.
        </p>
        <p className="text-xs text-muted-foreground">
          Что важно: префиксы <code>/sb-api</code>, <code>/sb-functions</code>, <code>/sb-storage</code>,
          <code> /sb-realtime</code> в Nginx должны точно совпадать с теми, что зашиты в приложении —
          это same-origin контракт.
        </p>
      </Card>
    </div>
  );
}
