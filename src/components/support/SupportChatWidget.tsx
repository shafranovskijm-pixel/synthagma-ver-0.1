import { useEffect, useState, useRef, useCallback } from "react";
import { MessageCircle, Send, Bot, Headset, ChevronDown, Pencil, ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "react-router-dom";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { StarfieldCanvas } from "@/components/landing/StarfieldCanvas";
import { AuroraBackground } from "@/components/support/chat-backgrounds/Aurora";
import { WavesBackground } from "@/components/support/chat-backgrounds/Waves";
import { ChatThemePicker } from "@/components/support/ChatThemePicker";
import { useChatTheme, type ChatBgId } from "@/hooks/useChatTheme";

function HeaderBackground({ bgId }: { bgId: ChatBgId }) {
  if (bgId === "stars") {
    return (
      <div className="absolute inset-0 opacity-60 pointer-events-none">
        <StarfieldCanvas />
      </div>
    );
  }
  if (bgId === "aurora") return <AuroraBackground />;
  if (bgId === "waves") return <WavesBackground />;
  return null;
}

interface Message {
  id: string;
  role: 'user' | 'ai' | 'operator' | 'system';
  content: string;
  sender_name?: string | null;
  created_at: string;
}

const GUEST_TOKEN_KEY = 'sintagma_support_guest_token';
const CONVERSATION_ID_KEY = 'sintagma_support_conv_id';

function getGuestToken(): string {
  let token = localStorage.getItem(GUEST_TOKEN_KEY);
  if (!token) {
    token = `guest_${crypto.randomUUID()}`;
    localStorage.setItem(GUEST_TOKEN_KEY, token);
  }
  return token;
}

function detectSource(pathname: string): 'landing' | 'student' | 'organization' | 'company' | 'partner' | 'admin' {
  if (pathname.startsWith('/student')) return 'student';
  if (pathname.startsWith('/organization')) return 'organization';
  if (pathname.startsWith('/company')) return 'company';
  if (pathname.startsWith('/partner')) return 'partner';
  if (pathname.startsWith('/admin')) return 'admin';
  return 'landing';
}

type View = 'home' | 'chat';

export function SupportChatWidget() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('home');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [needsGuestInfo, setNeedsGuestInfo] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestContact, setGuestContact] = useState("");
  const [status, setStatus] = useState<'ai' | 'human' | 'closed'>('ai');
  const [unread, setUnread] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  const { theme, themeId, setThemeId, bgId, setBgId } = useChatTheme();

  const closeChat = useCallback(() => {
    setOpen(false);
    setNeedsGuestInfo(false);
  }, []);

  const hidden =
    location.pathname.startsWith('/auth') ||
    location.pathname === '/login' ||
    location.pathname.startsWith('/email-response') ||
    location.pathname.startsWith('/sign/');

  useEffect(() => {
    const handler = () => { setOpen(true); };
    window.addEventListener('open-support-chat', handler);
    return () => window.removeEventListener('open-support-chat', handler);
  }, []);

  const loadHistory = useCallback(async (convId: string) => {
    const { data: msgs } = await supabase
      .from('support_messages')
      .select('id, role, content, sender_name, created_at')
      .eq('conversation_id', convId)
      .order('created_at');
    if (msgs) setMessages(msgs as Message[]);

    const { data: conv } = await supabase
      .from('support_conversations')
      .select('status, unread_for_user')
      .eq('id', convId).maybeSingle();
    if (conv) {
      setStatus(conv.status as 'ai' | 'human' | 'closed');
      setUnread(conv.unread_for_user ?? 0);
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (user) {
        const { data } = await supabase
          .from('support_conversations')
          .select('id, status')
          .eq('user_id', user.id)
          .neq('status', 'closed')
          .order('last_message_at', { ascending: false })
          .limit(1).maybeSingle();
        if (data) {
          setConversationId(data.id);
          setStatus(data.status as 'ai' | 'human' | 'closed');
          loadHistory(data.id);
        }
      } else {
        const stored = localStorage.getItem(CONVERSATION_ID_KEY);
        if (stored) {
          setConversationId(stored);
          loadHistory(stored);
        }
      }
    })();
  }, [user, loadHistory]);

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`support-msg-${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'support_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const newMsg = payload.new as Message;
        setMessages(prev => prev.find(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
        if (!open && newMsg.role !== 'user') setUnread(u => u + 1);
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'support_conversations',
        filter: `id=eq.${conversationId}`,
      }, (payload) => {
        const updated = payload.new as { status: string };
        setStatus(updated.status as 'ai' | 'human' | 'closed');
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, open]);

  useEffect(() => {
    if (open && view === 'chat') {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
      if (conversationId && unread > 0) {
        setUnread(0);
        if (user) {
          supabase.from('support_conversations')
            .update({ unread_for_user: 0 })
            .eq('id', conversationId).then();
        }
      }
    }
  }, [open, view, messages, unread, conversationId, user]);

  // Если есть история и открываем впервые — сразу в chat-view
  useEffect(() => {
    if (open && messages.length > 0) setView('chat');
  }, [open, messages.length]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    setIsLoading(true);
    const optimistic: Message = {
      id: `tmp_${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    setInput("");
    setView('chat');

    try {
      const { data, error } = await supabase.functions.invoke('support-chat', {
        body: {
          conversationId,
          guestToken: user ? undefined : getGuestToken(),
          message: text,
          source: detectSource(location.pathname),
          guestName: guestName || undefined,
          guestEmail: guestContact?.includes('@') ? guestContact : undefined,
          guestPhone: guestContact && !guestContact.includes('@') ? guestContact : undefined,
        },
      });
      if (error) throw error;
      if (data?.conversationId && !conversationId) {
        setConversationId(data.conversationId);
        if (!user) localStorage.setItem(CONVERSATION_ID_KEY, data.conversationId);
        loadHistory(data.conversationId);
      }
      if (data?.status) setStatus(data.status);
    } catch (e) {
      console.error('support-chat error:', e);
      setMessages(prev => [...prev, {
        id: `err_${Date.now()}`, role: 'system',
        content: 'Не удалось отправить. Попробуйте ещё раз.',
        created_at: new Date().toISOString(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const requestOperator = async () => {
    if (!user && (!guestName || !guestContact)) {
      setNeedsGuestInfo(true);
      return;
    }
    setInput('Прошу связать с оператором поддержки.');
    setTimeout(handleSend, 100);
  };

  if (hidden) return null;

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            "fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full",
            "text-white shadow-2xl",
            "hover:scale-105 transition-all duration-300 ring-4"
          )}
          style={{
            background: `linear-gradient(135deg, hsl(${theme.accent}), hsl(${theme.accentDark}))`,
            boxShadow: `0 10px 30px -8px hsl(${theme.accent} / 0.5)`,
            // @ts-expect-error CSS var
            "--tw-ring-color": `hsl(${theme.accent} / 0.18)`,
          }}
          aria-label="Открыть чат поддержки"
        >
          <MessageCircle className="h-6 w-6" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 shadow-md">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
          <span
            className="absolute inset-0 rounded-full animate-ping pointer-events-none"
            style={{ background: `hsl(${theme.accent} / 0.2)` }}
          />
        </button>
      )}

      {/* Compact chat card */}
      {open && (
        <div
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden bg-card animate-scale-in",
            "inset-0 sm:inset-auto",
            "sm:bottom-6 sm:right-6 sm:w-[380px] sm:h-[580px] sm:rounded-3xl sm:shadow-2xl"
          )}
          style={{
            boxShadow: `0 20px 60px -10px hsl(${theme.accent} / 0.3), 0 8px 24px -8px hsl(0 0% 0% / 0.15)`,
            // @ts-expect-error CSS vars
            "--chat-accent": theme.accent,
            "--chat-accent-dark": theme.accentDark,
          }}
        >
          {view === 'home' ? (
            <HomeView
              onClose={closeChat}
              onWrite={() => setView('chat')}
              hasHistory={messages.length > 0}
              messages={messages}
              status={status}
              themeId={themeId}
              setThemeId={setThemeId}
              bgId={bgId}
              setBgId={setBgId}
            />
          ) : (
            <ChatView
              onClose={closeChat}
              onBack={() => setView('home')}
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
              themeId={themeId}
              setThemeId={setThemeId}
              bgId={bgId}
              setBgId={setBgId}
            />
          )}
        </div>
      )}
    </>
  );
}

