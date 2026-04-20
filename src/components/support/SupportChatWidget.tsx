import { useEffect, useState, useRef, useCallback } from "react";
import { MessageCircle, X, Send, User, Bot, Headset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "react-router-dom";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

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

export function SupportChatWidget() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
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

  // Скрываем виджет в админке (там есть свой раздел чатов), на страницах авторизации и подписания
  const hidden =
    location.pathname.startsWith('/admin') ||
    location.pathname.startsWith('/auth') ||
    location.pathname === '/login' ||
    location.pathname.startsWith('/email-response') ||
    location.pathname.startsWith('/sign/');

  // Загрузка истории
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

  // При логине / монтировании — найти существующий диалог
  useEffect(() => {
    (async () => {
      if (user) {
        // Авторизованный — берём последний открытый
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
        // Гость — пытаемся восстановить из localStorage
        const stored = localStorage.getItem(CONVERSATION_ID_KEY);
        if (stored) {
          setConversationId(stored);
          loadHistory(stored);
        }
      }
    })();
  }, [user, loadHistory]);

  // Realtime подписка на новые сообщения
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
        if (!open && newMsg.role !== 'user') {
          setUnread(u => u + 1);
        }
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
    if (open) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
      // Сбрасываем непрочитанные
      if (conversationId && unread > 0) {
        setUnread(0);
        if (user) {
          supabase.from('support_conversations')
            .update({ unread_for_user: 0 })
            .eq('id', conversationId).then();
        }
      }
    }
  }, [open, messages, unread, conversationId, user]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    // Гость и нет имени/контакта — для эскалации, но при первом сообщении пускаем анонимно
    setIsLoading(true);
    const optimistic: Message = {
      id: `tmp_${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    setInput("");

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
        // Догружаем историю с сервера, чтобы получить ID
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
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full",
          "bg-primary text-primary-foreground shadow-xl hover:scale-105 transition-all",
          "ring-4 ring-primary/20"
        )}
        aria-label="Открыть чат поддержки"
      >
        <MessageCircle className="h-6 w-6" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          {/* Header */}
          <div className="px-5 py-4 border-b bg-gradient-to-r from-primary/10 to-primary/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center">
                  {status === 'human' ? <Headset className="h-5 w-5 text-primary" /> : <Bot className="h-5 w-5 text-primary" />}
                </div>
                <div>
                  <p className="font-semibold text-sm">Поддержка Sintagma</p>
                  <p className="text-xs text-muted-foreground">
                    {status === 'human' ? 'Оператор скоро ответит' : status === 'closed' ? 'Диалог закрыт' : 'ИИ-помощник на связи'}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8 space-y-3">
                <div className="h-16 w-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                  <MessageCircle className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Здравствуйте!</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Задайте вопрос — ИИ ответит мгновенно. Если не справится, передам оператору.
                  </p>
                </div>
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className={cn(
                "flex",
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              )}>
                <div className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                  msg.role === 'user' && 'bg-primary text-primary-foreground rounded-br-sm',
                  msg.role === 'ai' && 'bg-muted rounded-bl-sm',
                  msg.role === 'operator' && 'bg-accent text-accent-foreground rounded-bl-sm border border-primary/20',
                  msg.role === 'system' && 'bg-muted/50 text-muted-foreground italic text-xs mx-auto'
                )}>
                  {msg.role === 'operator' && (
                    <p className="text-xs opacity-70 mb-1 flex items-center gap-1">
                      <Headset className="h-3 w-3" /> {msg.sender_name || 'Оператор'}
                    </p>
                  )}
                  <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
                  <SigmaSpinner className="w-5 h-5" />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Guest info form (только при эскалации для гостей) */}
          {needsGuestInfo && (
            <div className="border-t p-4 space-y-2 bg-muted/30">
              <p className="text-xs font-medium">Чтобы связаться с оператором, оставьте контакты:</p>
              <Input placeholder="Ваше имя" value={guestName} onChange={e => setGuestName(e.target.value)} />
              <Input placeholder="Email или телефон" value={guestContact} onChange={e => setGuestContact(e.target.value)} />
              <Button size="sm" className="w-full" onClick={() => {
                if (guestName && guestContact) { setNeedsGuestInfo(false); requestOperator(); }
              }}>Продолжить</Button>
            </div>
          )}

          {/* Operator request button */}
          {status === 'ai' && messages.length > 0 && !needsGuestInfo && (
            <div className="px-4 pt-2">
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={requestOperator}>
                <Headset className="h-3 w-3 mr-1" /> Связаться с оператором
              </Button>
            </div>
          )}

          {/* Input */}
          <div className="border-t p-3 flex items-end gap-2">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder={status === 'closed' ? 'Диалог закрыт' : 'Напишите сообщение...'}
              disabled={isLoading || status === 'closed'}
              className="min-h-[40px] max-h-[120px] resize-none rounded-xl"
              rows={1}
            />
            <Button size="icon" className="rounded-xl shrink-0" onClick={handleSend} disabled={isLoading || !input.trim() || status === 'closed'}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
