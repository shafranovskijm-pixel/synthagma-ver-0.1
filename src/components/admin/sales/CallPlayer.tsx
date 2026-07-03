import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, Play, Download } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  callLogId: string;
  allowDownload?: boolean;
  autoLoad?: boolean;
}

const SPEEDS = [1, 1.25, 1.5, 2];

export function CallPlayer({ callLogId, allowDownload, autoLoad }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [speed, setSpeed] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = async () => {
    if (url || loading) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('novofon-recording-url', {
        body: { call_log_id: callLogId },
      });
      if (error) throw error;
      if (data?.url) setUrl(data.url);
      else toast.info('Запись пока недоступна');
    } catch (e) {
      toast.error('Не удалось получить запись', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (autoLoad) void load(); /* eslint-disable-next-line */ }, [autoLoad, callLogId]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed, url]);

  if (!url) {
    return (
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={load} disabled={loading}>
        {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
        Прослушать
      </Button>
    );
  }

  return (
    <div className="space-y-1.5">
      <audio
        ref={audioRef}
        src={url}
        controls
        className="w-full h-8"
        controlsList={allowDownload ? undefined : 'nodownload'}
      />
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[10px] text-muted-foreground mr-1">Скорость:</span>
        {SPEEDS.map(s => (
          <Button
            key={s}
            size="sm"
            variant={s === speed ? 'default' : 'outline'}
            className="h-6 px-2 text-[10px]"
            onClick={() => setSpeed(s)}
          >
            {s}x
          </Button>
        ))}
        {allowDownload && (
          <a
            href={url}
            download
            className="ml-auto inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            <Download className="w-3 h-3" /> Скачать
          </a>
        )}
      </div>
    </div>
  );
}
