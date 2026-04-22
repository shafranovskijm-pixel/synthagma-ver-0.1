import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Phone, StickyNote } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyName: string;
  inn?: string | null;
  defaultType?: 'call' | 'note';
  organizationId?: string | null;
  onLogged?: () => void;
}

export function LogActivityDialog({
  open, onOpenChange, companyName, inn, defaultType = 'call',
  organizationId, onLogged,
}: Props) {
  const { user } = useAuth();
  const [type, setType] = useState<'call' | 'note'>(defaultType);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setType(defaultType); }, [defaultType, open]);
  useEffect(() => { if (!open) setText(''); }, [open]);

  const safeInn = (inn && inn !== '—') ? inn.trim() : null;

  async function getOrCreateLeadId(): Promise<string | null> {
    // 1. Поиск по ИНН
    if (safeInn) {
      const { data } = await supabase
        .from('sales_leads')
        .select('id')
        .eq('inn', safeInn)
        .limit(1)
        .maybeSingle();
      if (data?.id) return data.id;
    }
    // 2. Поиск по названию (точное совпадение)
    if (companyName) {
      const { data } = await supabase
        .from('sales_leads')
        .select('id')
        .eq('org_name', companyName)
        .limit(1)
        .maybeSingle();
      if (data?.id) return data.id;
    }
    // 3. Создаём лид «на лету»
    const insertPayload: any = {
      org_name: companyName,
      inn: safeInn,
      status: 'new',
      source: 'manual',
    };
    if (organizationId) insertPayload.organization_id = organizationId;
    const { data: created, error } = await supabase
      .from('sales_leads')
      .insert(insertPayload)
      .select('id')
      .single();
    if (error) {
      console.error('create lead error', error);
      toast.error('Не удалось создать лид', { description: error.message });
      return null;
    }
    return created?.id || null;
  }

  async function getOrCreateManagerId(): Promise<string | null> {
    if (!user?.id) return null;
    const { data } = await supabase
      .from('sales_managers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data?.id) return data.id;
    // Авто-создание менеджера для текущего пользователя
    const fullName =
      (user.user_metadata as any)?.full_name ||
      (user.user_metadata as any)?.name ||
      user.email ||
      'Менеджер';
    const { data: created, error } = await supabase
      .from('sales_managers')
      .insert({ user_id: user.id, full_name: fullName, is_active: true })
      .select('id')
      .single();
    if (error) {
      console.error('create manager error', error);
      return null;
    }
    return created?.id || null;
  }

  async function handleSave() {
    if (!text.trim()) {
      toast.error('Введите текст');
      return;
    }
    setSubmitting(true);
    try {
      const leadId = await getOrCreateLeadId();
      if (!leadId) return;
      const managerId = await getOrCreateManagerId();
      if (!managerId) {
        toast.error('Не удалось определить менеджера');
        return;
      }
      const payload: any = {
        lead_id: leadId,
        manager_id: managerId,
        activity_type: type,
        description: text.trim(),
      };
      if (organizationId) payload.organization_id = organizationId;
      const { error } = await supabase.from('sales_lead_activities').insert(payload);
      if (error) throw error;
      // Обновляем last_contact_at у лида
      await supabase
        .from('sales_leads')
        .update({ last_contact_at: new Date().toISOString() } as any)
        .eq('id', leadId);
      toast.success(type === 'call' ? 'Звонок записан' : 'Заметка сохранена');
      setText('');
      onOpenChange(false);
      onLogged?.();
    } catch (e: any) {
      console.error(e);
      toast.error('Ошибка', { description: e.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-md">
        <DialogHeader>
          <DialogTitle>
            {type === 'call' ? 'Записать звонок' : 'Добавить заметку'} — {companyName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Тип</Label>
            <RadioGroup value={type} onValueChange={(v) => setType(v as any)} className="flex gap-3 mt-1.5">
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg border hover:bg-muted/30 flex-1">
                <RadioGroupItem value="call" id="lt-call" />
                <Phone className="w-4 h-4 text-primary" />
                <span className="text-sm">Звонок</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg border hover:bg-muted/30 flex-1">
                <RadioGroupItem value="note" id="lt-note" />
                <StickyNote className="w-4 h-4 text-primary" />
                <span className="text-sm">Заметка</span>
              </label>
            </RadioGroup>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              {type === 'call' ? 'Что обсудили / результат' : 'Текст заметки'}
            </Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder={type === 'call' ? 'Короткое резюме разговора...' : 'Произвольная заметка...'}
              className="rounded-xl mt-1.5"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={submitting || !text.trim()} className="rounded-xl">
              {submitting ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
