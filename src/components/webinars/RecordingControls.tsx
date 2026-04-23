import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Circle, Square, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Status = "idle" | "starting" | "active" | "stopping" | "stopped" | "processing" | "uploading" | "uploaded" | "failed";

interface Props {
  webinarId: string;
}

export const RecordingControls = ({ webinarId }: Props) => {
  const [status, setStatus] = useState<Status>("idle");
  const [externalUrl, setExternalUrl] = useState<string | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pollTimerRef = useRef<number | null>(null);
  const pollDeadlineRef = useRef<number>(0);

  const refresh = async () => {
    const { data } = await supabase
      .from("webinars")
      .select("recording_status, recording_external_url, recording_url")
      .eq("id", webinarId)
      .maybeSingle();
    if (data) {
      setStatus((data.recording_status as Status) || "idle");
      setExternalUrl(data.recording_external_url ?? null);
      setRecordingUrl(data.recording_url ?? null);
    }
  };

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel(`rec-${webinarId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "webinars",
        filter: `id=eq.${webinarId}`,
      }, (payload) => {
        const row = payload.new as {
          recording_status?: Status;
          recording_external_url?: string | null;
          recording_url?: string | null;
        };
        if (row.recording_status) setStatus(row.recording_status);
        if ("recording_external_url" in row) setExternalUrl(row.recording_external_url ?? null);
        if ("recording_url" in row) setRecordingUrl(row.recording_url ?? null);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    };
  }, [webinarId]);

  /**
   * Поллинг копирования: дёргает livekit-copy-recording каждые 10 сек до 5 минут.
   * Останавливается, когда recording_url появился, либо по таймауту.
   */
  const startCopyPolling = () => {
    if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    pollDeadlineRef.current = Date.now() + 5 * 60 * 1000; // 5 минут

    const tick = async () => {
      try {
        const { data } = await supabase.functions.invoke("livekit-copy-recording", {
          body: { webinarId },
        });
        if (data?.ok && data?.url) {
          toast.success("Запись готова и сохранена в Lovable Cloud");
          setStatus("uploaded");
          setRecordingUrl(data.url);
          return;
        }
      } catch (e) {
        console.warn("[recording] copy poll error", e);
      }
      if (Date.now() < pollDeadlineRef.current) {
        pollTimerRef.current = window.setTimeout(tick, 10_000);
      } else {
        toast.error("Запись не удалось получить за 5 минут. Попробуйте кнопку «В Lovable Cloud» вручную.");
      }
    };

    pollTimerRef.current = window.setTimeout(tick, 5_000); // первая попытка через 5 сек
  };

  const start = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("livekit-start-recording", {
        body: { webinarId },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Не удалось запустить запись");
      toast.success("Запись запущена");
      setStatus("active");
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  const stop = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("livekit-stop-recording", {
        body: { webinarId },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Не удалось остановить запись");
      toast.success("Запись остановлена. Файл сохраняется автоматически…");
      setStatus(data.status === "processing" ? "processing" : "stopped");
      // Автоматически запускаем копирование с пуллингом
      startCopyPolling();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  const copyToCloud = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("livekit-copy-recording", {
        body: { webinarId },
      });
      if (error) throw new Error(error.message);
      if (data?.processing) {
        toast.info("Запись ещё обрабатывается LiveKit, повтор через 10 сек…");
        startCopyPolling();
        return;
      }
      if (!data?.ok) throw new Error(data?.error || "Не удалось скопировать");
      toast.success("Запись скопирована в Lovable Cloud");
      setRecordingUrl(data.url);
      setStatus("uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  // Уже есть локальная запись — ничего не показываем (плеер сам её отрендерит)
  if (recordingUrl && status === "uploaded") {
    return null;
  }

  if (status === "active" || status === "starting") {
    return (
      <Button
        variant="destructive"
        size="sm"
        onClick={stop}
        disabled={busy || status === "starting"}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5 fill-current" />}
        <span className="ml-1.5">{status === "starting" ? "Запуск…" : "Стоп запись"}</span>
      </Button>
    );
  }

  if (status === "processing") {
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span className="ml-1.5">Обработка записи…</span>
      </Button>
    );
  }

  if ((status === "stopped" || status === "uploading") && externalUrl) {
    return (
      <Button variant="outline" size="sm" onClick={copyToCloud} disabled={busy}>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        <span className="ml-1.5">В Lovable Cloud</span>
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={start} disabled={busy}>
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Circle className="w-3.5 h-3.5 fill-destructive text-destructive" />}
      <span className="ml-1.5">Запись</span>
    </Button>
  );
};
