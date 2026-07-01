import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSalesTasks } from '@/hooks/useSalesTasks';

interface AssignTaskDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  manager?: { id: string; user_id: string; full_name: string } | null;
  leadId?: string | null;
  companyName?: string | null;
}

const TYPES = [
  { value: 'call', label: 'Звонок' },
  { value: 'email', label: 'Письмо' },
  { value: 'meeting', label: 'Встреча' },
  { value: 'followup', label: 'Касание' },
  { value: 'other', label: 'Другое' },
] as const;

function defaultDueDateTime(): string {
  const d = new Date();
  d.setHours(d.getHours() + 24);
  d.setMinutes(0, 0, 0);
  // datetime-local wants YYYY-MM-DDTHH:mm
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AssignTaskDialog({ open, onOpenChange, manager, leadId, companyName }: AssignTaskDialogProps) {
  const { create } = useSalesTasks();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<typeof TYPES[number]['value']>('call');
  const [due, setDue] = useState<string>(defaultDueDateTime());

  useEffect(() => {
    if (open) {
      setTitle(companyName ? `Задача по ${companyName}` : '');
      setDescription('');
      setType('call');
      setDue(defaultDueDateTime());
    }
  }, [open, companyName]);

  const submit = async () => {
    if (!title.trim()) return;
    await create.mutateAsync({
      title: title.trim(),
      description: description.trim() || null,
      type,
      status: 'pending',
      due_date: new Date(due).toISOString(),
      lead_id: leadId ?? null,
      manager_id: manager?.id ?? null,
      assigned_user_id: manager?.user_id ?? null,
    } as any);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Поставить задачу{manager ? ` — ${manager.full_name}` : ''}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <Label>Название</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Позвонить клиенту…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Тип</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Срок</Label>
              <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Описание</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Детали…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={submit} disabled={create.isPending || !title.trim()}>
            {create.isPending ? 'Сохранение…' : 'Создать задачу'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
