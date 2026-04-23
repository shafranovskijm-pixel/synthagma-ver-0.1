import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  webinar_id: string;
  sender_identity: string;
  sender_name: string;
  is_host: boolean;
  is_guest: boolean;
  content: string;
  created_at: string;
};

interface Props {
  webinarId: string;
  isHost: boolean;
  participantIdentity: string;
  participantName: string;
  isGuest?: boolean;
  /** Запретить отправку (например, для read-only превью). */
  readOnly?: boolean;
}

const PAGE_SIZE = 200;

export const WebinarChatPanel = ({
  webinarId,
  isHost,
  participantIdentity,
  participantName,
  isGuest = false,
  readOnly = false,
}: Props) => {
  const [items, setItems] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Автоскролл вниз только если пользователь УЖЕ внизу
  const scrollToBottom = (smooth = false) => {
    const el = scrollRef.current?.querySelector<HTMLDivElement>("[data-radix-scroll-area-viewport]");
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from("webinar_chat_messages")
      .select("*")
      .eq("webinar_id", webinarId)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (error) {
      console.error("[chat] fetch error", error);
      return;
    }
    if (data) {
      const sorted = (data as ChatMessage[]).slice().reverse();
      setItems(sorted);
      setTimeout(() => scrollToBottom(false), 50);
    }
  };

  useEffect(() => {
    let alive = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const setup = async () => {
      setLoading(true);
      await fetchMessages();
      if (!alive) return;
      setLoading(false);

      const subscribe = () => {
        if (!alive) return;
        // Уникальный канал, чтобы при переподписке не было конфликта
        const ch = supabase
          .channel(`webinar-chat-${webinarId}-${Math.random().toString(36).slice(2, 8)}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "webinar_chat_messages",
              filter: `webinar_id=eq.${webinarId}`,
            },
            (payload) => {
              const m = payload.new as ChatMessage;
              setItems((prev) => {
                if (prev.find((x) => x.id === m.id)) return prev;
                return [...prev, m];
              });
              if (stickToBottomRef.current) {
                setTimeout(() => scrollToBottom(true), 30);
              }
            },
          )
          .subscribe((status) => {
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              if (!alive) return;
              // Самовосстановление: через 2 сек пересоздать канал и перечитать пропущенное
              if (reconnectTimer) clearTimeout(reconnectTimer);
              reconnectTimer = setTimeout(() => {
                if (!alive) return;
                if (channelRef.current) {
                  supabase.removeChannel(channelRef.current);
                  channelRef.current = null;
                }
                fetchMessages();
                subscribe();
              }, 2000);
            }
          });
        channelRef.current = ch;
      };

      subscribe();
    };

    setup();

    // Слушаем скролл, чтобы понимать «пользователь у низа или нет»
    const viewport = scrollRef.current?.querySelector<HTMLDivElement>("[data-radix-scroll-area-viewport]");
    const onScroll = () => {
      if (!viewport) return;
      const dist = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      stickToBottomRef.current = dist < 80;
    };
    viewport?.addEventListener("scroll", onScroll);

    return () => {
      alive = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      viewport?.removeEventListener("scroll", onScroll);
    };
  }, [webinarId]);

  const send = async () => {
    const value = text.trim();
    if (!value || busy || readOnly) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("webinar_post_chat", {
        p_webinar_id: webinarId,
        p_sender_identity: participantIdentity || `anon-${Math.random().toString(36).slice(2, 8)}`,
        p_sender_name: participantName || (isGuest ? "Гость" : "Участник"),
        p_content: value,
        p_is_guest: isGuest,
      });
      if (error) throw error;
      setText("");
      stickToBottomRef.current = true;
    } catch (e) {
      const msg = (e as Error).message || "Не удалось отправить";
      if (/Rate limit/i.test(msg)) {
        toast.error("Слишком часто. Попробуйте через минуту.");
      } else if (/Forbidden/i.test(msg)) {
        toast.error("Чат недоступен в этом вебинаре.");
      } else if (/Empty|too long/i.test(msg)) {
        toast.error("Сообщение пустое или слишком длинное.");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b text-sm font-medium flex items-center justify-between">
        <span>Чат</span>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-2 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Загрузка…
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-6">
              Пока сообщений нет. Будьте первым!
            </div>
          )}
          {items.map((m) => {
            const isMine = m.sender_identity === participantIdentity;
            return (
              <div
                key={m.id}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-sm",
                  isMine && "bg-primary/5 border-primary/20",
                )}
              >
                <div className="flex items-baseline gap-1.5 mb-0.5">
                  <span
                    className={cn(
                      "text-xs font-medium truncate max-w-[140px]",
                      m.is_host ? "text-primary" : "text-foreground",
                    )}
                  >
                    {m.sender_name}
                  </span>
                  {m.is_host && (
                    <span className="text-[10px] uppercase font-semibold text-primary px-1 rounded bg-primary/10">
                      Ведущий
                    </span>
                  )}
                  {!m.is_host && m.is_guest && (
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground px-1 rounded bg-muted">
                      Гость
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
                    {formatTime(m.created_at)}
                  </span>
                </div>
                <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
      {!readOnly && (
        <div className="border-t p-2 space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Сообщение… (Enter — отправить, Shift+Enter — перенос)"
            className="min-h-[52px] max-h-[120px] resize-none text-sm"
            maxLength={500}
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">{text.length}/500</span>
            <Button onClick={send} disabled={busy || !text.trim()} size="sm">
              {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
              Отправить
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