/* -------------------- HOME VIEW -------------------- */

function HomeView({
  onClose, onWrite, hasHistory, messages, status,
}: {
  onClose: () => void;
  onWrite: () => void;
  hasHistory: boolean;
  messages: Message[];
  status: 'ai' | 'human' | 'closed';
}) {
  const lastMsg = hasHistory ? messages[messages.length - 1] : null;

  return (
    <>
      {/* Branded header with starfield */}
      <div className="relative h-44 shrink-0 overflow-hidden bg-gradient-to-br from-primary via-primary to-[hsl(174_72%_28%)]">
        <div className="absolute inset-0 opacity-60 pointer-events-none">
          <StarfieldCanvas />
        </div>
        {/* Soft vignette for text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/30 pointer-events-none" />

        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 h-8 w-8 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white backdrop-blur-sm transition-colors"
          aria-label="Свернуть"
        >
          <ChevronDown className="h-4 w-4" />
        </button>

        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white px-6">
          <SigmaLogo size="sm" variant="white" className="scale-90" />
          <p className="text-xs text-white/80 mt-2 font-medium">Мы на связи — поможем за минуту</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onWrite}
            className="group flex flex-col items-center gap-2.5 p-4 rounded-2xl bg-muted/60 hover:bg-muted transition-all hover:-translate-y-0.5"
          >
            <div className="h-11 w-11 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-md shadow-primary/30 group-hover:scale-110 transition-transform">
              <Pencil className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold">Написать</p>
              <p className="text-[11px] text-muted-foreground">ИИ-помощник</p>
            </div>
          </button>

          <a
            href="https://t.me/+SVTbxqnGmF1iMzIy"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col items-center gap-2.5 p-4 rounded-2xl bg-muted/60 hover:bg-muted transition-all hover:-translate-y-0.5"
          >
            <div className="h-11 w-11 rounded-full bg-gradient-to-br from-[#229ED9] to-[#1a7eb0] flex items-center justify-center shadow-md shadow-[#229ED9]/30 group-hover:scale-110 transition-transform">
              <Send className="h-5 w-5 text-white" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold">Telegram</p>
              <p className="text-[11px] text-muted-foreground">Быстрый ответ</p>
            </div>
          </a>
        </div>

        {/* History section */}
        {hasHistory && lastMsg && (
          <div className="mt-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">История</p>
            <button
              onClick={onWrite}
              className="w-full flex items-start gap-3 p-3 rounded-2xl bg-muted/40 hover:bg-muted/70 transition-colors text-left"
            >
              <div className="h-9 w-9 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                {status === 'human' ? (
                  <Headset className="h-4 w-4 text-primary" />
                ) : (
                  <Bot className="h-4 w-4 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {status === 'human' ? 'Оператор поддержки' : 'ИИ-помощник Sintagma'}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  {lastMsg.content}
                </p>
              </div>
            </button>
          </div>
        )}

        {/* Help link */}
        <a
          href="/help"
          className="mt-5 flex items-center justify-between p-3 rounded-2xl bg-muted/40 hover:bg-muted/70 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <ExternalLink className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Справочный центр</p>
              <p className="text-[11px] text-muted-foreground">Гайды и инструкции</p>
            </div>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90" />
        </a>
      </div>
    </>
  );
}

