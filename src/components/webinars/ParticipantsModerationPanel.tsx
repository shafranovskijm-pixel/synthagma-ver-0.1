import { useState } from "react";
import { useParticipants, useLocalParticipant } from "@livekit/components-react";
import { Track, type RemoteParticipant, type Participant } from "livekit-client";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mic, MicOff, Video, VideoOff, UserX, Crown } from "lucide-react";
import { toast } from "sonner";

interface Props {
  webinarId: string;
  isHost: boolean;
}

export const ParticipantsModerationPanel = ({ webinarId, isHost }: Props) => {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const [busy, setBusy] = useState<string | null>(null);

  const moderate = async (
    action: "kick" | "mute_audio" | "mute_video",
    p: Participant,
  ) => {
    setBusy(p.identity + action);
    try {
      let trackSid: string | undefined;
      if (action === "mute_audio") {
        trackSid = p.getTrackPublication(Track.Source.Microphone)?.trackSid;
      } else if (action === "mute_video") {
        trackSid = p.getTrackPublication(Track.Source.Camera)?.trackSid;
      }
      if ((action === "mute_audio" || action === "mute_video") && !trackSid) {
        toast.info("Нет активного трека");
        setBusy(null);
        return;
      }
      const { data, error } = await supabase.functions.invoke("livekit-moderate", {
        body: { webinarId, action, identity: p.identity, trackSid },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Ошибка");
      toast.success(
        action === "kick" ? "Участник удалён" :
        action === "mute_audio" ? "Микрофон выключен" : "Камера выключена",
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(null); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b text-sm font-medium">
        Участники ({participants.length})
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {participants.map((p) => {
            const isLocal = p.identity === localParticipant?.identity;
            const isParticipantHost = (p.metadata && (() => {
              try { return JSON.parse(p.metadata).isHost === true; } catch { return false; }
            })()) || false;
            const micOn = p.isMicrophoneEnabled;
            const camOn = p.isCameraEnabled;
            return (
              <div
                key={p.sid}
                className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-accent/50"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {isParticipantHost && <Crown className="w-3.5 h-3.5 text-primary shrink-0" />}
                  <span className="text-sm truncate">
                    {p.name || p.identity}
                    {isLocal && <span className="text-xs text-muted-foreground ml-1">(вы)</span>}
                  </span>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <span className="p-1" title={micOn ? "Микрофон включён" : "Микрофон выключен"}>
                    {micOn ? <Mic className="w-3.5 h-3.5 text-muted-foreground" /> : <MicOff className="w-3.5 h-3.5 text-destructive/70" />}
                  </span>
                  <span className="p-1" title={camOn ? "Камера включена" : "Камера выключена"}>
                    {camOn ? <Video className="w-3.5 h-3.5 text-muted-foreground" /> : <VideoOff className="w-3.5 h-3.5 text-destructive/70" />}
                  </span>
                  {isHost && !isLocal && (p as RemoteParticipant) && (
                    <>
                      {micOn && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={!!busy}
                          onClick={() => moderate("mute_audio", p)}
                          title="Замьютить микрофон"
                        >
                          <MicOff className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {camOn && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={!!busy}
                          onClick={() => moderate("mute_video", p)}
                          title="Выключить камеру"
                        >
                          <VideoOff className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        disabled={!!busy}
                        onClick={() => moderate("kick", p)}
                        title="Удалить из эфира"
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};
