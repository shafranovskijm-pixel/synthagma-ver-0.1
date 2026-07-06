import { useEffect, useMemo, useRef, useState } from 'react';
import { Phone, PhoneCall, PhoneOff, X, Delete, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { formatRuPhone, normalizeRuPhone } from '@/utils/phoneParser';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

type DialerStatus = 'idle' | 'dialing' | 'started' | 'failed';

interface CallDetail {
  number?: string;
  lead_id?: string | null;
  company_inn?: string | null;
  company_name?: string | null;
  operator_number?: string | null;
}

/**
 * Плавающая звонилка: рабочий серверный дозвон через Novofon Call API.
 * Backend сначала звонит менеджеру, после ответа соединяет с клиентом.
 */
export function PhoneDialerWidget() {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState('');
  const [status, setStatus] = useState<DialerStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastNumber, setLastNumber] = useState<string | null>(null);
  const pendingDetailRef = useRef<CallDetail | null>(null);

  const normalized = useMemo(() => normalizeRuPhone(raw), [raw]);
  const pretty = normalized ? formatRuPhone(normalized) : raw;
  const busy = status === 'dialing';

  const startBackendCall = async (detail?: CallDetail) => {
    const number = normalizeRuPhone(detail?.number || raw);
    if (!number) {
      toast.error('Введите номер (10 цифр после +7)');
      return;
    }

    setOpen(true);
    setRaw(number);
    setLastNumber(number);
    setStatus('dialing');
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('novofon-call-start', {
        body: {
          to_number: number,
          lead_id: detail?.lead_id ?? undefined,
          company_inn: detail?.company_inn ?? undefined,
          company_name: detail?.company_name ?? undefined,
          operator_number: detail?.operator_number ?? undefined,
        },
      });

      if (fnError) throw fnError;
      if (!data?.ok) {
        throw new Error(data?.message || data?.error || data?.novofon?.message || 'Novofon не запустил звонок');
      }

      setStatus('started');
      toast.success('Звонок запущен', {
        description: 'Сначала звонок поступит менеджеру, после ответа Novofon соединит с клиентом.',
      });
      window.dispatchEvent(new CustomEvent('softphone:answered', { detail: { number, backend: true } }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setStatus('failed');
      setError(message);
      toast.error('Не удалось запустить звонок', { description: message });
      window.dispatchEvent(new CustomEvent('softphone:ended', { detail: { number, answered: false, reason: 'failed' } }));
    }
  };

  useEffect(() => {
    const openHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === 'string' && detail) setRaw(detail);
      setOpen(true);
    };
    const callHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail as CallDetail | string | undefined;
      const nextDetail: CallDetail = typeof detail === 'string' ? { number: detail } : (detail || {});
      pendingDetailRef.current = nextDetail;
      void startBackendCall(nextDetail);
    };
    window.addEventListener('open-phone-dialer', openHandler);
    window.addEventListener('softphone:call', callHandler);
    return () => {
      window.removeEventListener('open-phone-dialer', openHandler);
      window.removeEventListener('softphone:call', callHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  const addDigit = (d: string) => setRaw(prev => prev + d);
  const backspace = () => setRaw(prev => prev.slice(0, -1));
  const reset = () => {
    setStatus('idle');
    setError(null);
    pendingDetailRef.current = null;
    if (lastNumber) window.dispatchEvent(new CustomEvent('softphone:ended', { detail: { number: lastNumber, answered: status === 'started', reason: 'manual' } }));
  };

  const KEYS = ['1','2','3','4','5','6','7','8','9','*','0','#'];

  return (
    <>
      <button
        type="button"
        aria-label="Открыть звонилку"
        onClick={() => setOpen(v => !v)}
        className={cn(
          'fixed z-40 bottom-6 right-24 h-12 w-12 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 bg-primary text-primary-foreground',
          status === 'dialing' && 'animate-pulse',
        )}
      >
        <Phone className="w-5 h-5" />
      </button>

      {open && (
        <div className="fixed z-50 bottom-24 right-24 w-[320px] rounded-2xl border bg-background shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/40">
            <div className="flex items-center gap-2 text-sm font-medium">
              <PhoneCall className="w-4 h-4 text-primary" /> Звонилка
            </div>
            <button type="button" onClick={() => setOpen(false)} className="p-1 rounded-md hover:bg-muted" aria-label="Закрыть">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className={cn(
            'flex items-center gap-2 px-4 py-2 text-[11px] border-b',
            status === 'started' && 'bg-emerald-50 text-emerald-700 border-emerald-100',
            status === 'dialing' && 'bg-amber-50 text-amber-700 border-amber-100',
            status === 'failed' && 'bg-destructive/10 text-destructive border-destructive/20',
            status === 'idle' && 'bg-muted/40 text-muted-foreground',
          )}>
            {status === 'idle' && <><PhoneOff className="w-3 h-3" /> Готов к звонку через Novofon</>}
            {status === 'dialing' && <><Loader2 className="w-3 h-3 animate-spin" /> Запускаем звонок…</>}
            {status === 'started' && <><CheckCircle2 className="w-3 h-3" /> Звонок запущен · ждите входящий</>}
            {status === 'failed' && <><AlertCircle className="w-3 h-3" /> Ошибка: {error || 'не удалось запустить звонок'}</>}
          </div>

          <div className="p-4 space-y-3">
            <Input
              autoFocus
              value={raw}
              onChange={e => setRaw(e.target.value)}
              placeholder="+7 (___) ___-__-__"
              className="text-center text-lg tracking-wider h-11 tabular-nums"
              inputMode="tel"
              disabled={busy}
            />
            <div className={cn('text-xs text-center', normalized ? 'text-emerald-600' : 'text-muted-foreground')}>
              {normalized ? pretty : 'Введите номер клиента'}
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {KEYS.map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => addDigit(k)}
                  disabled={busy}
                  className="h-10 rounded-lg border bg-background hover:bg-muted font-medium tabular-nums flex items-center justify-center disabled:opacity-40"
                >
                  {k}
                </button>
              ))}
              <button type="button" onClick={() => setRaw(prev => prev + '+')} disabled={busy} className="h-10 rounded-lg border bg-background hover:bg-muted font-medium disabled:opacity-40">+</button>
              <button type="button" onClick={backspace} disabled={busy} className="h-10 rounded-lg border bg-background hover:bg-muted flex items-center justify-center disabled:opacity-40">
                <Delete className="w-4 h-4" />
              </button>
              <button type="button" onClick={reset} className="h-10 rounded-lg border bg-background hover:bg-muted flex items-center justify-center">
                <PhoneOff className="w-4 h-4" />
              </button>
            </div>

            <Button
              className="w-full h-10 rounded-lg gap-2"
              onClick={() => startBackendCall(pendingDetailRef.current || undefined)}
              disabled={!normalized || busy}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
              {busy ? 'Запускаем…' : 'Позвонить'}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}