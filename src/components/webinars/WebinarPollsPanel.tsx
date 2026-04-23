import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Poll = {
  id: string;
  question: string;
  options: string[];
  status: "active" | "closed";
  created_at: string;
};

// Идентификатор для голосования: одно identity = один голос (БД-ограничение).

type Vote = { poll_id: string; option_index: number; voter_identity: string };

interface Props {
  webinarId: string;
  isHost: boolean;
  participantIdentity: string;
}

export const WebinarPollsPanel = ({ webinarId, isHost, participantIdentity }: Props) => {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [busy, setBusy] = useState(false);

  const chPRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const chVRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    let alive = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchAll = async () => {
      const { data: pData } = await supabase
        .from("webinar_polls").select("*").eq("webinar_id", webinarId)
        .order("created_at", { ascending: false });
      if (!alive || !pData) return;
      const normalized = (pData as any[]).map((p) => ({
        ...p,
        options: Array.isArray(p.options) ? p.options : [],
      })) as Poll[];
      setPolls(normalized);
      const ids = normalized.map((p) => p.id);
      if (ids.length > 0) {
        const { data: vData } = await supabase
          .from("webinar_poll_votes").select("poll_id, option_index, voter_identity").in("poll_id", ids);
        if (alive && vData) setVotes(vData as Vote[]);
      }
    };

    const subscribe = () => {
      if (!alive) return;
      const chP = supabase
        .channel(`polls-${webinarId}-${Math.random().toString(36).slice(2, 8)}`)
        .on("postgres_changes", {
          event: "*", schema: "public", table: "webinar_polls",
          filter: `webinar_id=eq.${webinarId}`,
        }, (payload) => {
          setPolls((prev) => {
            if (payload.eventType === "INSERT") {
              const p = payload.new as any;
              const n = { ...p, options: Array.isArray(p.options) ? p.options : [] } as Poll;
              return prev.find((x) => x.id === n.id) ? prev : [n, ...prev];
            }
            if (payload.eventType === "UPDATE") {
              const p = payload.new as any;
              const n = { ...p, options: Array.isArray(p.options) ? p.options : [] } as Poll;
              return prev.map((x) => x.id === n.id ? n : x);
            }
            if (payload.eventType === "DELETE") return prev.filter((x) => x.id !== (payload.old as Poll).id);
            return prev;
          });
        })
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            if (!alive) return;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(() => {
              if (!alive) return;
              if (chPRef.current) supabase.removeChannel(chPRef.current);
              if (chVRef.current) supabase.removeChannel(chVRef.current);
              chPRef.current = null;
              chVRef.current = null;
              fetchAll();
              subscribe();
            }, 2000);
          }
        });
      const chV = supabase
        .channel(`pollvotes-${webinarId}-${Math.random().toString(36).slice(2, 8)}`)
        .on("postgres_changes", {
          event: "INSERT", schema: "public", table: "webinar_poll_votes",
        }, (payload) => {
          setVotes((prev) => [...prev, payload.new as Vote]);
        })
        .subscribe();
      chPRef.current = chP;
      chVRef.current = chV;
    };

    fetchAll();
    subscribe();

    return () => {
      alive = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (chPRef.current) supabase.removeChannel(chPRef.current);
      if (chVRef.current) supabase.removeChannel(chVRef.current);
      chPRef.current = null;
      chVRef.current = null;
    };
  }, [webinarId]);

  const addOption = () => setOptions((o) => o.length < 6 ? [...o, ""] : o);
  const removeOption = (i: number) => setOptions((o) => o.length > 2 ? o.filter((_, idx) => idx !== i) : o);

  const createPoll = async () => {
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || opts.length < 2) {
      toast.error("Вопрос и минимум 2 варианта");
      return;
    }
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("webinar_polls").insert({
        webinar_id: webinarId,
        question: question.trim(),
        options: opts,
        status: "active",
        created_by: u?.user?.id ?? null,
      });
      if (error) throw error;
      setQuestion(""); setOptions(["", ""]); setCreating(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  const closePoll = async (id: string) => {
    await supabase.from("webinar_polls").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", id);
  };

  const vote = async (pollId: string, optionIndex: number) => {
    const { error } = await supabase.from("webinar_poll_votes").insert({
      poll_id: pollId, option_index: optionIndex, voter_identity: participantIdentity,
    });
    if (error) {
      const msg = error.message || "";
      if (/duplicate key|unique/i.test(msg)) {
        toast.error("Вы уже голосовали в этом опросе");
      } else if (/row-level security/i.test(msg)) {
        toast.error("Голосование недоступно: опрос закрыт или вебинар не идёт");
      } else {
        toast.error(msg);
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b flex items-center justify-between">
        <span className="text-sm font-medium">Опросы</span>
        {isHost && !creating && (
          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setCreating(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Создать
          </Button>
        )}
      </div>
      {isHost && creating && (
        <div className="border-b p-2 space-y-2 bg-muted/30">
          <Input
            value={question} onChange={(e) => setQuestion(e.target.value)}
            placeholder="Вопрос опроса" maxLength={200}
          />
          {options.map((o, i) => (
            <div key={i} className="flex gap-1">
              <Input
                value={o} onChange={(e) => setOptions((arr) => arr.map((v, idx) => idx === i ? e.target.value : v))}
                placeholder={`Вариант ${i + 1}`} maxLength={100}
              />
              {options.length > 2 && (
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeOption(i)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            {options.length < 6 && (
              <Button variant="ghost" size="sm" onClick={addOption}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Вариант
              </Button>
            )}
            <Button size="sm" onClick={createPoll} disabled={busy} className="ml-auto">
              {busy && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />} Запустить
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Отмена</Button>
          </div>
        </div>
      )}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-3">
          {polls.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-6">Опросов ещё не было</div>
          )}
          {polls.map((p) => {
            const pollVotes = votes.filter((v) => v.poll_id === p.id);
            const total = pollVotes.length;
            const myVote = pollVotes.find((v) => v.voter_identity === participantIdentity);
            const isClosed = p.status === "closed";
            return (
              <div key={p.id} className="rounded-md border p-2 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium">{p.question}</div>
                  {isHost && !isClosed && (
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => closePoll(p.id)}>
                      Закрыть
                    </Button>
                  )}
                  {isClosed && <span className="text-xs text-muted-foreground">завершён</span>}
                </div>
                <div className="space-y-1">
                  {p.options.map((opt, idx) => {
                    const count = pollVotes.filter((v) => v.option_index === idx).length;
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    const selected = myVote?.option_index === idx;
                    const showResults = !!myVote || isClosed || isHost;
                    return (
                      <button
                        key={idx}
                        disabled={!!myVote || isClosed}
                        onClick={() => vote(p.id, idx)}
                        className={cn(
                          "relative w-full text-left text-xs rounded-sm border px-2 py-1.5 overflow-hidden",
                          "disabled:cursor-default",
                          !myVote && !isClosed && "hover:bg-accent",
                          selected && "border-primary",
                        )}
                      >
                        {showResults && (
                          <div
                            className="absolute inset-y-0 left-0 bg-primary/15"
                            style={{ width: `${pct}%` }}
                          />
                        )}
                        <div className="relative flex items-center justify-between gap-2">
                          <span>{opt}</span>
                          {showResults && (
                            <span className="text-muted-foreground tabular-nums">{count} · {pct}%</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {total > 0 && <div className="text-[10px] text-muted-foreground">Всего голосов: {total}</div>}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};
