import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, Phone, RefreshCw, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultPhone?: string | null;
}

const LS_KEY = 'sales.test_call_number';

interface DiagnosticStep {
  key: string;
  label: string;
  ok: boolean;
  message: string;
}

export function TestCallDialog({ open, onOpenChange, defaultPhone }: Props) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [steps, setSteps] = useState<DiagnosticStep[]>([]);

  const normalizePhone = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return '+7 ';
    let d = digits;
    if (d.startsWith('8')) d = '7' + d.slice(1);
    if (!d.startsWith('7')) d = '7' + d;
    d = d.slice(0, 11);
    const p1 = d.slice(1, 4);
    const p2 = d.slice(4, 7);
    const p3 = d.slice(7, 9);
    const p4 = d.slice(9, 11);
    let out = '+7';
    if (p1) out += ' ' + p1;
    if (p2) out += ' ' + p2;
    if (p3) out += '-' + p3;
    if (p4) out += '-' + p4;
    return out;
  };

  useEffect(() => {
    if (!open) return;
    const saved = localStorage.getItem(LS_KEY) || '';
    const initial = saved || defaultPhone || '';
    setPhone(initial ? normalizePhone(initial) : '+7 ');
    setSteps([]);
  }, [open, defaultPhone]);

  const call = async () => {
    const to = phone.replace(/\D/g, '');
    if (to.length < 11) { toast.error('Введите номер полностью'); return; }
    const e164 = '+' + (to.startsWith('8') ? '7' + to.slice(1) : to);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('novofon-call-start', {
        body: {
          to_number: e164,
          operator_number: defaultPhone || e164,
          company_name: 'Тестовый звонок',
          is_test: true,
        },
      });
      if (error) throw error;
      if (data?.ok) {
        localStorage.setItem(LS_KEY, e164);
        toast.success('Звоним', {
          description: 'Возьмите трубку — Novofon перезвонит на этот номер.',
        });
        onOpenChange(false);
      } else {
        toast.error('Не удалось запустить звонок', {
          description: data?.message || data?.error || data?.novofon?.message || 'Проверьте токен Call API Novofon',
        });
      }
    } catch (e) {
      toast.error('Ошибка звонка', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  };


  const check = async () => {
    const to = phone.trim();
    if (!to) { toast.error('Введите номер для проверки'); return; }
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('novofon-diagnostics', {
        body: { test_number: to, operator_number: defaultPhone || to },
      });
      if (error) throw error;
      setSteps(Array.isArray(data?.steps) ? data.steps : []);
      if (data?.ok) {
        toast.success('Novofon настроен', { description: 'Диагностика и тестовая команда прошли успешно.' });
      } else {
        const failed = (data?.steps || []).find((s: DiagnosticStep) => !s.ok);
        toast.error('Novofon требует настройки', { description: failed?.message || data?.error || 'Откройте детали проверки ниже.' });
      }
    } catch (e) {
      toast.error('Ошибка проверки Novofon', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setChecking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Проверить Novofon</DialogTitle>
          <DialogDescription>
            Проверьте линию — Novofon сначала наберёт менеджера, после ответа соединит с тестовым номером.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="test-phone">Ваш номер</Label>
          <Input
            id="test-phone"
            value={phone}
            onChange={(e) => setPhone(normalizePhone(e.target.value))}
            onFocus={(e) => { if (!phone) setPhone('+7 '); e.currentTarget.setSelectionRange(phone.length + 3, phone.length + 3); }}
            placeholder="+7 999 123-45-67"
            inputMode="tel"
            autoFocus
          />

          <p className="text-[11px] text-muted-foreground">
            Не указывайте купленный номер Novofon как тестовый — провайдер запрещает звонок на собственный виртуальный номер.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Если проверка пишет про ключ Call API, включите в Novofon у пользователя АТС API-доступ и постоянный ключ: Телефония → Пользователи АТС → Администратор → API.
          </p>
        </div>
        {steps.length > 0 && (
          <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Проверка Novofon</span>
              <Badge variant={steps.every((s) => s.ok) ? 'secondary' : 'destructive'} className="text-[10px]">
                {steps.every((s) => s.ok) ? 'Готово' : 'Нужна настройка'}
              </Badge>
            </div>
            <Separator />
            <div className="space-y-2">
              {steps.map((step) => (
                <div key={step.key} className="flex items-start gap-2 text-xs">
                  {step.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 text-destructive" />}
                  <div>
                    <div className="font-medium">{step.label}</div>
                    <div className="text-muted-foreground">{step.message}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Отмена
          </Button>
          <Button variant="outline" onClick={check} disabled={checking || loading || !phone.trim()}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${checking ? 'animate-spin' : ''}`} />
            Проверить
          </Button>
          <Button onClick={call} disabled={loading || !phone.trim()}>
            <Phone className="w-4 h-4 mr-1.5" />
            {loading ? 'Звоним…' : 'Позвонить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
