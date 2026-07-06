import { useEffect, useMemo, useState } from 'react';
import { Phone, PhoneCall, X, Delete } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { getAdminSalesView } from '@/utils/adminViewMode';
import { formatRuPhone, normalizeRuPhone } from '@/utils/phoneParser';
import { cn } from '@/lib/utils';

/**
 * Плавающий виджет-звонилка: позволяет менеджеру набрать любой номер
 * (в т.ч. продиктованный клиентом) и позвонить через Novofon.
 * Открывается по клику на плавающей кнопке в правом нижнем углу.
 */
export function PhoneDialerWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState('');
  const [managerPhone, setManagerPhone] = useState<string>('');
  const [managerId, setManagerId] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [calling, setCalling] = useState(false);

  // Загружаем телефон менеджера (fallback: profiles.phone)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const viewAs = getAdminSalesView();
      const targetUserId = viewAs?.userId || user?.id;
      const [mgrR, profR] = await Promise.all([
        viewAs?.managerId
          ? (supabase as any).from('sales_managers').select('id, phone').eq('id', viewAs.managerId).maybeSingle()
          : (user?.id ? (supabase as any).from('sales_managers').select('id, phone').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null })),
        targetUserId
          ? (supabase as any).from('profiles').select('phone').eq('user_id', targetUserId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;
      const mgr: any = mgrR?.data;
      const prof: any = profR?.data;
      if (mgr?.id) setManagerId(mgr.id);
      const phone = mgr?.phone || prof?.phone || '';
      setManagerPhone(phone);
      setPhoneDraft(phone);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Открываем виджет по глобальному событию (можно вызывать из карточек лида)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === 'string' && detail) setRaw(detail);
      setOpen(true);
    };
    window.addEventListener('open-phone-dialer', handler);
    return () => window.removeEventListener('open-phone-dialer', handler);
  }, []);

  const savePhone = async () => {
    const normalizedPhone = normalizeRuPhone(phoneDraft);
    if (!normalizedPhone) {
      toast.error('Введите корректный номер (10 цифр после +7)');
      return;
    }
    setSavingPhone(true);
    try {
      if (managerId) {
        const { error } = await (supabase as any).from('sales_managers').update({ phone: normalizedPhone }).eq('id', managerId);
        if (error) throw error;
      } else if (user?.id) {
        const { error } = await (supabase as any).from('profiles').update({ phone: normalizedPhone }).eq('user_id', user.id);
        if (error) throw error;
      }
      setManagerPhone(normalizedPhone);
      setEditingPhone(false);
      toast.success('Телефон сохранён');
    } catch (e) {
      toast.error('Не удалось сохранить телефон', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSavingPhone(false);
    }
  };

  const normalized = useMemo(() => normalizeRuPhone(raw), [raw]);
  const pretty = normalized ? formatRuPhone(normalized) : raw;

  const addDigit = (d: string) => setRaw(prev => prev + d);
  const backspace = () => setRaw(prev => prev.slice(0, -1));

  const handleCall = async () => {
    if (!normalized) {
      toast.error('Введите корректный номер (10 цифр после +7)');
      return;
    }
    setCalling(true);
    try {
      const { data, error } = await supabase.functions.invoke('novofon-call-start', {
        body: {
          to_number: normalized,
          lead_id: null,
          company_inn: null,
          company_name: null,
          operator_number: managerPhone || undefined,
        },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success('Звоним через Novofon', {
          description: `Набираем ${formatRuPhone(normalized)} — ответьте на своём телефоне.`,
        });
        setOpen(false);
      } else {
        toast.error('Не удалось запустить звонок', {
          description: data?.message || data?.error || data?.novofon?.message || 'Проверьте токен Call API Novofon',
        });
      }
    } catch (e) {
      toast.error('Ошибка звонка', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setCalling(false);
    }
  };

  const KEYS = ['1','2','3','4','5','6','7','8','9','+','0','⌫'];

  return (
    <>
      {/* Плавающая кнопка */}
      <button
        type="button"
        aria-label="Открыть звонилку"
        onClick={() => setOpen(v => !v)}
        className={cn(
          'fixed z-40 bottom-6 right-24 h-12 w-12 rounded-full shadow-lg',
          'bg-primary text-primary-foreground flex items-center justify-center',
          'hover:scale-105 transition-transform',
        )}
      >
        <Phone className="w-5 h-5" />
      </button>

      {open && (
        <div className="fixed z-50 bottom-24 right-24 w-[300px] rounded-2xl border bg-background shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/40">
            <div className="flex items-center gap-2 text-sm font-medium">
              <PhoneCall className="w-4 h-4 text-primary" /> Звонилка
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 rounded-md hover:bg-muted"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <Input
              autoFocus
              value={raw}
              onChange={e => setRaw(e.target.value)}
              placeholder="+7 (___) ___-__-__"
              className="text-center text-lg tracking-wider h-11 tabular-nums"
              inputMode="tel"
            />
            <div className={cn(
              'text-xs text-center',
              normalized ? 'text-emerald-600' : 'text-muted-foreground',
            )}>
              {normalized ? pretty : 'Введите номер (можно продиктованный клиентом)'}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {KEYS.map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => k === '⌫' ? backspace() : addDigit(k)}
                  className="h-10 rounded-lg border bg-background hover:bg-muted font-medium tabular-nums flex items-center justify-center"
                >
                  {k === '⌫' ? <Delete className="w-4 h-4" /> : k}
                </button>
              ))}
            </div>
            <Button
              className="w-full h-10 rounded-lg gap-2"
              onClick={handleCall}
              disabled={!normalized || calling}
            >
              <PhoneCall className="w-4 h-4" />
              {calling ? 'Звоним…' : 'Позвонить'}
            </Button>
            {managerPhone && !editingPhone ? (
              <div className="text-[11px] text-center text-muted-foreground">
                Ваш телефон: <span className="font-medium text-foreground">{formatRuPhone(managerPhone) || managerPhone}</span>
                {' '}·{' '}
                <button
                  type="button"
                  onClick={() => { setPhoneDraft(managerPhone); setEditingPhone(true); }}
                  className="underline hover:text-primary"
                >
                  изменить
                </button>
              </div>
            ) : (
              <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2">
                <div className="text-[11px] text-amber-700 text-center">
                  Укажите свой рабочий телефон, иначе Novofon не соединит звонок.
                </div>
                <div className="flex gap-1.5">
                  <Input
                    value={phoneDraft}
                    onChange={e => setPhoneDraft(e.target.value)}
                    placeholder="+7 (___) ___-__-__"
                    className="h-8 text-sm"
                    inputMode="tel"
                  />
                  <Button
                    size="sm"
                    className="h-8"
                    onClick={savePhone}
                    disabled={savingPhone || !phoneDraft}
                  >
                    {savingPhone ? '…' : 'OK'}
                  </Button>
                  {managerPhone && (
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingPhone(false)}>
                      ✕
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