/* -------------------- CHAT VIEW -------------------- */

function ChatView({
  onClose, onBack, messages, isLoading, status, input, setInput, handleSend, requestOperator,
  needsGuestInfo, setNeedsGuestInfo, guestName, setGuestName, guestContact, setGuestContact, endRef,
}: {
  onClose: () => void;
  onBack: () => void;
  messages: Message[];
  isLoading: boolean;
  status: 'ai' | 'human' | 'closed';
  input: string;
  setInput: (v: string) => void;
  handleSend: () => void;
  requestOperator: () => void;
  needsGuestInfo: boolean;
  setNeedsGuestInfo: (v: boolean) => void;
  guestName: string;
  setGuestName: (v: string) => void;
  guestContact: string;
  setGuestContact: (v: string) => void;
  endRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <>
      {/* Compact header with stars */}
      <div className="relative h-16 shrink-0 overflow-hidden bg-gradient-to-r from-primary to-[hsl(174_72%_32%)]">
        <div className="absolute inset-0 opacity-40 pointer-events-none">
          <StarfieldCanvas />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/10 pointer-events-none" />
        <div className="relative z-10 h-full flex items-center justify-between px-3">
          <button
            onClick={onBack}
            className="h-8 w-8 flex items-center justify-center rounded-full text-white hover:bg-white/15 transition-colors"
            aria-label="Назад"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-white">
            <div className="h-7 w-7 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center">
              {status === 'human' ? <Headset className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold leading-tight">Поддержка Синтагмы</p>
              <p className="text-[10px] text-white/80 leading-tight">
                {status === 'human' ? 'Оператор отвечает' : status === 'closed' ? 'Закрыт' : 'ИИ на связи'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-full text-white hover:bg-white/15 transition-colors"
            aria-label="Свернуть"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
        {messages.length === 0 && (
          <div className="text-center py-6 space-y-2">
            <div className="h-12 w-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <MessageCircle className="h-6 w-6 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground px-6">
              Задайте вопрос — ИИ ответит мгновенно. Если не справится, передам оператору.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex", msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn(
              "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
              msg.role === 'user' && 'bg-primary text-primary-foreground rounded-br-md',
              msg.role === 'ai' && 'bg-card border border-border rounded-bl-md',
              msg.role === 'operator' && 'bg-accent text-accent-foreground rounded-bl-md border border-primary/20',
              msg.role === 'system' && 'bg-muted/60 text-muted-foreground italic text-xs mx-auto'
            )}>
              {msg.role === 'operator' && (
                <p className="text-[10px] opacity-70 mb-1 flex items-center gap-1">
                  <Headset className="h-3 w-3" /> {msg.sender_name || 'Оператор'}
                </p>
              )}
              {msg.role === 'user' ? (
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none break-words prose-p:my-1 prose-headings:my-2">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-2.5 shadow-sm">
              <SigmaSpinner className="w-4 h-4" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {needsGuestInfo && (
        <div className="border-t border-border p-3 space-y-2 bg-muted/30">
          <p className="text-xs font-medium">Чтобы связаться с оператором, оставьте контакты:</p>
          <Input placeholder="Ваше имя" value={guestName} onChange={e => setGuestName(e.target.value)} className="rounded-xl h-9" />
          <Input placeholder="Email или телефон" value={guestContact} onChange={e => setGuestContact(e.target.value)} className="rounded-xl h-9" />
          <Button size="sm" className="w-full rounded-xl" onClick={() => {
            if (guestName && guestContact) { setNeedsGuestInfo(false); requestOperator(); }
          }}>Продолжить</Button>
        </div>
      )}

      {status === 'ai' && messages.length > 0 && !needsGuestInfo && (
        <div className="px-3 pt-2">
          <Button variant="outline" size="sm" className="w-full text-xs rounded-xl h-8" onClick={requestOperator}>
            <Headset className="h-3 w-3 mr-1" /> Связаться с оператором
          </Button>
        </div>
      )}

      <div className="border-t border-border p-3 flex items-end gap-2 bg-card">
        <Textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          placeholder={status === 'closed' ? 'Диалог закрыт' : 'Сообщение...'}
          disabled={isLoading || status === 'closed'}
          className="min-h-[40px] max-h-[100px] resize-none rounded-2xl text-sm"
          rows={1}
        />
        <Button
          size="icon"
          className="rounded-full shrink-0 h-10 w-10 bg-gradient-to-br from-primary to-primary/80 shadow-md shadow-primary/30"
          onClick={handleSend}
          disabled={isLoading || !input.trim() || status === 'closed'}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}
