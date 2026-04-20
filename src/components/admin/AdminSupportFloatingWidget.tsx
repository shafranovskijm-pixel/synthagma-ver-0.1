import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Headset, Send, User, Bot, Search, Building2, X, ArrowLeft, MessageSquare,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

interface Conversation {
  id: string;
  user_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  organization_id: string | null;
  source: string;
  status: string;
  title: string | null;
  last_message_at: string;
  unread_for_admin: number;
  organizations?: { name: string } | null;
}

interface Message {
  id: string;
  role: string;
  content: string;
  sender_name: string | null;
  created_at: string;
}

/**
 * Плавающий виджет техподдержки для админа.
 * Показывается ТОЛЬКО если userRole === 'admin'.
 * Позволяет админу видеть все диалоги и отвечать прямо из правого нижнего угла на любой странице.
 */
export function AdminSupportFloatingWidget() {
  const { userRole } = useAuth();
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [filter, setFilter] = useState<'all' | 'ai' | 'human' | 'closed'>('all');
  const [search, setSearch] = useState("");
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [totalUnread, setTotalUnread] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  const isAdmin = userRole === 'admin';

  const fetchConversations = useCallback(async () => {
    if (!isAdmin) return;
    let q = supabase.from('support_conversations')
      .select('*, organizations(name)')
      .order('last_message_at', { ascending: false })
      .limit(100);
    if (filter !== 'all') q = q.eq('status', filter);
    const { data } = await q;
    if (data) {
      setConversations(data as Conversation[]);
      const userIds = data.filter(c => c.user_id).map(c => c.user_id!) as string[];
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from('profiles').select('user_id, full_name, email').in('user_id', userIds);
        const map: Record<string, string> = {};
        (profiles ?? []).forEach(p => { map[p.user_id] = p.full_name || p.email || 'Пользователь'; });
        setUserNames(map);
      }
    }
  }, [filter, isAdmin]);

  // Считаем общее количество непрочитанных (для бейджа на иконке)
  const fetchUnreadCount = useCallback(async () => {
    if (!isAdmin) return;
    const { data } = await supabase
      .from('support_conversations')
      .select('unread_for_admin')
      .neq('status', 'closed');
    if (data) {
      const total = data.reduce((sum, c) => sum + (c.unread_for_admin ?? 0), 0);
      setTotalUnread(total);
    }
  }, [isAdmin]);

  useEffect(() => { fetchUnreadCount(); }, [fetchUnreadCount]);
  useEffect(() => { if (open) fetchConversations(); }, [open, fetchConversations]);

  // Realtime для бейджа и списка
  useEffect(() => {
    if (!isAdmin) return;
    const ch = supabase.channel('admin-floating-support')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_conversations' }, () => {
        fetchUnreadCount();
        if (open) fetchConversations();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, () => {
        fetchUnreadCount();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isAdmin, open, fetchUnreadCount, fetchConversations]);

  const loadMessages = useCallback(async (id: string) => {
    const { data } = await supabase.from('support_messages')
      .select('*').eq('conversation_id', id).order('created_at');
    if (data) setMessages(data as Message[]);
    await supabase.from('support_conversations').update({ unread_for_admin: 0 }).eq('id', id);
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (!activeId) return;
    loadMessages(activeId);
    const ch = supabase.channel(`admin-floating-conv-${activeId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'support_messages',
        filter: `conversation_id=eq.${activeId}`,
      }, (p) => {
        const m = p.new as Message;
        setMessages(prev => prev.find(x => x.id === m.id) ? prev : [...prev, m]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeId, loadMessages]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSendReply = async () => {
    if (!reply.trim() || !activeId) return;
    const text = reply.trim();
    setReply("");
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('support_messages').insert({
      conversation_id: activeId,
      role: 'operator',
      content: text,
      sender_user_id: user?.id,
      sender_name: 'Поддержка Sintagma',
    });
    if (error) {
      toast.error('Не удалось отправить');
      setReply(text);
      return;
    }
    await supabase.from('support_conversations')
      .update({ status: 'human' }).eq('id', activeId).eq('status', 'ai');
  };

  const closeConversation = async () => {
    if (!activeId) return;
    await supabase.from('support_conversations').update({ status: 'closed' }).eq('id', activeId);
    toast.success('Диалог закрыт');
  };

  if (!isAdmin) return null;

  const filtered = conversations.filter(c => {
    if (!search) return true;
    const lower = search.toLowerCase();
    const name = c.user_id ? userNames[c.user_id] : (c.guest_name || c.guest_email || '');
    return (c.title?.toLowerCase().includes(lower) || name?.toLowerCase().includes(lower) || c.organizations?.name?.toLowerCase().includes(lower));
  });

  const activeConv = conversations.find(c => c.id === activeId);
  const activeName = activeConv?.user_id ? userNames[activeConv.user_id] : (activeConv?.guest_name || activeConv?.guest_email || 'Гость');

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            "fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full",
            "bg-primary text-primary-foreground shadow-xl hover:scale-105 transition-all",
            "ring-4 ring-primary/20"
          )}
          aria-label="Поддержка ИИ — диалоги"
        >
          <Headset className="h-6 w-6" />
          {totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-xs font-semibold flex items-center justify-center">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-40 w-[420px] max-w-[calc(100vw-2rem)] h-[640px] max-h-[calc(100vh-3rem)] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-primary/5">
            <div className="flex items-center gap-2 min-w-0">
              {activeId && (
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setActiveId(null)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <Headset className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">
                  {activeId ? activeName : 'Поддержка ИИ'}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {activeId
                    ? (activeConv?.organizations?.name || activeConv?.source || 'Диалог')
                    : `${conversations.length} диалогов · ${totalUnread} непрочитанных`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {activeId && activeConv?.status !== 'closed' && (
                <Button size="sm" variant="ghost" className="text-xs h-7" onClick={closeConversation}>
                  Закрыть
                </Button>
              )}
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Список диалогов */}
          {!activeId && (
            <>
              <div className="p-3 border-b space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8 h-9" placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="flex gap-1">
                  {(['all', 'ai', 'human', 'closed'] as const).map(f => (
                    <Button key={f} size="sm" variant={filter === f ? 'default' : 'ghost'} className="text-xs h-7 flex-1" onClick={() => setFilter(f)}>
                      {f === 'all' ? 'Все' : f === 'ai' ? 'ИИ' : f === 'human' ? 'Я' : 'Закрытые'}
                    </Button>
                  ))}
                </div>
              </div>
              <ScrollArea className="flex-1">
                {filtered.length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    Нет диалогов
                  </div>
                )}
                {filtered.map(c => {
                  const name = c.user_id ? (userNames[c.user_id] ?? 'Загрузка...') : (c.guest_name || c.guest_email || 'Гость');
                  return (
                    <button
                      key={c.id}
                      onClick={() => setActiveId(c.id)}
                      className="w-full text-left px-3 py-3 border-b hover:bg-muted/50 transition"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="font-medium text-sm truncate">{name}</p>
                        {c.unread_for_admin > 0 && (
                          <Badge variant="destructive" className="text-xs h-5 px-1.5">{c.unread_for_admin}</Badge>
                        )}
                      </div>
                      {c.organizations?.name && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                          <Building2 className="h-3 w-3 shrink-0" /> {c.organizations.name}
                        </p>
                      )}
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px] h-4 px-1">
                          {c.status === 'ai' ? '🤖 ИИ' : c.status === 'human' ? '👤 Оператор' : '✓ Закрыт'}
                        </Badge>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true, locale: ru })}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </ScrollArea>
            </>
          )}

          {/* Чат */}
          {activeId && (
            <>
              <ScrollArea className="flex-1 p-3">
                <div className="space-y-3">
                  {messages.map(m => (
                    <div key={m.id} className={cn("flex flex-col", m.role === 'user' ? 'items-start' : 'items-end')}>
                      <div className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                        m.role === 'user' && 'bg-muted',
                        m.role === 'ai' && 'bg-primary/10',
                        m.role === 'operator' && 'bg-primary text-primary-foreground'
                      )}>
                        <p className="text-[10px] opacity-70 mb-0.5 flex items-center gap-1">
                          {m.role === 'user' && <><User className="h-3 w-3" /> {m.sender_name || 'Пользователь'}</>}
                          {m.role === 'ai' && <><Bot className="h-3 w-3" /> ИИ</>}
                          {m.role === 'operator' && <><Headset className="h-3 w-3" /> {m.sender_name || 'Оператор'}</>}
                        </p>
                        <div className="prose prose-sm dark:prose-invert max-w-none break-words [&_p]:my-0">
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={endRef} />
                </div>
              </ScrollArea>
              {activeConv?.status !== 'closed' && (
                <div className="p-3 border-t flex gap-2">
                  <Textarea
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    placeholder="Ответ оператора..."
                    rows={2}
                    className="resize-none text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply();
                      }
                    }}
                  />
                  <Button size="icon" onClick={handleSendReply} disabled={!reply.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
