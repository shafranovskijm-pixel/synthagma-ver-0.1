import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, ExternalLink, Shield, Globe2 } from 'lucide-react';
import { CLOUDFLARE_WORKER_CODE } from '@/utils/cloudflareWorkerCode';
import { getProxyStatus, forceProxyMode } from '@/utils/proxyFetch';
import { toast } from 'sonner';

export default function ProxySetup() {
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState(getProxyStatus());

  const copyCode = async () => {
    await navigator.clipboard.writeText(CLOUDFLARE_WORKER_CODE);
    setCopied(true);
    toast.success('Код Worker скопирован');
    setTimeout(() => setCopied(false), 2500);
  };

  const toggleProxy = (on: boolean) => {
    forceProxyMode(on);
    setStatus(getProxyStatus());
    toast.success(on ? 'Прокси-режим принудительно включён' : 'Прокси-режим выключен');
  };

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <Helmet><title>Настройка прокси для обхода блокировок — Sintagma</title></Helmet>

      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Shield className="text-primary" /> Прокси для обхода корпоративных блокировок
        </h1>
        <p className="text-muted-foreground mt-2">
          Резервный канал доступа через ваш домен <code className="text-primary">sintagma.com.ru</code>,
          когда корпоративный фаервол блокирует <code>*.supabase.co</code>.
        </p>
      </div>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">Текущий статус прокси</div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={status.enabled ? 'default' : 'secondary'}>
                {status.enabled ? 'АКТИВЕН' : 'Выключен (прямой канал)'}
              </Badge>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => toggleProxy(true)} disabled={status.enabled}>
              Включить принудительно
            </Button>
            <Button size="sm" variant="outline" onClick={() => toggleProxy(false)} disabled={!status.enabled}>
              Выключить
            </Button>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Прокси автоматически активируется на устройстве пользователя при детекте блокировки и сохраняется в браузере.
          Каждые 30 минут пробует вернуться на прямой канал.
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Globe2 className="text-primary" /> Шаг 1. DNS-записи
        </h2>
        <p className="text-sm">Добавьте 3 CNAME-записи у вашего DNS-провайдера для домена <b>sintagma.com.ru</b>:</p>
        <div className="bg-muted/40 rounded-lg p-4 font-mono text-sm space-y-1">
          <div>api        CNAME → (будет указан Cloudflare после Шага 3)</div>
          <div>functions  CNAME → (будет указан Cloudflare после Шага 3)</div>
          <div>storage    CNAME → (будет указан Cloudflare после Шага 3)</div>
        </div>
        <p className="text-xs text-muted-foreground">
          Точные значения CNAME Cloudflare покажет на этапе привязки кастомных доменов к Worker'у.
        </p>
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Shield className="text-primary" /> Шаг 2. Создайте Cloudflare Worker
        </h2>
        <ol className="list-decimal list-inside space-y-2 text-sm">
          <li>Зарегистрируйтесь на <a href="https://dash.cloudflare.com/sign-up/workers-and-pages" target="_blank" rel="noopener" className="text-primary underline inline-flex items-center gap-1">dash.cloudflare.com <ExternalLink className="w-3 h-3"/></a> (бесплатно, до 100 000 запросов/день).</li>
          <li>Workers &amp; Pages → <b>Create application</b> → <b>Create Worker</b>.</li>
          <li>Назовите worker, например, <code>sintagma-proxy</code>. Нажмите <b>Deploy</b>.</li>
          <li>После деплоя нажмите <b>Edit code</b>, удалите шаблонный код и вставьте код ниже:</li>
        </ol>

        <div className="relative">
          <Button size="sm" variant="secondary" className="absolute top-2 right-2 z-10" onClick={copyCode}>
            {copied ? <><Check className="w-4 h-4 mr-1"/> Скопировано</> : <><Copy className="w-4 h-4 mr-1"/> Копировать</>}
          </Button>
          <pre className="bg-muted/60 rounded-lg p-4 pt-12 text-xs overflow-auto max-h-96">
            <code>{CLOUDFLARE_WORKER_CODE}</code>
          </pre>
        </div>
        <p className="text-sm">5. Нажмите <b>Save and deploy</b>.</p>
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Globe2 className="text-primary" /> Шаг 3. Привяжите 3 кастомных домена к Worker
        </h2>
        <ol className="list-decimal list-inside space-y-2 text-sm">
          <li>В настройках Worker → <b>Settings → Triggers → Custom Domains → Add Custom Domain</b>.</li>
          <li>Добавьте по очереди:
            <ul className="list-disc list-inside ml-6 mt-1 space-y-1">
              <li><code>api.sintagma.com.ru</code></li>
              <li><code>functions.sintagma.com.ru</code></li>
              <li><code>storage.sintagma.com.ru</code></li>
            </ul>
          </li>
          <li>Cloudflare покажет CNAME-значения — вставьте их в DNS-панель из Шага 1.</li>
          <li>Дождитесь статуса <b>Active</b> у каждого домена (1–5 минут). SSL выдаётся автоматически.</li>
        </ol>
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="text-xl font-semibold">Шаг 4. Проверка</h2>
        <p className="text-sm">Откройте в браузере:</p>
        <div className="bg-muted/40 rounded-lg p-3 font-mono text-xs">
          https://api.sintagma.com.ru/auth/v1/health
        </div>
        <p className="text-sm">Должен вернуться JSON-ответ от Supabase. Если так — прокси работает.</p>
        <p className="text-sm text-muted-foreground">
          После настройки заблокированные пользователи автоматически переключатся на прокси при первой же сетевой ошибке.
          Никаких действий с их стороны не требуется.
        </p>
      </Card>
    </div>
  );
}
