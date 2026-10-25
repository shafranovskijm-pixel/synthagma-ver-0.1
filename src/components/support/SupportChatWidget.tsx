import { memo, useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { supportChatInvocationHeaders } from "./invokeSupportChat";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useChatTheme } from "@/hooks/useChatTheme";
import { HomeView } from "@/components/support/HomeView";
import { ChatView } from "@/components/support/ChatView";
import {
  CONVERSATION_ID_KEY,
  detectSource,
  getGuestToken,
  type SupportMessage,
  type SupportStatus,
  type SupportView,
} from "@/components/support/utils";

function SupportChatWidgetInner() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<SupportView>("home");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [needsGuestInfo, setNeedsGuestInfo] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestContact, setGuestContact] = useState("");
  const [status, setStatus] = useState<SupportStatus>("ai");
  const [unread, setUnread] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(true);
  const historySequenceRef = useRef(0);
  useEffect(() => { activeRef.current = true; return () => { activeRef.current = false; }; }, []);

  const { theme } = useChatTheme();

  const closeChat = useCallback(() => {
    setOpen(false);
    setNeedsGuestInfo(false);
  }, []);

  const hidden =
    location.pathname.startsWith("/auth") ||
    location.pathname === "/login" ||
    location.pathname.startsWith("/email-response") ||
    location.pathname.startsWith("/sign/") ||
    location.pathname.startsWith("/course-learning/") ||
    /^\/course\/[^/]+\/learn/.test(location.pathname);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-support-chat", handler);
    return () => window.removeEventListener("open-support-chat", handler);
  }, []);

  const loadHistory = useCallback(async (convId: string): Promise<'loaded' | 'denied' | 'unavailable' | 'stale'> => {
    const sequence = ++historySequenceRef.current;
    const { data, error } = await supabase.functions.invoke('support-chat', {
      headers: supportChatInvocationHeaders(Boolean(user)),
      body: { action: 'history', conversationId: convId, guestToken: user ? undefined : getGuestToken() },
    });
    if (!activeRef.current || sequence !== historySequenceRef.current) return 'stale';
    if (error) {
      const statusCode = (error as { context?: { status?: number } }).context?.status;
      return statusCode && [401, 403, 404].includes(statusCode) ? 'denied' : 'unavailable';
    }
    if (data?.conversationId !== convId || !Array.isArray(data?.messages)) return 'unavailable';
    setMessages(data.messages as SupportMessage[]);
    setStatus(data.status as SupportStatus);
    setUnread(data.unread_for_user ?? 0);
    return 'loaded';
  }, [user]);

  // A changed Auth identity remounts this inner scope; no guest/other-user pointer or pending reply is inherited.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (user) {
        const { data } = await supabase.from('support_conversations').select('id, status').eq('user_id', user.id).neq('status', 'closed').order('last_message_at', { ascending: false }).limit(1).maybeSingle();
        if (!cancelled && activeRef.current && data) {
          setConversationId(data.id);
          setStatus(data.status as SupportStatus);
          await loadHistory(data.id);
        }
      } else {
        const stored = localStorage.getItem(CONVERSATION_ID_KEY);
        if (stored && !cancelled && activeRef.current) {
          setConversationId(stored);
          const outcome = await loadHistory(stored);
          if (outcome === 'denied' && !cancelled && activeRef.current) {
            setConversationId(null);
            if (localStorage.getItem(CONVERSATION_ID_KEY) === stored) localStorage.removeItem(CONVERSATION_ID_KEY);
          }
        }
      }
    })().catch(() => { /* Temporary transport failure keeps the stored capability for a later retry. */ });
    return () => { cancelled = true; };
  }, [user, loadHistory]);

  // Anonymous Postgres subscriptions have no guest-token authorization. Use the same protected history endpoint while visible.
  useEffect(() => {
    if (user || !open || view !== 'chat' || !conversationId) return;
    const timer = window.setInterval(() => {
      if (!document.hidden && activeRef.current) void loadHistory(conversationId).catch(() => {});
    }, 10000);
    return () => window.clearInterval(timer);
  }, [user, open, view, conversationId, loadHistory]);

  // Realtime subscriptions
  useEffect(() => {
    if (!conversationId || !user) return;
    const channel = supabase
      .channel(`support-msg-${conversationId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "support_messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const newMsg = payload.new as SupportMessage;
        setMessages(prev => prev.find(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
        if (!open && newMsg.role !== "user") setUnread(u => u + 1);
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "support_conversations",
        filter: `id=eq.${conversationId}`,
      }, (payload) => {
        const updated = payload.new as { status: string };
        setStatus(updated.status as SupportStatus);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, open, user]);

  // Auto-scroll on new message (только при изменении кол-ва сообщений)
  useEffect(() => {
    if (open && view === "chat") {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, open, view]);

  // Reset unread counter when chat is opened
  useEffect(() => {
    if (open && view === "chat" && conversationId && unread > 0) {
      setUnread(0);
      if (user) {
        supabase.from("support_conversations")
          .update({ unread_for_user: 0 })
          .eq("id", conversationId).then();
      }
    }
  }, [open, view, conversationId, unread, user]);

  // If we have history → open straight into chat-view
  useEffect(() => {
    if (open && messages.length > 0) setView("chat");
  }, [open, messages.length]);

  const handleSend = useCallback(async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || isLoading) return;

    setIsLoading(true);
    const optimistic: SupportMessage = {
      id: `tmp_${Date.now()}`,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    if (!override) setInput("");
    setView("chat");

    try {
      const { data, error } = await supabase.functions.invoke("support-chat", {
        headers: supportChatInvocationHeaders(Boolean(user)),
        body: {
          conversationId,
          guestToken: user ? undefined : getGuestToken(),
          message: text,
          source: detectSource(location.pathname),
          guestName: guestName || undefined,
          guestEmail: guestContact?.includes("@") ? guestContact : undefined,
          guestPhone: guestContact && !guestContact.includes("@") ? guestContact : undefined,
        },
      });
      if (error) throw error;
      if (!activeRef.current) return;
      if (data?.conversationId && !conversationId) {
        setConversationId(data.conversationId);
        if (!user) localStorage.setItem(CONVERSATION_ID_KEY, data.conversationId);
        void loadHistory(data.conversationId).catch(() => {});
      }
      if (data?.status) setStatus(data.status);
    } catch (e) {
      if (!activeRef.current) return;
      console.error("support-chat error:", e);
      setMessages(prev => [...prev, {
        id: `err_${Date.now()}`, role: "system",
        content: "Не удалось отправить. Попробуйте ещё раз.",
        created_at: new Date().toISOString(),
      }]);
    } finally {
      if (activeRef.current) setIsLoading(false);
    }
  }, [input, isLoading, conversationId, user, location.pathname, guestName, guestContact, loadHistory]);

  const requestOperator = useCallback(() => {
    if (!user && (!guestName || !guestContact)) {
      setNeedsGuestInfo(true);
      return;
    }
    handleSend("Прошу связать с оператором поддержки.");
  }, [user, guestName, guestContact, handleSend]);

  if (hidden) return null;

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "support-chat-scope",
            "fixed bottom-5 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full",
            "text-white shadow-lg",
            "hover:scale-105 transition-transform duration-200"
          )}
          style={{
            background: `linear-gradient(135deg, hsl(${theme.accent}), hsl(${theme.accentDark}))`,
            boxShadow: `0 8px 22px -8px hsl(${theme.accent} / 0.5)`,
          }}
          aria-label="Открыть чат поддержки"
        >
          <MessageCircle className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow-md">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}

      {/* Chat card */}
      {open && (
        <div
          className={cn(
            "support-chat-scope",
            "fixed z-[100] flex flex-col overflow-hidden bg-card text-foreground animate-scale-in",
            "inset-0 sm:inset-auto",
            "sm:bottom-6 sm:right-6 sm:w-[380px] sm:h-[580px] sm:rounded-3xl sm:shadow-2xl"
          )}
          style={{
            boxShadow: `0 20px 60px -10px hsl(${theme.accent} / 0.3), 0 8px 24px -8px hsl(0 0% 0% / 0.15)`,
            ...({
              "--chat-accent": theme.accent,
              "--chat-accent-dark": theme.accentDark,
            } as React.CSSProperties),
          }}
        >
          {view === "home" ? (
            <HomeView
              onClose={closeChat}
              onWrite={() => setView("chat")}
              hasHistory={messages.length > 0}
              messages={messages}
              status={status}
            />
          ) : (
            <ChatView
              onClose={closeChat}
              onBack={() => setView("home")}
              messages={messages}
              isLoading={isLoading}
              status={status}
              input={input}
              setInput={setInput}
              handleSend={handleSend}
              requestOperator={requestOperator}
              needsGuestInfo={needsGuestInfo}
              setNeedsGuestInfo={setNeedsGuestInfo}
              guestName={guestName}
              setGuestName={setGuestName}
              guestContact={guestContact}
              setGuestContact={setGuestContact}
              endRef={endRef}
            />
          )}
        </div>
      )}
    </>
  );
}

/**
 * Виджет поддержки. Обёрнут в memo — чтобы пере-рендеры верхних провайдеров
 * (Auth, BackgroundUploads) не пересоздавали DOM-узлы кнопки и не теряли
 * click-events на «Свернуть».
 */
function SupportChatWidgetScope() {
  const { user } = useAuth();
  return <SupportChatWidgetInner key={user?.id ?? 'guest'} />;
}
export const SupportChatWidget = memo(SupportChatWidgetScope);
