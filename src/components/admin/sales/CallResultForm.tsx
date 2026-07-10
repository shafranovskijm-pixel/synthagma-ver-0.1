import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CALL_RESULTS,
  PAIN_OPTIONS,
  NEXT_ACTION_OPTIONS,
  SEND_INFO_CHANNELS,
  type CallResultKey,
  type NextActionKey,
  type SendInfoChannel,
} from '@/constants/coldCallScript';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSalesManager, type SalesLead } from '@/hooks/useSalesManager';
import { useSalesTasks } from '@/hooks/useSalesTasks';

interface Props {
  lead: SalesLead | null;
  initialResult?: CallResultKey;
  resetKey?: string | number;
  onSaved?: () => void;
  onSaveAndNext?: () => void;
  onCancel?: () => void;
  compact?: boolean;
}

function suggestDueDate(result: CallResultKey): string {
  const d = new Date();
  // «КП отправлено» / «отправить материалы» — перезвон через 3 дня
  // «Перезвонить позже» — через 3 дня
  // остальное (интересно, демо и т.п.) — завтра
  const addDays =
    result === 'proposal_sent' || result === 'send_proposal' || result === 'send_info'
      ? 3
      : result === 'callback_later'
        ? 3
        : 1;
  d.setDate(d.getDate() + addDays);
  d.setHours(10, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

function suggestNextStep(result: CallResultKey): NextActionKey {
  switch (result) {
    case 'not_interested':
    case 'blacklist':
    case 'archive':
      return 'none';
    case 'send_info':
    case 'send_proposal':
    case 'proposal_sent':
      return 'send_info';
    case 'demo_scheduled':
      return 'demo';
    case 'interested':
    case 'callback_later':
    case 'no_answer':
    case 'gatekeeper':
    case 'wrong_number':
    default:
      return 'callback';
  }
}

export function CallResultForm({ lead, initialResult, resetKey, onSaved, onSaveAndNext, onCancel }: Props) {
  const { addActivity, updateLeadStatus, ensureCurrentManagerId } = useSalesManager();
  const { create: createTask } = useSalesTasks();

  const [result, setResult] = useState<CallResultKey>(initialResult || 'interested');
  const [comment, setComment] = useState('');
  const [pain, setPain] = useState<string>('');
  const [painCustom, setPainCustom] = useState('');
  const [nextStep, setNextStep] = useState<NextActionKey>(suggestNextStep(initialResult || 'interested'));
  const [dueDate, setDueDate] = useState<string>(suggestDueDate(initialResult || 'interested'));
  const [channel, setChannel] = useState<SendInfoChannel>('whatsapp');
  const [handoverTo, setHandoverTo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const initial = initialResult || 'interested';
    setResult(initial);
    setComment('');
    setPain('');
    setPainCustom('');
    setNextStep(suggestNextStep(initial));
    setDueDate(suggestDueDate(initial));
    setChannel('whatsapp');
    setHandoverTo('');
  }, [initialResult, resetKey, lead?.id]);

  const painValue = pain === '__custom__' ? painCustom.trim() : pain;

  const save = async (openNext: boolean) => {
    if (!lead) return;
    const requiresDate =
      result === 'interested' ||
      result === 'proposal_sent' ||
      result === 'send_proposal' ||
      result === 'send_info' ||
      result === 'callback_later' ||
      result === 'demo_scheduled';
    if (requiresDate && !dueDate) {
      toast.error('Укажите дату следующего касания');
      return;
    }
    setSaving(true);
    try {
      const resultMeta = CALL_RESULTS.find(r => r.key === result);
      const stepMeta = NEXT_ACTION_OPTIONS.find(s => s.key === nextStep);

      const descriptionParts: string[] = [`Результат: ${resultMeta?.label || result}`];
      if (comment) descriptionParts.push(`Комментарий: ${comment}`);
      if (painValue) descriptionParts.push(`Боль: ${painValue}`);
      if (stepMeta && stepMeta.key !== 'none') {
        let stepLine = `Следующий шаг: ${stepMeta.label}`;
        if (nextStep === 'send_info') {
          const ch = SEND_INFO_CHANNELS.find(c => c.key === channel)?.label;
          stepLine += ` · канал: ${ch}`;
        }
        if (nextStep === 'to_manager' && handoverTo) {
          stepLine += ` · кому: ${handoverTo}`;
        }
        if (nextStep === 'callback' || nextStep === 'demo' || nextStep === 'send_info') {
          stepLine += ` · ${new Date(dueDate).toLocaleString('ru-RU')}`;
        }
        descriptionParts.push(stepLine);
      }

      await addActivity(lead.id, null, 'call', descriptionParts.join('\n'));

      if (resultMeta?.status) {
        await updateLeadStatus(lead.id, resultMeta.status);
      }

      if (stepMeta && stepMeta.key !== 'none' && stepMeta.key !== 'to_manager') {
        const mid = await ensureCurrentManagerId();
        const { data: u } = await supabase.auth.getUser();
        const type: 'call' | 'meeting' | 'email' | 'followup' =
          stepMeta.key === 'callback' ? 'call'
          : stepMeta.key === 'demo' ? 'meeting'
          : stepMeta.key === 'send_info' ? 'email'
          : 'followup';
        const title =
          stepMeta.key === 'send_info'
            ? `Отправить (${SEND_INFO_CHANNELS.find(c => c.key === channel)?.label}): ${lead.org_name}`
            : `${stepMeta.label}: ${lead.org_name}`;
        await createTask.mutateAsync({
          lead_id: lead.id,
          manager_id: mid,
          assigned_user_id: u.user?.id || null,
          due_date: new Date(dueDate).toISOString(),
          title,
          description: comment || null,
          status: 'pending',
          type,
        });
      }

      toast.success('Результат сохранён');
      onSaved?.();
      if (openNext) onSaveAndNext?.();
    } catch (e: any) {
      toast.error('Ошибка сохранения', { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const showDate = nextStep === 'callback' || nextStep === 'demo' || nextStep === 'send_info';

  return (
    <div className="space-y-3">
      <div>
        <Label>Результат</Label>
        <Select value={result} onValueChange={v => { const r = v as CallResultKey; setResult(r); setNextStep(suggestNextStep(r)); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CALL_RESULTS.map(r => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Комментарий</Label>
        <Textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="Что обсудили" />
      </div>

      <div>
        <Label>Боль клиента</Label>
        <Select value={pain} onValueChange={setPain}>
          <SelectTrigger><SelectValue placeholder="Выберите вариант" /></SelectTrigger>
          <SelectContent>
            {PAIN_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            <SelectItem value="__custom__">Своё…</SelectItem>
          </SelectContent>
        </Select>
        {pain === '__custom__' && (
          <Input
            className="mt-2"
            value={painCustom}
            onChange={e => setPainCustom(e.target.value)}
            placeholder="Опишите боль словами клиента"
          />
        )}
      </div>

      <div>
        <Label>Следующий шаг</Label>
        <Select value={nextStep} onValueChange={v => setNextStep(v as NextActionKey)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {NEXT_ACTION_OPTIONS.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {nextStep === 'send_info' && (
        <div>
          <Label>Канал</Label>
          <Select value={channel} onValueChange={v => setChannel(v as SendInfoChannel)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SEND_INFO_CHANNELS.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {nextStep === 'to_manager' && (
        <div>
          <Label>Кому передать</Label>
          <Input value={handoverTo} onChange={e => setHandoverTo(e.target.value)} placeholder="Имя / должность руководителя" />
        </div>
      )}

      {showDate && (
        <div>
          <Label>Дата и время</Label>
          <Input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
      )}

      <div className="flex flex-wrap gap-2 justify-end pt-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={saving}>Отмена</Button>
        )}
        <Button variant="outline" onClick={() => save(false)} disabled={saving}>Сохранить</Button>
        {onSaveAndNext && (
          <Button onClick={() => save(true)} disabled={saving}>Сохранить и открыть следующую</Button>
        )}
      </div>
    </div>
  );
}
