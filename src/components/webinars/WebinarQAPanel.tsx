import { useEffect, useState } from "react";
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
}

export const WebinarQAPanel = ({ webinarId, isHost, participantIdentity, participantName }: Props) => {
  const [items, setItems] = useState<Question[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("webinar_questions")
        .select("*")
        .eq("webinar_id", webinarId)
        .order("upvotes", { ascending: false })
        .order("created_at", { ascending: false });
      if (alive && data) setItems(data as Question[]);
    })();
    const ch = supabase
      .channel(`qa-${webinarId}`)
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
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [webinarId]);

  const ask = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("webinar_questions").insert({
        webinar_id: webinarId,
        question: text.trim(),
        author_name: participantName,
        author_identity: participantIdentity,
      });
      if (error) throw error;
      setText("");
    } catch (e) {
      toast.error((e as Error).message);
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
