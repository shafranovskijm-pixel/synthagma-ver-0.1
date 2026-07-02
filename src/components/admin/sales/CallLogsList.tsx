import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Download, Phone, PhoneIncoming, PhoneOutgoing, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';

interface CallLog {
  id: string;
  direction: string;
  from_number: string | null;
  to_number: string;
  status: string;
  started_at: string;
  duration_sec: number | null;
  has_recording: boolean;
  recording_url: string | null;
  novofon_call_id: string | null;
  notes: string | null;
}

interface Props {
  leadId?: string | null;
  companyInn?: string | null;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  dialing:   { label: 'набор',      cls: 'bg-blue-500/10 text-blue-500' },
  ringing:   { label: 'звонит',     cls: 'bg-blue-500/10 text-blue-500' },
  answered:  { label: 'разговор',   cls: 'bg-emerald-500/10 text-emerald-600' },
  completed: { label: 'завершён',   cls: 'bg-emerald-500/10 text-emerald-600' },
  no_answer: { label: 'без ответа', cls: 'bg-amber-500/10 text-amber-600' },
  busy:      { label: 'занято',     cls: 'bg-amber-500/10 text-amber-600' },
  failed:    { label: 'ошибка',     cls: 'bg-rose-500/10 text-rose-500' },
  canceled:  { label: 'отменён',    cls: 'bg-muted text-muted-foreground' },
};

function fmtDuration(s: number | null): string {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function CallLogsList({ leadId, companyInn }: Props) {
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!leadId && !companyInn) { setLogs([]); return; }
      setLoading(true);
      let q = supabase.from('call_logs')
        .select('id, direction, from_number, to_number, status, started_at, duration_sec, has_recording, recording_url, novofon_call_id, notes')
        .order('started_at', { ascending: false })
        .limit(50);
      if (leadId) q = q.eq('lead_id', leadId);
      else if (companyInn) q = q.eq('company_inn', companyInn);
      const { data } = await q;
      if (!cancel) { setLogs((data || []) as CallLog[]); setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [leadId, companyInn]);

  const listen = async (log: CallLog) => {
    if (playingId === log.id) { setPlayingId(null); setAudioUrl(null); return; }
    try {
      const { data, error } = await supabase.functions.invoke('novofon-recording-url', {
        body: { call_log_id: log.id },
      });
      if (error) throw error;
      if (data?.url) {
        setAudioUrl(data.url);
        setPlayingId(log.id);
      } else {
        toast.info('Запись пока недоступна');
      }
    } catch (e) {
      toast.error('Не удалось получить запись', { description: e instanceof Error ? e.message : String(e) });
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground p-4 text-center"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Загружаем…</div>;
  if (logs.length === 0) return <div className="text-sm text-muted-foreground p-4 text-center">Звонков пока нет</div>;

  return (
    <div className="space-y-2">
      {logs.map((log) => {
        const st = STATUS[log.status] ?? { label: log.status, cls: 'bg-muted' };
        const Icon = log.direction === 'outbound' ? PhoneOutgoing : PhoneIncoming;
        const isPlaying = playingId === log.id;
        return (
          <div key={log.id} className="rounded-lg border bg-muted/20 p-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">{log.to_number || log.from_number || '—'}</span>
              <Badge className={st.cls + ' text-[10px]'}>{st.label}</Badge>
              <span className="text-[11px] text-muted-foreground ml-auto">
                {format(new Date(log.started_at), 'd MMM HH:mm', { locale: ru })} · {fmtDuration(log.duration_sec)}
              </span>
            </div>
            {log.notes && <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{log.notes}</div>}
            {log.has_recording && (
              <div className="mt-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => listen(log)}>
                  <Play className="w-3 h-3 mr-1" />
                  {isPlaying ? 'Скрыть' : 'Прослушать'}
                </Button>
                {isPlaying && audioUrl && (
                  <div className="mt-2">
                    <audio src={audioUrl} controls className="w-full h-8" controlsList="nodownload" />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
