import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, CheckCircle2, Trash2, Phone, Mail, Calendar as CalIcon, Repeat, MoreHorizontal, ListTodo, ExternalLink } from 'lucide-react';
import { useSalesTasks } from '@/hooks/useSalesTasks';
import { useSalesManager } from '@/hooks/useSalesManager';
import { format, isPast, isToday, isTomorrow, differenceInDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { SigmaSpinner } from '@/components/ui/SigmaSpinner';

const TYPE_ICON = {
  call: Phone,
  email: Mail,
  meeting: CalIcon,
  followup: Repeat,
  other: MoreHorizontal,
} as const;

const TYPE_LABEL = {
  call: 'Звонок',
  email: 'Письмо',
  meeting: 'Встреча',
  followup: 'Касание',
  other: 'Другое',
} as const;

interface SalesTasksProps {
  organizationId?: string;
  prefillCompany?: { name: string; inn?: string | null } | null;
  onPrefillConsumed?: () => void;
  onOpenDeal?: (inn: string) => void;
}

export function SalesTasks({ organizationId, prefillCompany, onPrefillConsumed, onOpenDeal }: SalesTasksProps = {}) {
  const { list, create, complete, remove } = useSalesTasks(organizationId ? { organizationId } : undefined);
  const { managers, fetchManagers, leads, fetchLeads } = useSalesManager();

  // Загрузим лидов сразу — нужно для маппинга lead_id → ИНН и для кнопки «Открыть сделку»
  useEffect(() => { fetchLeads(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const leadById = new Map<string, { inn: string | null; org_name: string }>(
    (leads || []).map((l: any) => [l.id, { inn: l.inn, org_name: l.org_name }])
  );
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'open' | 'today' | 'overdue' | 'done'>('open');
  const [prefillTitle, setPrefillTitle] = useState<string>('');

  // Открыть форму с предзаполненной компанией
  useEffect(() => {
    if (prefillCompany?.name) {
      setPrefillTitle(`Связаться с ${prefillCompany.name}`);
      fetchManagers();
      fetchLeads();
      setOpen(true);
      onPrefillConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillCompany?.name]);

  const tasks = list.data || [];
  const filtered = tasks.filter(t => {
    if (tab === 'done') return t.status === 'done';
    if (t.status !== 'pending') return false;
    const d = new Date(t.due_date);
    if (tab === 'today') return isToday(d);
    if (tab === 'overdue') return isPast(d) && !isToday(d);
    return true;
  });

  const counts = {
    open: tasks.filter(t => t.status === 'pending').length,
    today: tasks.filter(t => t.status === 'pending' && isToday(new Date(t.due_date))).length,
    overdue: tasks.filter(t => t.status === 'pending' && isPast(new Date(t.due_date)) && !isToday(new Date(t.due_date))).length,
    done: tasks.filter(t => t.status === 'done').length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <ListTodo className="w-5 h-5 text-primary" />
            Задачи менеджера
          </h2>
          <p className="text-sm text-muted-foreground">Звонки, встречи, касания и напоминания</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) { fetchManagers(); fetchLeads(); } if (!v) setPrefillTitle(''); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-xl"><Plus className="w-4 h-4 mr-1" />Новая задача</Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl max-w-md">
            <DialogHeader><DialogTitle>Новая задача</DialogTitle></DialogHeader>
            <NewTaskForm
              managers={managers}
              leads={leads}
              initialTitle={prefillTitle}
              onSubmit={async (input) => {
                await create.mutateAsync(input);
                setOpen(false);
                setPrefillTitle('');
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="rounded-xl">
          <TabsTrigger value="open" className="rounded-lg">Все ({counts.open})</TabsTrigger>
          <TabsTrigger value="today" className="rounded-lg">Сегодня ({counts.today})</TabsTrigger>
          <TabsTrigger value="overdue" className="rounded-lg text-rose-600">Просрочено ({counts.overdue})</TabsTrigger>
          <TabsTrigger value="done" className="rounded-lg">Выполнено ({counts.done})</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          <Card className="rounded-2xl">
            <CardContent className="p-3">
              {list.isLoading ? (
                <div className="flex justify-center py-8"><SigmaSpinner size="md" /></div>
              ) : filtered.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-12">
                  {tab === 'today' ? '🎉 На сегодня всё чисто' : 'Нет задач'}
                </div>
              ) : (
                <ScrollArea className="h-[calc(100vh-340px)]">
                  <div className="space-y-2 pr-2">
                    {filtered.map(t => {
                      const Icon = TYPE_ICON[t.type] || MoreHorizontal;
                      const date = new Date(t.due_date);
                      const overdue = isPast(date) && !isToday(date) && t.status === 'pending';
                      const today = isToday(date);
                      const days = differenceInDays(date, new Date());
                      return (
                        <div key={t.id} className={cn(
                          "flex items-start gap-3 p-3 rounded-xl border transition-all",
                          overdue ? 'border-rose-500/30 bg-rose-500/5' :
                          today ? 'border-amber-500/30 bg-amber-500/5' :
                          'border-border'
                        )}>
                          <div className={cn(
                            "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                            overdue ? 'bg-rose-500/10 text-rose-600' :
                            today ? 'bg-amber-500/10 text-amber-600' :
                            'bg-muted text-muted-foreground'
                          )}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{t.title}</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                {TYPE_LABEL[t.type]}
                              </Badge>
                            </div>
                            {t.description && (
                              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</div>
                            )}
                            <div className="text-xs mt-1 flex items-center gap-2 text-muted-foreground">
                              <CalIcon className="w-3 h-3" />
                              {format(date, 'dd MMM, HH:mm', { locale: ru })}
                              {overdue && <span className="text-rose-600">• просрочено на {Math.abs(days)} дн.</span>}
                              {today && <span className="text-amber-600">• сегодня</span>}
                              {!overdue && !today && days > 0 && <span>• через {days} дн.</span>}
                            </div>
                          </div>
                          {t.status === 'pending' && (
                            <Button size="sm" variant="ghost" onClick={() => complete.mutate(t.id)}
                              className="rounded-lg h-8" title="Выполнено">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => remove.mutate(t.id)}
                            className="rounded-lg h-8" title="Удалить">
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NewTaskForm({ managers, leads, onSubmit, initialTitle = '' }:
  { managers: any[]; leads: any[]; onSubmit: (i: any) => Promise<void>; initialTitle?: string }) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'call' | 'email' | 'meeting' | 'followup' | 'other'>('call');
  const [dueDate, setDueDate] = useState(format(new Date(Date.now() + 24 * 3600 * 1000), "yyyy-MM-dd'T'HH:mm"));
  const [managerId, setManagerId] = useState<string>(managers[0]?.id || '');
  const [leadId, setLeadId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground">Заголовок</label>
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Перезвонить ИП Иванову"
          className="rounded-xl" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Тип</label>
          <Select value={type} onValueChange={(v) => setType(v as any)}>
            <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="call">Звонок</SelectItem>
              <SelectItem value="email">Письмо</SelectItem>
              <SelectItem value="meeting">Встреча</SelectItem>
              <SelectItem value="followup">Касание</SelectItem>
              <SelectItem value="other">Другое</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Срок</label>
          <Input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)}
            className="rounded-xl" />
          <p className="text-[10px] text-muted-foreground mt-1">
            В вашем часовом поясе ({Intl.DateTimeFormat().resolvedOptions().timeZone})
          </p>
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Менеджер (необязательно)</label>
        {managers.length === 0 ? (
          <p className="text-xs text-muted-foreground p-2 rounded-lg bg-muted/40 border">
            В вашей организации нет менеджеров продаж — задача будет создана без привязки к менеджеру.
          </p>
        ) : (
          <Select value={managerId || 'none'} onValueChange={(v) => setManagerId(v === 'none' ? '' : v)}>
            <SelectTrigger className="rounded-xl"><SelectValue placeholder="Без менеджера" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Без менеджера —</SelectItem>
              {managers.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Лид (опционально)</label>
        <Select value={leadId || 'none'} onValueChange={(v) => setLeadId(v === 'none' ? '' : v)}>
          <SelectTrigger className="rounded-xl"><SelectValue placeholder="Без привязки" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Без привязки —</SelectItem>
            {leads.slice(0, 100).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.org_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Заметка</label>
        <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
          className="rounded-xl" />
      </div>
      <Button className="w-full rounded-xl" disabled={!title.trim() || submitting}
        onClick={async () => {
          setSubmitting(true);
          try {
            await onSubmit({
              title: title.trim(), description: description.trim() || null,
              type, due_date: new Date(dueDate).toISOString(),
              manager_id: managerId || null, lead_id: leadId || null,
              status: 'pending',
            });
            setTitle(''); setDescription('');
          } finally { setSubmitting(false); }
        }}>
        {submitting ? 'Создание...' : 'Создать задачу'}
      </Button>
    </div>
  );
}
