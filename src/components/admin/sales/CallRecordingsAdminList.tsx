import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Phone, PhoneIncoming, PhoneOutgoing, Mic, Search, Star, MessageSquareWarning,
  BookmarkCheck, AlertOctagon, ChevronDown, ChevronRight, RefreshCw, Download, Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CallPlayer } from './CallPlayer';

interface CallRow {
  id: string;
  manager_user_id: string;
  direction: string;
  from_number: string | null;
  to_number: string;
  company_inn: string | null;
  company_name: string | null;
  lead_id: string | null;
  status: string;
  started_at: string;
  duration_sec: number | null;
  has_recording: boolean;
  novofon_call_id: string | null;
  notes: string | null;
  review_flag: string;
  review_note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

interface Manager {
  id: string;
  user_id: string | null;
  full_name: string;
}

const STATUS_LABEL: Record<string, string> = {
  dialing: 'набор', ringing: 'звонит', answered: 'разговор',
  completed: 'завершён', no_answer: 'без ответа', busy: 'занято',
  failed: 'ошибка', canceled: 'отменён',
};

const FLAG_META: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  none:       { label: 'без метки', cls: 'bg-muted text-muted-foreground', icon: <span /> },
  important:  { label: 'важная',    cls: 'bg-amber-500/15 text-amber-600', icon: <Star className="w-3 h-3" /> },
  example:    { label: 'пример',    cls: 'bg-emerald-500/15 text-emerald-600', icon: <BookmarkCheck className="w-3 h-3" /> },
  dispute:    { label: 'спорная',   cls: 'bg-blue-500/15 text-blue-600', icon: <MessageSquareWarning className="w-3 h-3" /> },
  complaint:  { label: 'жалоба',    cls: 'bg-rose-500/15 text-rose-600', icon: <AlertOctagon className="w-3 h-3" /> },
};

