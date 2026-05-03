import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, Send, User, Bot, Headset, Search, Building2 } from "lucide-react";
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

export function AdminSupportChats() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [filter, setFilter] = useState<'all' | 'ai' | 'human' | 'closed'>('all');
  const [search, setSearch] = useState("");
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const endRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(async () => {
    let q = supabase.from('support_conversations')
      .select('*, organizations(name)')
      .order('last_message_at', { ascending: false })
      .limit(100);
    if (filter !== 'all') q = q.eq('status', filter);
    const { data } = await q;
    if (data) {
      setConversations(data as Conversation[]);
      // Подгружаем имена авторизованных пользователей
      const userIds = data.filter(c => c.user_id).map(c => c.user_id!) as string[];
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, email')
          .in('user_id', userIds);
        const map: Record<string, string> = {};
        (profiles ?? []).forEach(p => { map[p.user_id] = p.full_name || p.email || 'Пользователь'; });
        setUserNames(map);
      }
    }
  }, [filter]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  useEffect(() => {
    const ch = supabase.channel(`admin-support-list-${Date.now()}-${Math.random().toString(36).slice(2,8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_conversations' }, fetchConversations)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchConversations]);

  const loadMessages = useCallback(async (id: string) => {
    const { data } = await supabase.from('support_messages')
      .select('*').eq('conversation_id', id).order('created_at');
    if (data) setMessages(data as Message[]);
    // Сбрасываем непрочитанные
    await supabase.from('support_conversations')
      .update({ unread_for_admin: 0 }).eq('id', id);
  }, []);

  useEffect(() => {
    if (!activeId) return;
    loadMessages(activeId);
    const ch = supabase.channel(`admin-conv-${activeId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`)
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
    // Переключаем статус на 'human' если был на ИИ
    await supabase.from('support_conversations')
      .update({ status: 'human' }).eq('id', activeId).eq('status', 'ai');
  };

  const closeConversation = async () => {
    if (!activeId) return;
    await supabase.from('support_conversations').update({ status: 'closed' }).eq('id', activeId);
    toast.success('Диалог закрыт');
  };

  const filtered = conversations.filter(c => {
    if (!search) return true;
    const lower = search.toLowerCase();
    const name = c.user_id ? userNames[c.user_id] : (c.guest_name || c.guest_email || '');
    return (c.title?.toLowerCase().includes(lower) || name?.toLowerCase().includes(lower) || c.organizations?.name?.toLowerCase().includes(lower));
  });

  const activeConv = conversations.find(c => c.id === activeId);
  const activeName = activeConv?.user_id ? userNames[activeConv.user_id] : (activeConv?.guest_name || activeConv?.guest_email || 'Гость');

  return (
    <div className="h-[calc(100vh-12rem)] flex gap-4">
      {/* Список диалогов */}
      <div className="w-80 flex flex-col bg-card rounded-2xl border shadow-sm">
        <div className="p-3 border-b space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1">
            {(['all', 'ai', 'human', 'closed'] as const).map(f => (
              <Button key={f} size="sm" variant={filter === f ? 'default' : 'ghost'} className="text-xs h-7 flex-1" onClick={() => setFilter(f)}>
                {f === 'all' ? 'Все' : f === 'ai' ? 'ИИ' : f === 'human' ? 'Оператор' : 'Закрыт'}
              </Button>
            ))}
          </div>
        </div>
        <ScrollArea className="flex-1">
          {filtered.map(c => {
            const name = c.user_id ? (userNames[c.user_id] ?? 'Загрузка...') : (c.guest_name || c.guest_email || 'Гость');
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={cn(
                  "w-full text-left px-3 py-3 border-b hover:bg-muted/50 transition",
                  activeId === c.id && 'bg-primary/5'
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="font-medium text-sm truncate">{name}</p>
                  {c.unread_for_admin > 0 && (
                    <Badge variant="destructive" className="text-xs h-5 px-1.5">{c.unread_for_admin}</Badge>
                  )}
                </div>
                {c.organizations?.name && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                    <Building2 className="h-3 w-3" /> {c.organizations.name}
                  </p>
                )}
                <p className="text-xs text-muted-foreground truncate mt-0.5">{c.title}</p>
                <div className="flex items-center justify-between mt-1">
                  <Badge variant="outline" className="text-[10px] h-4">
                    {c.status === 'ai' ? '🤖 ИИ' : c.status === 'human' ? '👤 Оператор' : '✓ Закрыт'}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(c.last_message_at), { locale: ru, addSuffix: true })}
                  </span>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
              Нет диалогов
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Чат */}
      <div className="flex-1 flex flex-col bg-card rounded-2xl border shadow-sm">
        {!activeId ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Выберите диалог
          </div>
        ) : (
          <>
            <div className="p-4 border-b flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-base truncate">{activeName}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                  {activeConv?.organizations?.name && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                      <Building2 className="h-3 w-3" />
                      {activeConv.organizations.name}
                    </span>
                  )}
                  {!activeConv?.organizations?.name && activeConv?.source && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                      {activeConv.source}
                    </span>
                  )}
                  {(activeConv?.guest_email || activeConv?.guest_name) && (
                    <span className="text-xs text-muted-foreground truncate">
                      {activeConv?.guest_email || activeConv?.guest_name}
                    </span>
                  )}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={closeConversation} className="shrink-0">Закрыть диалог</Button>
            </div>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.map(m => {
                  const senderLabel =
                    m.role === 'user'
                      ? (m.sender_name || activeName || 'Пользователь')
                      : m.role === 'ai'
                        ? 'ИИ-помощник'
                        : m.role === 'operator'
                          ? (m.sender_name || 'Оператор поддержки')
                          : '';
                  const orgLabel = m.role === 'user' ? activeConv?.organizations?.name : null;
                  return (
                    <div key={m.id} className={cn(
                      'flex',
                      m.role === 'user' ? 'justify-start' : m.role === 'system' ? 'justify-center' : 'justify-end'
                    )}>
                      <div className="max-w-[75%] flex flex-col gap-1">
                        {m.role !== 'system' && (
                          <div className={cn(
                            "flex items-center gap-1.5 text-xs font-medium px-1",
                            m.role === 'operator' ? 'justify-end text-primary' : 'text-foreground'
                          )}>
                            {m.role === 'user' && <User className="h-3.5 w-3.5 text-muted-foreground" />}
                            {m.role === 'ai' && <Bot className="h-3.5 w-3.5 text-primary" />}
                            {m.role === 'operator' && <Headset className="h-3.5 w-3.5" />}
                            <span className="truncate">{senderLabel}</span>
                            {orgLabel && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                <Building2 className="h-2.5 w-2.5" />
                                {orgLabel}
                              </span>
                            )}
                          </div>
                        )}
                        <div className={cn(
                          'rounded-2xl px-4 py-2.5 text-sm',
                          m.role === 'user' && 'bg-muted text-foreground rounded-tl-sm',
                          m.role === 'ai' && 'bg-primary/10 text-foreground border border-primary/20 rounded-tr-sm',
                          m.role === 'operator' && 'bg-primary text-primary-foreground rounded-tr-sm',
                          m.role === 'system' && 'bg-muted/50 text-muted-foreground italic text-xs'
                        )}>
                          {m.role === 'user' || m.role === 'system' ? (
                            <p className="whitespace-pre-wrap break-words">{m.content}</p>
                          ) : (
                            <div className="prose prose-sm dark:prose-invert max-w-none break-words prose-p:my-1">
                              <ReactMarkdown>{m.content}</ReactMarkdown>
                            </div>
                          )}
                          <p className={cn(
                            "text-[10px] mt-1.5",
                            m.role === 'operator' ? 'text-primary-foreground/60' : 'text-muted-foreground'
                          )}>
                            {formatDistanceToNow(new Date(m.created_at), { locale: ru, addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
            </ScrollArea>
            <div className="p-3 border-t flex items-end gap-2">
              <Textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
                placeholder="Ответ оператора..."
                rows={1}
                className="min-h-[40px] max-h-[120px] resize-none rounded-xl"
              />
              <Button size="icon" className="rounded-xl" onClick={handleSendReply} disabled={!reply.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
