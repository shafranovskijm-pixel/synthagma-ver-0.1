import { useEffect, useMemo, useRef, useState } from 'react';
import JsSIP from 'jssip';
import { CheckCircle2, Eye, EyeOff, Loader2, PhoneCall, PlugZap, ShieldCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type SipTestState = 'idle' | 'checking' | 'success' | 'failed';

interface SipCredentialsResponse {
  ok?: boolean;
  version?: string;
  source?: string;
  login?: string;
  password?: string;
  domain?: string;
  wss?: string;
  warning?: string;
  error?: string;
  message?: string;
}

interface TestResult {
  status: SipTestState;
  title: string;
  details?: string;
}

function cleanHost(value: string): string {
  return value
    .replace(/^wss?:\/\//i, '')
    .replace(/^sips?:\/\//i, '')
    .replace(/\/.*$/i, '')
    .replace(/:\d+$/i, '')
    .trim();
}

function defaultDomain(login: string): string {
  return login.includes('-') ? 'pbx.zadarma.com' : 'sip.zadarma.com';
}

function defaultWss(domain: string): string {
  const host = cleanHost(domain) || 'sip.zadarma.com';
  return `wss://${host}:4443`;
}

function sourceLabel(source?: string): string {
  if (source === 'webrtc_key') return 'официальный WebRTC';
  if (source === 'static_fallback') return 'ручной SIP';
  return source || 'не определено';
}

export function SalesSettings() {
  const activeUaRef = useRef<JsSIP.UA | null>(null);
  const [configured, setConfigured] = useState<SipCredentialsResponse | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isTestingStored, setIsTestingStored] = useState(false);
  const [isTestingManual, setIsTestingManual] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [manualLogin, setManualLogin] = useState('');
  const [manualPassword, setManualPassword] = useState('');
  const [manualDomain, setManualDomain] = useState('');
  const [manualWss, setManualWss] = useState('');
  const [result, setResult] = useState<TestResult>({ status: 'idle', title: 'Проверка ещё не запускалась' });

  const derivedDomain = useMemo(() => cleanHost(manualDomain) || defaultDomain(manualLogin), [manualDomain, manualLogin]);
  const derivedWss = useMemo(() => manualWss.trim() || defaultWss(derivedDomain), [manualWss, derivedDomain]);
  const configuredExtension = configured?.login?.includes('-') ? configured.login.split('-').slice(1).join('-') : '';

  const stopActiveUa = () => {
    try { activeUaRef.current?.stop(); } catch { /* noop */ }
    activeUaRef.current = null;
  };

  const loadConfigured = async () => {
    setIsLoadingConfig(true);
    try {
      const { data, error } = await supabase.functions.invoke('novofon-sip-credentials', { body: {} });
      if (error) throw error;
      const payload = (data || {}) as SipCredentialsResponse;
      setConfigured(payload);
      if (payload.ok) {
        setManualLogin(payload.login || '');
        setManualDomain(payload.domain || '');
        setManualWss(payload.wss || '');
      }
    } catch (error) {
      setConfigured({ ok: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsLoadingConfig(false);
    }
  };

  useEffect(() => {
    void loadConfigured();
    return stopActiveUa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const testRegistration = async (params: { login: string; password: string; domain?: string; wss?: string }) => {
    const login = params.login.trim();
    const password = params.password;
    const domain = cleanHost(params.domain || defaultDomain(login));
    const wss = (params.wss || defaultWss(domain)).trim();

    if (!login || !password || !domain || !wss) {
      throw new Error('Заполните SIP-логин, пароль, домен и WSS');
    }

    stopActiveUa();

    return await new Promise<TestResult>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const finish = (next: TestResult) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        window.setTimeout(stopActiveUa, 100);
        resolve(next);
      };

      try {
        const socket = new JsSIP.WebSocketInterface(wss);
        const ua = new JsSIP.UA({
          sockets: [socket],
          uri: `sip:${login}@${domain}`,
          password,
          display_name: 'Sintagma SIP test',
          register: true,
          session_timers: false,
          connection_recovery_min_interval: 2,
          connection_recovery_max_interval: 4,
        });

        activeUaRef.current = ua;

        ua.on('registered', () => finish({
          status: 'success',
          title: 'SIP-логин и пароль приняты',
          details: `${login}@${domain}`,
        }));

        ua.on('registrationFailed', (event: any) => {
          const statusCode = event?.response?.status_code;
          const reason = event?.response?.reason_phrase || event?.cause || 'registrationFailed';
          finish({
            status: 'failed',
            title: statusCode === 401 ? 'Novofon отклонил SIP-логин или пароль' : 'SIP-регистрация не прошла',
            details: statusCode ? `${statusCode}: ${reason}` : String(reason),
          });
        });

        ua.on('disconnected', (event: any) => {
          if (settled) return;
          const code = event?.code;
          const reason = event?.reason;
          finish({
            status: 'failed',
            title: 'WebSocket до SIP-сервера не подключился',
            details: `${wss}${code ? ` · ${code}${reason ? `: ${reason}` : ''}` : ''}`,
          });
        });

        timer = setTimeout(() => finish({
          status: 'failed',
          title: 'SIP-сервер не ответил за 12 секунд',
          details: `${login}@${domain} · ${wss}`,
        }), 12000);

        ua.start();
      } catch (error) {
        finish({
          status: 'failed',
          title: 'Не удалось запустить SIP-проверку',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    });
  };

  const runStoredTest = async () => {
    setIsTestingStored(true);
    setResult({ status: 'checking', title: 'Проверяем сохранённые SIP-настройки…' });
    try {
      const { data, error } = await supabase.functions.invoke('novofon-sip-credentials', { body: {} });
      if (error) throw error;
      const payload = (data || {}) as SipCredentialsResponse;
      setConfigured(payload);
      if (!payload.ok || !payload.login || !payload.password) {
        throw new Error(payload.message || payload.error || 'SIP-настройки не получены');
      }
      const next = await testRegistration({ login: payload.login, password: payload.password, domain: payload.domain, wss: payload.wss });
      setResult(next);
      if (next.status === 'success') toast.success('SIP проверен: можно звонить из браузера');
      else toast.error(next.title, { description: next.details });
    } catch (error) {
      const next = { status: 'failed' as const, title: 'Проверка сохранённых SIP-настроек не прошла', details: error instanceof Error ? error.message : String(error) };
      setResult(next);
      toast.error(next.title, { description: next.details });
    } finally {
      setIsTestingStored(false);
    }
  };

  const runManualTest = async () => {
    setIsTestingManual(true);
    setResult({ status: 'checking', title: 'Проверяем введённые SIP-данные…' });
    try {
      const next = await testRegistration({ login: manualLogin, password: manualPassword, domain: derivedDomain, wss: derivedWss });
      setResult(next);
      if (next.status === 'success') toast.success('Введённые SIP-данные рабочие');
      else toast.error(next.title, { description: next.details });
    } catch (error) {
      const next = { status: 'failed' as const, title: 'Проверка введённых SIP-данных не прошла', details: error instanceof Error ? error.message : String(error) };
      setResult(next);
      toast.error(next.title, { description: next.details });
    } finally {
      setIsTestingManual(false);
    }
  };

  const ResultIcon = result.status === 'success' ? CheckCircle2 : result.status === 'failed' ? XCircle : result.status === 'checking' ? Loader2 : ShieldCheck;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2"><PhoneCall className="w-5 h-5 text-primary" /> Настройки телефонии</h3>
          <p className="text-sm text-muted-foreground">Проверка регистрации SIP-линии для звонков из браузера.</p>
        </div>
        <Button variant="outline" className="rounded-xl gap-2" onClick={loadConfigured} disabled={isLoadingConfig || isTestingStored || isTestingManual}>
          {isLoadingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
          Обновить
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Сохранённая линия
            {configured?.ok ? <Badge variant="secondary">{sourceLabel(configured.source)}</Badge> : <Badge variant="destructive">нет подключения</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-border/60 p-3">
              <p className="text-xs text-muted-foreground">SIP-логин</p>
              <p className="font-medium tabular-nums break-all">{configured?.login || '—'}</p>
            </div>
            <div className="rounded-xl border border-border/60 p-3">
              <p className="text-xs text-muted-foreground">Домен / WSS</p>
              <p className="font-medium break-all">{configured?.domain || '—'}</p>
              <p className="text-xs text-muted-foreground break-all">{configured?.wss || '—'}</p>
            </div>
          </div>

          {configuredExtension ? (
            <Alert>
              <ShieldCheck className="w-4 h-4" />
              <AlertTitle>В логине есть внутренний номер {configuredExtension}</AlertTitle>
              <AlertDescription>
                Суффикс после дефиса — это внутренняя SIP-линия АТС. Сейчас он используется только если уже сохранён в полном SIP-логине.
              </AlertDescription>
            </Alert>
          ) : null}

          {configured?.warning || configured?.message || configured?.error ? (
            <Alert variant={configured?.ok ? 'default' : 'destructive'}>
              <XCircle className="w-4 h-4" />
              <AlertTitle>{configured?.ok ? 'Предупреждение' : 'Ошибка настройки'}</AlertTitle>
              <AlertDescription>{configured.warning || configured.message || configured.error}</AlertDescription>
            </Alert>
          ) : null}

          <Button className="rounded-xl gap-2" onClick={runStoredTest} disabled={isTestingStored || isTestingManual || !configured?.ok}>
            {isTestingStored ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Проверить сохранённые SIP-данные
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Ручная проверка логина и пароля</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sip-login">SIP-логин</Label>
              <Input id="sip-login" value={manualLogin} onChange={(e) => setManualLogin(e.target.value.trim())} placeholder="0076627 или 0076627-100" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sip-password">SIP-пароль</Label>
              <div className="relative">
                <Input
                  id="sip-password"
                  value={manualPassword}
                  onChange={(e) => setManualPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Пароль SIP-линии"
                  className="rounded-xl pr-10"
                />
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sip-domain">SIP-домен</Label>
              <Input id="sip-domain" value={manualDomain} onChange={(e) => setManualDomain(e.target.value)} placeholder={defaultDomain(manualLogin)} className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sip-wss">WSS</Label>
              <Input id="sip-wss" value={manualWss} onChange={(e) => setManualWss(e.target.value)} placeholder={defaultWss(derivedDomain)} className="rounded-xl" />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Если вводите основной логин без внутренней линии, проверка использует его как есть и не дописывает «-100» автоматически.
          </p>

          <Button variant="outline" className="rounded-xl gap-2" onClick={runManualTest} disabled={isTestingManual || isTestingStored}>
            {isTestingManual ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
            Проверить введённые данные
          </Button>
        </CardContent>
      </Card>

      <Alert variant={result.status === 'failed' ? 'destructive' : 'default'}>
        <ResultIcon className={result.status === 'checking' ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
        <AlertTitle>{result.title}</AlertTitle>
        {result.details ? <AlertDescription>{result.details}</AlertDescription> : null}
      </Alert>
    </div>
  );
}