function fmtDur(s: number | null) {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

const PERIODS = [
  { key: 'today', label: 'Сегодня', hours: 24 },
  { key: '7d', label: '7 дней', hours: 24 * 7 },
  { key: '30d', label: '30 дней', hours: 24 * 30 },
  { key: 'all', label: 'Всё', hours: 0 },
];

export function CallRecordingsAdminList() {
  const [rows, setRows] = useState<CallRow[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [managerFilter, setManagerFilter] = useState<string>('all');
  const [period, setPeriod] = useState<string>('7d');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [minDur, setMinDur] = useState<string>('15');
  const [onlyWithRec, setOnlyWithRec] = useState<boolean>(false);
  const [flagFilter, setFlagFilter] = useState<string>('all');
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const period_ = PERIODS.find(p => p.key === period)!;
      let query = supabase.from('call_logs' as any)
        .select('id, manager_user_id, direction, from_number, to_number, company_inn, company_name, lead_id, status, started_at, duration_sec, has_recording, novofon_call_id, notes, review_flag, review_note, reviewed_at, reviewed_by')
        .order('started_at', { ascending: false })
        .limit(500);
      if (period_.hours > 0) {
        const since = new Date(Date.now() - period_.hours * 3600 * 1000).toISOString();
        query = query.gte('started_at', since);
      }
      if (managerFilter !== 'all') query = query.eq('manager_user_id', managerFilter);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      const minD = Number(minDur) || 0;
      if (minD > 0) query = query.gte('duration_sec', minD);
      if (onlyWithRec) query = query.eq('has_recording', true);
      if (flagFilter !== 'all') query = query.eq('review_flag', flagFilter);
      const { data, error } = await query;
      if (error) throw error;
      setRows((data || []) as unknown as CallRow[]);
    } catch (e) {
      toast.error('Не удалось загрузить журнал', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from('sales_managers').select('id, user_id, full_name').eq('is_active', true);
      setManagers((data || []) as Manager[]);
    })();
  }, []);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [managerFilter, period, statusFilter, minDur, onlyWithRec, flagFilter]);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('admin-call-logs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_logs' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(r =>
      (r.company_name || '').toLowerCase().includes(needle) ||
      (r.company_inn || '').includes(needle) ||
      (r.to_number || '').includes(needle) ||
      (r.from_number || '').includes(needle),
    );
  }, [rows, q]);

  const managerName = (uid: string) => {
    const m = managers.find(x => x.user_id === uid);
    return m?.full_name || uid.slice(0, 8);
  };

  const setFlag = async (row: CallRow, flag: string, note?: string) => {
    const patch: any = {
      review_flag: flag,
      reviewed_at: flag === 'none' ? null : new Date().toISOString(),
    };
    if (note !== undefined) patch.review_note = note || null;
    const { error } = await (supabase as any).from('call_logs').update(patch).eq('id', row.id);
    if (error) { toast.error('Не удалось отметить', { description: error.message }); return; }
    toast.success('Отметка сохранена');
    load();
  };

  const exportCsv = () => {
    const header = ['Дата', 'Менеджер', 'Компания', 'ИНН', 'Направление', 'Номер', 'Статус', 'Длит.', 'Запись', 'Метка', 'Комментарий'];
    const lines = [header.join(';')];
    filtered.forEach(r => {
      lines.push([
        format(new Date(r.started_at), 'yyyy-MM-dd HH:mm'),
        managerName(r.manager_user_id).replace(/;/g, ','),
        (r.company_name || '').replace(/;/g, ','),
        r.company_inn || '',
        r.direction,
        r.direction === 'outbound' ? r.to_number : (r.from_number || ''),
        STATUS_LABEL[r.status] || r.status,
        String(r.duration_sec || 0),
        r.has_recording ? 'да' : 'нет',
        FLAG_META[r.review_flag]?.label || r.review_flag,
        (r.review_note || '').replace(/[;\n\r]/g, ' '),
      ].join(';'));
    });
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `call_logs_${format(new Date(), 'yyyy-MM-dd_HHmm')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openDeal = (inn: string | null) => {
    if (!inn) return;
    try { localStorage.setItem('sales.initialSelectedInn', inn); } catch {}
    window.dispatchEvent(new CustomEvent('admin-tab-switch', { detail: { tab: 'sales-deals' } }));
    toast.info(`Открываю сделку по ИНН ${inn}`);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Mic className="w-4 h-4" /> Записи звонков
          <Badge variant="outline" className="ml-2 text-[10px]">{filtered.length}</Badge>
          <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={exportCsv}>
            <Download className="w-3 h-3 mr-1" /> CSV
          </Button>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Фильтры */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <Select value={managerFilter} onValueChange={setManagerFilter}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Менеджер" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все менеджеры</SelectItem>
              {managers.filter(m => m.user_id).map(m => (
                <SelectItem key={m.id} value={m.user_id!}>{m.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODS.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Статус" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={minDur} onValueChange={setMinDur}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Любая длительность</SelectItem>
              <SelectItem value="15">≥ 15 сек (дозвон)</SelectItem>
              <SelectItem value="60">≥ 1 мин</SelectItem>
              <SelectItem value="180">≥ 3 мин</SelectItem>
            </SelectContent>
          </Select>

          <Select value={flagFilter} onValueChange={setFlagFilter}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Метка" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все метки</SelectItem>
              {Object.entries(FLAG_META).map(([k, m]) => (
                <SelectItem key={k} value={k}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="ИНН, номер, компания…"
              className="h-9 text-xs pl-7"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={onlyWithRec} onChange={e => setOnlyWithRec(e.target.checked)} />
            Только с записью
          </label>
        </div>

        {/* Список */}
        {loading && rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Загружаем…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Ничего не найдено. Попробуйте изменить фильтры или период.
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.map(r => {
              const isOpen = expanded === r.id;
              const Icon = r.direction === 'outbound' ? PhoneOutgoing : PhoneIncoming;
              const flag = FLAG_META[r.review_flag] || FLAG_META.none;
              return (
                <div key={r.id} className={cn('rounded-lg border bg-card', r.review_flag !== 'none' && 'border-primary/30')}>
                  <button
                    className="w-full flex items-center gap-2 p-2.5 text-left hover:bg-muted/40 transition"
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                  >
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                    <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{r.company_name || r.to_number || '—'}</span>
                        {r.company_inn && <Badge variant="outline" className="text-[10px]">ИНН {r.company_inn}</Badge>}
                        <Badge className={cn('text-[10px]', flag.cls)}>
                          <span className="inline-flex items-center gap-1">{flag.icon}{flag.label}</span>
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                        <span>{managerName(r.manager_user_id)}</span>
                        <span>·</span>
                        <span>{r.direction === 'outbound' ? r.to_number : (r.from_number || '—')}</span>
                        <span>·</span>
                        <span>{STATUS_LABEL[r.status] || r.status}</span>
                        <span>·</span>
                        <span>{fmtDur(r.duration_sec)}</span>
                        <span>·</span>
                        <span>{format(new Date(r.started_at), 'd MMM HH:mm', { locale: ru })}</span>
                      </div>
                    </div>
                    {r.has_recording && (
                      <Badge className="bg-emerald-500/10 text-emerald-600 text-[10px]">
                        <Mic className="w-3 h-3 mr-1" />запись
                      </Badge>
                    )}
                  </button>

                  {isOpen && (
                    <div className="border-t px-3 py-3 space-y-3 bg-muted/20">
                      {r.notes && (
                        <div className="text-xs text-muted-foreground whitespace-pre-wrap">
                          <span className="font-medium text-foreground">Заметки: </span>{r.notes}
                        </div>
                      )}
                      {r.has_recording ? (
                        <CallPlayer callLogId={r.id} allowDownload autoLoad />
                      ) : (
                        <div className="text-xs text-muted-foreground">Записи по этому звонку нет.</div>
                      )}

                      {/* Метки */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t">
                        <span className="text-[10px] text-muted-foreground mr-1">Метка:</span>
                        {(['important', 'example', 'dispute', 'complaint'] as const).map(f => (
                          <Button
                            key={f}
                            size="sm"
                            variant={r.review_flag === f ? 'default' : 'outline'}
                            className="h-6 px-2 text-[10px]"
                            onClick={() => setFlag(r, f)}
                          >
                            <span className="inline-flex items-center gap-1">{FLAG_META[f].icon}{FLAG_META[f].label}</span>
                          </Button>
                        ))}
                        {r.review_flag !== 'none' && (
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setFlag(r, 'none', '')}>
                            снять
                          </Button>
                        )}

                        <Popover>
                          <PopoverTrigger asChild>
                            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] ml-auto">
                              Комментарий
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80">
                            <ReviewNoteEditor row={r} onSave={(txt) => setFlag(r, r.review_flag === 'none' ? 'important' : r.review_flag, txt)} />
                          </PopoverContent>
                        </Popover>

                        {r.company_inn && (
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => openDeal(r.company_inn)}>
                            Открыть сделку
                          </Button>
                        )}
                      </div>

                      {r.review_note && (
                        <div className="text-[11px] text-muted-foreground italic">
                          «{r.review_note}»
                          {r.reviewed_at && <span className="ml-1">· {format(new Date(r.reviewed_at), 'd MMM HH:mm', { locale: ru })}</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewNoteEditor({ row, onSave }: { row: CallRow; onSave: (txt: string) => void }) {
  const [txt, setTxt] = useState(row.review_note || '');
  return (
    <div className="space-y-2">
      <Textarea value={txt} onChange={e => setTxt(e.target.value)} placeholder="Комментарий ревьюера…" rows={4} />
      <div className="flex justify-end">
        <Button size="sm" onClick={() => onSave(txt)}>Сохранить</Button>
      </div>
    </div>
  );
}
