import { useEffect, useMemo, useState } from 'react';
import { Phone, PhoneCall, PhoneOff, X, Delete, Loader2, CheckCircle2, AlertCircle, MicOff, Mic, Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { formatRuPhone, normalizeRuPhone } from '@/utils/phoneParser';
import { cn } from '@/lib/utils';
import { useSoftphone } from '@/hooks/useSoftphone';

interface CallDetail {
  number?: string;
  lead_id?: string | null;
  company_inn?: string | null;
  company_name?: string | null;
}

/**
 * Плавающая звонилка на WebRTC (JsSIP → Novofon).
 * Трубка «поднимается» в браузере — клиент слышит гудок сразу.
 */
export function PhoneDialerWidget() {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState('');
  const sp = useSoftphone();

  const normalized = useMemo(() => normalizeRuPhone(raw), [raw]);
  const pretty = normalized ? formatRuPhone(normalized) : raw;

  const busy = sp.status === 'calling' || sp.status === 'in_call' || sp.status === 'ringing';
  const connecting = sp.status === 'connecting';
  const canCall = sp.status === 'registered' && !!normalized;

  // авто-подключение при открытии
  useEffect(() => {
    if (open && sp.status === 'idle') void sp.connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const startCall = (detail?: CallDetail) => {
    const number = normalizeRuPhone(detail?.number || raw);
    if (!number) { toast.error('Введите номер (10 цифр после +7)'); return; }
    setRaw(number);
    setOpen(true);
    if (sp.status !== 'registered') {
      toast.message('Подключаемся к линии…', { description: 'Звонок пойдёт как только SIP зарегистрируется.' });
      // подождём регистрации и позвоним
      const started = Date.now();
      const wait = setInterval(() => {
        if (sp.status === 'registered') { clearInterval(wait); sp.call(number); }
        else if (sp.status === 'failed' || Date.now() - started > 8000) {
          clearInterval(wait);
          toast.error('SIP не подключился', { description: sp.error || 'Проверьте настройки Novofon' });
        }
      }, 250);
      if (sp.status === 'idle') void sp.connect();
      return;
    }
    sp.call(number);
    window.dispatchEvent(new CustomEvent('softphone:call:started', { detail: { number, ...detail } }));
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
      startCall(nextDetail);
    };
    window.addEventListener('open-phone-dialer', openHandler);
    window.addEventListener('softphone:call', callHandler);
    return () => {
      window.removeEventListener('open-phone-dialer', openHandler);
      window.removeEventListener('softphone:call', callHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, sp.status]);

  const addDigit = (d: string) => {
    if (sp.status === 'in_call') { sp.sendDtmf(d); return; }
    setRaw(prev => prev + d);
  };
  const backspace = () => setRaw(prev => prev.slice(0, -1));

  const KEYS = ['1','2','3','4','5','6','7','8','9','*','0','#'];

  const statusUi = (() => {
    switch (sp.status) {
      case 'idle': return { cls: 'bg-muted/40 text-muted-foreground', icon: <PhoneOff className="w-3 h-3" />, text: 'Не подключено' };
      case 'connecting': return { cls: 'bg-amber-50 text-amber-700 border-amber-100', icon: <Loader2 className="w-3 h-3 animate-spin" />, text: 'Подключаемся к линии…' };
      case 'registered': return { cls: 'bg-emerald-50 text-emerald-700 border-emerald-100', icon: <CheckCircle2 className="w-3 h-3" />, text: 'Готов к звонку' };
      case 'calling': return { cls: 'bg-amber-50 text-amber-700 border-amber-100', icon: <Loader2 className="w-3 h-3 animate-spin" />, text: `Набор${sp.remoteNumber ? ` · ${sp.remoteNumber}` : ''}` };
      case 'ringing': return { cls: 'bg-amber-50 text-amber-700 border-amber-100', icon: <PhoneCall className="w-3 h-3" />, text: `Входящий${sp.remoteNumber ? ` · ${sp.remoteNumber}` : ''}` };
      case 'in_call': return { cls: 'bg-emerald-50 text-emerald-700 border-emerald-100', icon: <PhoneCall className="w-3 h-3" />, text: `Разговор${sp.remoteNumber ? ` · ${sp.remoteNumber}` : ''}` };
      case 'ended': return { cls: 'bg-muted/40 text-muted-foreground', icon: <PhoneOff className="w-3 h-3" />, text: 'Звонок завершён' };
      case 'failed': return { cls: 'bg-destructive/10 text-destructive border-destructive/20', icon: <AlertCircle className="w-3 h-3" />, text: `Ошибка: ${sp.error || 'нет соединения'}` };
    }
  })();

  return (
    <>
      <button
        type="button"
        aria-label="Открыть звонилку"
        onClick={() => setOpen(v => !v)}
        className={cn(
          'fixed z-40 bottom-6 right-24 h-12 w-12 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 bg-primary text-primary-foreground',
          (connecting || busy) && 'animate-pulse',
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
            <div className="flex items-center gap-1">
              {sp.status === 'idle' || sp.status === 'failed' ? (
                <button type="button" onClick={() => sp.connect()} className="p-1 rounded-md hover:bg-muted" aria-label="Переподключить">
                  <Plug className="w-4 h-4" />
                </button>
              ) : null}
              <button type="button" onClick={() => setOpen(false)} className="p-1 rounded-md hover:bg-muted" aria-label="Закрыть">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className={cn('flex items-center gap-2 px-4 py-2 text-[11px] border-b', statusUi.cls)}>
            {statusUi.icon}
            <span className="truncate">{statusUi.text}</span>
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
                  className="h-10 rounded-lg border bg-background hover:bg-muted font-medium tabular-nums flex items-center justify-center"
                >
                  {k}
                </button>
              ))}
              <button type="button" onClick={() => setRaw(prev => prev + '+')} disabled={busy} className="h-10 rounded-lg border bg-background hover:bg-muted font-medium disabled:opacity-40">+</button>
              <button type="button" onClick={backspace} disabled={busy} className="h-10 rounded-lg border bg-background hover:bg-muted flex items-center justify-center disabled:opacity-40">
                <Delete className="w-4 h-4" />
              </button>
              {sp.status === 'in_call' ? (
                <button type="button" onClick={sp.toggleMute} className="h-10 rounded-lg border bg-background hover:bg-muted flex items-center justify-center">
                  {sp.muted ? <MicOff className="w-4 h-4 text-destructive" /> : <Mic className="w-4 h-4" />}
                </button>
              ) : (
                <button type="button" onClick={() => setRaw('')} className="h-10 rounded-lg border bg-background hover:bg-muted flex items-center justify-center">
                  <PhoneOff className="w-4 h-4" />
                </button>
              )}
            </div>

            {sp.status === 'ringing' ? (
              <div className="grid grid-cols-2 gap-2">
                <Button className="h-10 rounded-lg gap-2" onClick={sp.answer}>
                  <PhoneCall className="w-4 h-4" /> Ответить
                </Button>
                <Button variant="destructive" className="h-10 rounded-lg gap-2" onClick={sp.hangup}>
                  <PhoneOff className="w-4 h-4" /> Отклонить
                </Button>
              </div>
            ) : busy ? (
              <Button variant="destructive" className="w-full h-10 rounded-lg gap-2" onClick={sp.hangup}>
                <PhoneOff className="w-4 h-4" /> Завершить
              </Button>
            ) : (
              <Button
                className="w-full h-10 rounded-lg gap-2"
                onClick={() => startCall()}
                disabled={!normalized || connecting}
              >
                {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
                {connecting ? 'Подключаемся…' : canCall ? 'Позвонить' : 'Позвонить'}
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
