import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CALL_RESULTS, type CallResultKey } from '@/constants/coldCallScript';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSalesManager, type SalesLead } from '@/hooks/useSalesManager';
import { useSalesTasks } from '@/hooks/useSalesTasks';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: SalesLead | null;
  initialResult?: CallResultKey;
  onSaved?: () => void;
  onSaveAndNext?: () => void;
}

const NEXT_STEPS = [
  { key: 'none', label: 'Ничего' },
  { key: 'callback', label: 'Перезвон', type: 'call' as const },
  { key: 'demo', label: 'Демо', type: 'meeting' as const },
  { key: 'proposal', label: 'Отправить КП', type: 'email' as const },
  { key: 'contract', label: 'Договор', type: 'followup' as const },
];

function tomorrow10(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

export function CallResultModal({ open, onOpenChange, lead, initialResult, onSaved, onSaveAndNext }: Props) {
  const { addActivity, updateLeadStatus, ensureCurrentManagerId } = useSalesManager();
  const { create: createTask } = useSalesTasks();

  const [result, setResult] = useState<CallResultKey>('interested');
  const [comment, setComment] = useState('');
  const [pain, setPain] = useState('');
  const [nextStep, setNextStep] = useState<string>('callback');
  const [dueDate, setDueDate] = useState<string>(tomorrow10());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setResult(initialResult || 'interested');
    setComment('');
    setPain('');
    setNextStep(initialResult === 'not_interested' || initialResult === 'archive' ? 'none' : 'callback');
    setDueDate(tomorrow10());
  }, [open, initialResult]);

  const save = async (openNext: boolean) => {
    if (!lead) return;
    setSaving(true);
    try {
      const resultMeta = CALL_RESULTS.find(r => r.key === result);
      const description = [
        `Результат: ${resultMeta?.label || result}`,
        comment && `Комментарий: ${comment}`,
        pain && `Боль/потребность: ${pain}`,
      ].filter(Boolean).join('\n');

      await addActivity(lead.id, null, 'call', description);

      if (resultMeta?.status) {
        await updateLeadStatus(lead.id, resultMeta.status);
      }

      const step = NEXT_STEPS.find(s => s.key === nextStep);
      if (step && step.key !== 'none') {
        const mid = await ensureCurrentManagerId();
        const { data: u } = await supabase.auth.getUser();
        await createTask.mutateAsync({
          lead_id: lead.id,
          manager_id: mid,
          assigned_user_id: u.user?.id || null,
          due_date: new Date(dueDate).toISOString(),
          title: `${step.label}: ${lead.org_name}`,
          description: comment || null,
          status: 'pending',
          type: step.type,
        });
      }

      toast.success('Результат сохранён');
      onSaved?.();
      onOpenChange(false);
      if (openNext) onSaveAndNext?.();
    } catch (e: any) {
      toast.error('Ошибка сохранения', { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Результат звонка · {lead?.org_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Результат</Label>
            <Select value={result} onValueChange={v => setResult(v as CallResultKey)}>
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
            <Label>Боль / потребность клиента</Label>
            <Textarea rows={2} value={pain} onChange={e => setPain(e.target.value)} placeholder="Словами клиента" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Следующий шаг</Label>
              <Select value={nextStep} onValueChange={setNextStep}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NEXT_STEPS.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Дата касания</Label>
              <Input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} disabled={nextStep === 'none'} />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => save(false)} disabled={saving}>Сохранить</Button>
          {onSaveAndNext && (
            <Button onClick={() => save(true)} disabled={saving}>Сохранить и открыть следующую</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
