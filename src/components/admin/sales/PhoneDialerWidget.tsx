import { useEffect, useMemo, useRef, useState } from 'react';
import { Phone, PhoneCall, PhoneOff, X, Delete, Mic, MicOff, Loader2, Wifi, WifiOff, PhoneIncoming } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { formatRuPhone, normalizeRuPhone } from '@/utils/phoneParser';
import { cn } from '@/lib/utils';
import { useSoftphone } from '@/hooks/useSoftphone';

/**
 * Плавающая браузерная звонилка: WebRTC-софтфон Novofon через JsSIP.
 * Микрофон/динамики — гарнитура. Никакого дозвона на мобильный.
 */
export function PhoneDialerWidget() {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState('');
  const sip = useSoftphone();
  const pendingDialRef = useRef<string | null>(null);
  const lastNumberRef = useRef<string | null>(null);
  const prevStatusRef = useRef(sip.status);

  // Открываем виджет по глобальному событию (можно вызывать из карточек лида)
  useEffect(() => {
    const openHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === 'string' && detail) setRaw(detail);
      setOpen(true);
    };
    const callHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { number?: string } | string | undefined;
      const number = typeof detail === 'string' ? detail : detail?.number;
      if (!number) return;
      const norm = normalizeRuPhone(number);
      if (!norm) { toast.error('Некорректный номер для звонка'); return; }
      setRaw(norm);
      setOpen(true);
      pendingDialRef.current = norm.replace(/^\+/, '');
      lastNumberRef.current = norm;
      if (sip.status === 'registered') {
        sip.call(pendingDialRef.current);
        pendingDialRef.current = null;
      } else if (sip.status === 'idle') {
        sip.connect();
      }
    };
    window.addEventListener('open-phone-dialer', openHandler);
    window.addEventListener('softphone:call', callHandler);
    return () => {
      window.removeEventListener('open-phone-dialer', openHandler);
      window.removeEventListener('softphone:call', callHandler);
    };
  }, [sip]);

  // Автоподключение при открытии
  useEffect(() => {
    if (open && sip.status === 'idle') sip.connect();
  }, [open, sip]);

  // Как только зарегистрировались — набираем отложенный номер
  useEffect(() => {
    if (sip.status === 'registered' && pendingDialRef.current) {
      const n = pendingDialRef.current;
      pendingDialRef.current = null;
      sip.call(n);
    }
  }, [sip.status, sip]);

  // Событийная шина: старт разговора и завершение
  useEffect(() => {
    const prev = prevStatusRef.current;
    const cur = sip.status;
    if (prev !== 'in_call' && cur === 'in_call') {
      window.dispatchEvent(new CustomEvent('softphone:answered', { detail: { number: lastNumberRef.current } }));
    }
    const wasActive = prev === 'calling' || prev === 'ringing' || prev === 'in_call';
    const isDone = cur === 'ended' || cur === 'failed' || cur === 'registered' || cur === 'idle';
    if (wasActive && isDone) {
      window.dispatchEvent(new CustomEvent('softphone:ended', {
        detail: { number: lastNumberRef.current, answered: prev === 'in_call', reason: cur },
      }));
    }
    prevStatusRef.current = cur;
  }, [sip.status]);

  const normalized = useMemo(() => normalizeRuPhone(raw), [raw]);
  const pretty = normalized ? formatRuPhone(normalized) : raw;

  const addDigit = (d: string) => {
    setRaw(prev => prev + d);
    if (sip.status === 'in_call') sip.sendDtmf(d);
  };
  const backspace = () => setRaw(prev => prev.slice(0, -1));

  const handleCall = () => {
    if (!normalized) { toast.error('Введите номер (10 цифр после +7)'); return; }
    if (sip.status !== 'registered') { toast.error('Софтфон не готов', { description: 'Подождите подключения к Novofon…' }); return; }
    lastNumberRef.current = normalized;
    // Novofon набор: 7XXXXXXXXXX (без +)
    sip.call(normalized.replace(/^\+/, ''));
  };

  const KEYS = ['1','2','3','4','5','6','7','8','9','*','0','#'];

  const inCall = sip.status === 'in_call' || sip.status === 'calling' || sip.status === 'ringing';

  return (
    <>
      {/* Плавающая кнопка */}
      <button
        type="button"
        aria-label="Открыть звонилку"
        onClick={() => setOpen(v => !v)}
        className={cn(
          'fixed z-40 bottom-6 right-24 h-12 w-12 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105',
          inCall ? 'bg-emerald-500 text-white animate-pulse' : 'bg-primary text-primary-foreground',
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

          {/* Статус подключения */}
          <div className={cn(
            'flex items-center gap-2 px-4 py-2 text-[11px] border-b',
            sip.status === 'registered' && 'bg-emerald-50 text-emerald-700 border-emerald-100',
            sip.status === 'connecting' && 'bg-amber-50 text-amber-700 border-amber-100',
            (sip.status === 'failed' || sip.status === 'idle') && 'bg-muted/40 text-muted-foreground',
            inCall && 'bg-primary/5 text-primary border-primary/10',
          )}>
            {sip.status === 'connecting' && <><Loader2 className="w-3 h-3 animate-spin" /> Подключение к Novofon…</>}
            {sip.status === 'registered' && <><Wifi className="w-3 h-3" /> Готов · звук идёт в гарнитуру</>}
            {sip.status === 'idle' && <><WifiOff className="w-3 h-3" /> Не подключено</>}
            {sip.status === 'calling' && <><Loader2 className="w-3 h-3 animate-spin" /> Идёт вызов {sip.remoteNumber && `· ${formatRuPhone('+' + sip.remoteNumber)}`}</>}
            {sip.status === 'ringing' && <><PhoneIncoming className="w-3 h-3" /> Входящий {sip.remoteNumber && `от ${sip.remoteNumber}`}</>}
            {sip.status === 'in_call' && <><PhoneCall className="w-3 h-3" /> Разговор · {sip.remoteNumber}</>}
            {sip.status === 'failed' && <><WifiOff className="w-3 h-3" /> Ошибка: {sip.error || 'не удалось подключиться'}</>}
            {sip.status === 'ended' && <>Звонок завершён</>}
          </div>

          <div className="p-4 space-y-3">
            <Input
              autoFocus
              value={raw}
              onChange={e => setRaw(e.target.value)}
              placeholder="+7 (___) ___-__-__"
              className="text-center text-lg tracking-wider h-11 tabular-nums"
              inputMode="tel"
              disabled={inCall}
            />
            <div className={cn('text-xs text-center', normalized ? 'text-emerald-600' : 'text-muted-foreground')}>
              {normalized ? pretty : 'Введите номер (в разговоре — тональный набор)'}
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {KEYS.map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => addDigit(k)}
                  className="h-10 rounded-lg border bg-background hover:bg-muted font-medium tabular-nums flex items-center justify-center"
                >
                  {k}
                </button>
              ))}
              <button type="button" onClick={() => setRaw(prev => prev + '+')} className="h-10 rounded-lg border bg-background hover:bg-muted font-medium">+</button>
              <button type="button" onClick={backspace} className="h-10 rounded-lg border bg-background hover:bg-muted flex items-center justify-center">
                <Delete className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={sip.toggleMute}
                disabled={sip.status !== 'in_call'}
                className={cn(
                  'h-10 rounded-lg border font-medium flex items-center justify-center',
                  sip.muted ? 'bg-amber-500 text-white' : 'bg-background hover:bg-muted',
                  sip.status !== 'in_call' && 'opacity-40 cursor-not-allowed',
                )}
                title="Микрофон"
              >
                {sip.muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            </div>

            {sip.status === 'ringing' ? (
              <div className="grid grid-cols-2 gap-2">
                <Button className="h-10 rounded-lg gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={sip.answer}>
                  <PhoneCall className="w-4 h-4" /> Ответить
                </Button>
                <Button className="h-10 rounded-lg gap-2" variant="destructive" onClick={sip.hangup}>
                  <PhoneOff className="w-4 h-4" /> Отклонить
                </Button>
              </div>
            ) : inCall ? (
              <Button className="w-full h-10 rounded-lg gap-2" variant="destructive" onClick={sip.hangup}>
                <PhoneOff className="w-4 h-4" /> Завершить
              </Button>
            ) : (
              <Button
                className="w-full h-10 rounded-lg gap-2"
                onClick={handleCall}
                disabled={!normalized || sip.status !== 'registered'}
              >
                <PhoneCall className="w-4 h-4" />
                Позвонить
              </Button>
            )}

            {sip.status === 'failed' && (
              <Button size="sm" variant="outline" className="w-full h-8" onClick={sip.connect}>
                Переподключиться
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
