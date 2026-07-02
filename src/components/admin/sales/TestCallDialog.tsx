import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultPhone?: string | null;
}

const LS_KEY = 'sales.test_call_number';

export function TestCallDialog({ open, onOpenChange, defaultPhone }: Props) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const saved = localStorage.getItem(LS_KEY) || '';
    setPhone(saved || defaultPhone || '');
  }, [open, defaultPhone]);

  const call = async () => {
    const to = phone.trim();
    if (!to) { toast.error('Введите номер'); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('novofon-call-start', {
        body: {
          to_number: to,
          company_name: 'Тестовый звонок',
          is_test: true,
        },
      });
      if (error) throw error;
      if (data?.ok) {
        localStorage.setItem(LS_KEY, to);
        toast.success('Звоним', {
          description: 'Возьмите трубку — Novofon перезвонит на этот номер.',
        });
        onOpenChange(false);
      } else {
        toast.error('Не удалось запустить звонок', {
          description: data?.novofon?.message || 'Проверьте настройки Novofon',
        });
      }
    } catch (e) {
      toast.error('Ошибка звонка', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Позвонить себе</DialogTitle>
          <DialogDescription>
            Проверьте линию — Novofon сначала наберёт вас, после ответа соединит с этим же номером.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="test-phone">Ваш номер</Label>
          <Input
            id="test-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+7 999 123-45-67"
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground">
            Тестовые звонки не учитываются в счётчиках смены.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Отмена
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
