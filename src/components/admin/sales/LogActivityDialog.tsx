import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Phone, StickyNote } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from "@/utils/handleSupabaseError";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyName: string;
  inn?: string | null;
  defaultType?: 'call' | 'note';
  organizationId?: string | null;
  onLogged?: () => void;
}

type CallResult = 'connected' | 'busy' | 'not_interested' | 'next_step';

const RESULT_LABELS: Record<CallResult, string> = {
  connected: '✅ Дозвонился, поговорили',
  busy: '⏳ Занят / не взял трубку',
  not_interested: '❌ Не интересуется',
  next_step: '🎯 Договорились о следующем шаге',
};

export function LogActivityDialog({
  open, onOpenChange, companyName, inn, defaultType = 'call',
  organizationId, onLogged,
}: Props) {
  const { user } = useAuth();
  const [type, setType] = useState<'call' | 'note'>(defaultType);
  const [text, setText] = useState('');
  const [duration, setDuration] = useState<string>(''); // мин
  const [result, setResult] = useState<CallResult>('connected');
  const [createReminder, setCreateReminder] = useState(false);
  const [reminderDays, setReminderDays] = useState<string>('3');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setType(defaultType); }, [defaultType, open]);
  useEffect(() => {
    if (!open) {
      setText(''); setDuration(''); setResult('connected');
      setCreateReminder(false); setReminderDays('3');
    }
  }, [open]);

  const safeInn = (inn && inn !== '—') ? inn.trim() : null;

  async function getOrCreateLeadId(): Promise<string | null> {
    if (safeInn) {
      const { data } = await supabase
        .from('sales_leads').select('id').eq('inn', safeInn).limit(1).maybeSingle();
      if (data?.id) return data.id;
    }
    if (companyName) {
      const { data } = await supabase
        .from('sales_leads').select('id').eq('org_name', companyName).limit(1).maybeSingle();
      if (data?.id) return data.id;
    }
    const insertPayload: any = {
      org_name: companyName,
      inn: safeInn,
      status: 'new',
      source: 'manual',
    };
    if (organizationId) insertPayload.organization_id = organizationId;
    const { data: created, error } = await supabase
      .from('sales_leads').insert(insertPayload).select('id').single();
    if (error) {
      console.error('create lead error', error);
      toast.error('Не удалось создать лид', { description: getErrorMessage(error) });
      return null;
    }
    return created?.id || null;
  }

  async function getOrCreateManagerId(): Promise<string | null> {
    if (!user?.id) return null;
    const { data } = await supabase
      .from('sales_managers').select('id').eq('user_id', user.id).maybeSingle();
    if (data?.id) return data.id;
    const fullName =
      (user.user_metadata as any)?.full_name ||
      (user.user_metadata as any)?.name ||
      user.email || 'Менеджер';
    const { data: created, error } = await supabase
      .from('sales_managers')
      .insert({ user_id: user.id, full_name: fullName, is_active: true })
      .select('id').single();
    if (error) { console.error('create manager error', error); return null; }
    return created?.id || null;
  }

  async function handleSave() {
    if (!text.trim()) { toast.error('Введите текст'); return; }
    setSubmitting(true);
    try {
      const leadId = await getOrCreateLeadId();
      if (!leadId) return;
      const managerId = await getOrCreateManagerId();
      if (!managerId) { toast.error('Не удалось определить менеджера'); return; }

      // Собираем расширенное описание для звонка
      let description = text.trim();
      if (type === 'call') {
        const parts: string[] = [];
        parts.push(`[${RESULT_LABELS[result]}]`);
        if (duration && Number(duration) > 0) parts.push(`Длительность: ${duration} мин`);
        description = `${parts.join(' • ')}\n${description}`;
      }

      const payload: any = {
        lead_id: leadId,
        manager_id: managerId,
        activity_type: type,
        description,
      };
      if (organizationId) payload.organization_id = organizationId;
      const { error } = await supabase.from('sales_lead_activities').insert(payload);
      if (error) throw error;

      // last_contact_at + при «не интересно» — автоматически закрываем лид
      const leadUpdate: any = { last_contact_at: new Date().toISOString() };
      if (type === 'call' && result === 'not_interested') {
        leadUpdate.status = 'not_interested';
      }
      await supabase
        .from('sales_leads')
        .update(leadUpdate)
        .eq('id', leadId);

      // Авто-задача-напоминание
      if (createReminder) {
        const days = Math.max(1, Math.min(60, Number(reminderDays) || 3));
        const due = new Date();
        due.setDate(due.getDate() + days);
        due.setHours(10, 0, 0, 0);
        const taskPayload: any = {
          title: `Перезвонить ${companyName}`,
          description: text.trim().slice(0, 500),
          type: 'call',
          due_date: due.toISOString(),
          status: 'pending',
          manager_id: managerId,
          lead_id: leadId,
        };
        if (organizationId) taskPayload.organization_id = organizationId;
        const { error: taskErr } = await supabase.from('sales_tasks').insert(taskPayload);
        if (taskErr) {
          console.error('create reminder task error', taskErr);
          toast.error('Активность сохранена, но не удалось создать задачу-напоминание', { description: getErrorMessage(taskErr) });
        } else {
          toast.success(`Поставил задачу-перезвон через ${days} дн.`);
        }
      }

      toast.success(type === 'call' ? 'Звонок записан' : 'Заметка сохранена');
      onOpenChange(false);
      onLogged?.();
    } catch (e) {
      console.error(e);
      toast.error('Ошибка', { description: getErrorMessage(e) });
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

          {type === 'call' && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground">Результат</Label>
                <RadioGroup value={result} onValueChange={(v) => setResult(v as CallResult)} className="grid grid-cols-2 gap-1.5 mt-1.5">
                  {(Object.keys(RESULT_LABELS) as CallResult[]).map(k => (
                    <label key={k} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg border hover:bg-muted/30 text-xs">
                      <RadioGroupItem value={k} id={`r-${k}`} />
                      <span>{RESULT_LABELS[k]}</span>
                    </label>
                  ))}
                </RadioGroup>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Длительность, мин</Label>
                <Input
                  type="number" min="0" max="999" value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="например, 5"
                  className="rounded-xl mt-1.5"
                />
              </div>
            </>
          )}

          <div>
            <Label className="text-xs text-muted-foreground">
              {type === 'call' ? 'Что обсудили / результат' : 'Текст заметки'}
            </Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder={type === 'call' ? 'Короткое резюме разговора...' : 'Произвольная заметка...'}
              className="rounded-xl mt-1.5"
              autoFocus
            />
          </div>

          <div className="rounded-xl border p-3 bg-muted/20 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={createReminder} onCheckedChange={(v) => setCreateReminder(!!v)} />
              <span className="text-sm">Поставить задачу-напоминание</span>
            </label>
            {createReminder && (
              <div className="flex items-center gap-2 pl-6">
                <span className="text-xs text-muted-foreground">через</span>
                <Input
                  type="number" min="1" max="60" value={reminderDays}
                  onChange={(e) => setReminderDays(e.target.value)}
                  className="rounded-lg h-8 w-20"
                />
                <span className="text-xs text-muted-foreground">дн.</span>
              </div>
            )}
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
