import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowUp, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Question = {
  id: string;
  question: string;
  author_name: string;
  author_identity: string;
  upvotes: number;
  answered: boolean;
  answered_at: string | null;
  answer_text: string | null;
  created_at: string;
};

interface Props {
  webinarId: string;
  isHost: boolean;
  participantIdentity: string;
  participantName: string;
  isGuest?: boolean;
}

export const WebinarQAPanel = ({ webinarId, isHost, participantIdentity, participantName, isGuest = false }: Props) => {
  const [items, setItems] = useState<Question[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    let alive = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchAll = async () => {
      const { data } = await supabase
        .from("webinar_questions")
        .select("*")
        .eq("webinar_id", webinarId)
        .order("upvotes", { ascending: false })
        .order("created_at", { ascending: false });
      if (alive && data) setItems(data as Question[]);
    };

    const subscribe = () => {
      if (!alive) return;
      const ch = supabase
        .channel(`qa-${webinarId}-${Math.random().toString(36).slice(2, 8)}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "webinar_questions",
          filter: `webinar_id=eq.${webinarId}`,
        }, (payload) => {
          setItems((prev) => {
            if (payload.eventType === "INSERT") {
              const n = payload.new as Question;
              if (prev.find((x) => x.id === n.id)) return prev;
              return [n, ...prev].sort((a, b) => b.upvotes - a.upvotes);
            }
            if (payload.eventType === "UPDATE") {
              const n = payload.new as Question;
              return prev.map((x) => x.id === n.id ? n : x).sort((a, b) => b.upvotes - a.upvotes);
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((x) => x.id !== (payload.old as Question).id);
            }
            return prev;
          });
        })
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            if (!alive) return;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(() => {
              if (!alive) return;
              if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
              }
              fetchAll();
              subscribe();
            }, 2000);
          }
        });
      channelRef.current = ch;
    };

    fetchAll();
    subscribe();

    return () => {
      alive = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [webinarId]);

  const ask = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("webinar_post_question", {
        p_webinar_id: webinarId,
        p_author_identity: participantIdentity,
        p_author_name: participantName,
        p_question: text.trim(),
        p_is_guest: isGuest,
      });
      if (error) throw error;
      setText("");
    } catch (e) {
      const msg = (e as Error).message || "Не удалось отправить";
      toast.error(/Rate limit/i.test(msg) ? "Слишком часто. Попробуйте через минуту." : msg);
    } finally { setBusy(false); }
  };

  const upvote = async (q: Question) => {
    await supabase.from("webinar_questions").update({ upvotes: q.upvotes + 1 }).eq("id", q.id);
  };

  const markAnswered = async (q: Question) => {
    await supabase.from("webinar_questions").update({
      answered: !q.answered,
      answered_at: !q.answered ? new Date().toISOString() : null,
    }).eq("id", q.id);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b text-sm font-medium">
        Вопросы ({items.filter((x) => !x.answered).length})
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {items.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-6">Пока нет вопросов</div>
          )}
          {items.map((q) => (
            <div
              key={q.id}
              className={cn(
                "rounded-md border p-2 space-y-1.5 text-sm",
                q.answered && "opacity-60 bg-muted/30",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs text-muted-foreground">{q.author_name}</div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 gap-1 text-xs"
                    onClick={() => upvote(q)}
                  >
                    <ArrowUp className="w-3 h-3" /> {q.upvotes}
                  </Button>
                  {isHost && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn("h-6 w-6", q.answered && "text-primary")}
                      onClick={() => markAnswered(q)}
                      title={q.answered ? "Отменить отметку" : "Помечено как отвечено"}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              <div className={cn("text-sm whitespace-pre-wrap", q.answered && "line-through")}>
                {q.question}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="border-t p-2 space-y-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Задайте вопрос…"
          className="min-h-[60px] resize-none text-sm"
          maxLength={500}
        />
        <Button onClick={ask} disabled={busy || !text.trim()} size="sm" className="w-full">
          {busy && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
          Отправить
        </Button>
      </div>
    </div>
  );
};
