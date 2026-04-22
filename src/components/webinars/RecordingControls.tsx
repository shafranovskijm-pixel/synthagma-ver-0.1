import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Circle, Square, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Status = "idle" | "starting" | "active" | "stopping" | "stopped" | "uploading" | "uploaded" | "failed";

interface Props {
  webinarId: string;
}

export const RecordingControls = ({ webinarId }: Props) => {
  const [status, setStatus] = useState<Status>("idle");
  const [externalUrl, setExternalUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const { data } = await supabase
      .from("webinars")
      .select("recording_status, recording_external_url")
      .eq("id", webinarId)
      .maybeSingle();
    if (data) {
      setStatus((data.recording_status as Status) || "idle");
      setExternalUrl(data.recording_external_url ?? null);
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
        const row = payload.new as { recording_status?: Status; recording_external_url?: string | null };
        if (row.recording_status) setStatus(row.recording_status);
        if ("recording_external_url" in row) setExternalUrl(row.recording_external_url ?? null);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [webinarId]);

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
      toast.success("Запись остановлена. Файл готовится в LiveKit.");
      setStatus("stopped");
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
      if (!data?.ok) throw new Error(data?.error || "Не удалось скопировать");
      toast.success("Запись скопирована в Lovable Cloud");
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

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
