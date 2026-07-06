import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Inbox, RefreshCw, Loader2, Mail, User, Search } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

type Sender = { id: string; email: string };
type Conversation = {
  id: string;
  sender_id: string;
  remote_email: string;
  remote_name: string | null;
  subject: string | null;
  last_message_at: string;
  last_snippet: string | null;
  last_direction: string;
  unread_count: number;
  status: string;
};
type Message = {
  id: string;
  direction: "incoming" | "outgoing";
  from_email: string;
  from_name: string | null;
  to_email: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  received_at: string;
  is_read: boolean;
  send_error: string | null;
};

export function InboxUnibox() {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [selectedSender, setSelectedSender] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "unread" | "archived">("all");
  const [search, setSearch] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadSenders(); loadConversations(); }, []);
  useEffect(() => { loadConversations(); }, [selectedSender, statusFilter]);
  useEffect(() => { if (activeId) loadMessages(activeId); }, [activeId]);
  useEffect(() => {
    // Realtime новых сообщений
    const ch = supabase.channel("unibox-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "email_messages" }, () => {
        loadConversations();
        if (activeId) loadMessages(activeId);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeId]);

  async function loadSenders() {
    const { data } = await supabase.from("email_sender_pool").select("id,email").eq("is_active", true).order("email");
    setSenders(data || []);
  }

  async function loadConversations() {
    setLoading(true);
    let q = supabase
      .from("email_conversations")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (selectedSender !== "all") q = q.eq("sender_id", selectedSender);
    if (statusFilter === "unread") q = q.gt("unread_count", 0);
    if (statusFilter === "archived") q = q.eq("status", "archived");
    else q = q.eq("status", "open");
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setConversations((data || []) as Conversation[]);
    setLoading(false);
  }

  async function loadMessages(id: string) {
    const { data } = await supabase
      .from("email_messages")
      .select("*")
      .eq("conversation_id", id)
      .order("received_at", { ascending: true });
    setMessages((data || []) as Message[]);
    // Пометить нить как прочитанную
    await supabase.from("email_conversations").update({ unread_count: 0 }).eq("id", id);
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 50);
  }

  async function scanNow() {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("inbox-scanner", { body: {} });
      if (error) throw error;
      toast.success(`Проверено ящиков: ${data?.scanned || 0}, новых писем: ${data?.new_messages || 0}`);
      loadConversations();
    } catch (e: any) {
      toast.error(e.message || "Ошибка сканирования");
    } finally { setScanning(false); }
  }

  async function sendReply() {
    if (!activeId || !reply.trim()) return;
    setSending(true);
    try {
      const html = reply.trim().split(/\n\n+/).map(p => `<p>${p.replace(/\n/g, "<br/>")}</p>`).join("");
      const { data, error } = await supabase.functions.invoke("send-conversation-reply", {
        body: { conversation_id: activeId, body_html: html },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast.success("Ответ отправлен");
      setReply("");
      loadMessages(activeId);
      loadConversations();
    } catch (e: any) {
      toast.error(e.message || "Ошибка отправки");
    } finally { setSending(false); }
  }

  const filteredConvs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(c =>
      c.remote_email.toLowerCase().includes(q)
      || (c.remote_name || "").toLowerCase().includes(q)
      || (c.subject || "").toLowerCase().includes(q)
      || (c.last_snippet || "").toLowerCase().includes(q)
    );
  }, [conversations, search]);

  const active = conversations.find(c => c.id === activeId);
  const activeSender = active ? senders.find(s => s.id === active.sender_id) : null;

  return (
    <div className="flex gap-3 h-[calc(100vh-220px)] min-h-[560px]">
      {/* Column 1 — filters */}
      <div className="w-56 shrink-0 rounded-2xl border bg-card shadow-sm p-4 space-y-4">
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">Ящик</div>
          <Select value={selectedSender} onValueChange={setSelectedSender}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все ящики</SelectItem>
              {senders.map(s => <SelectItem key={s.id} value={s.id}>{s.email}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">Статус</div>
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все открытые</SelectItem>
              <SelectItem value="unread">Непрочитанные</SelectItem>
              <SelectItem value="archived">Архив</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={scanNow} disabled={scanning} className="w-full gap-2" variant="outline">
          {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Проверить почту
        </Button>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Автоматически проверяется каждые 5 минут. Ответы приходят сюда, отвечать можно прямо из карточки нити.
        </p>
      </div>

      {/* Column 2 — conversation list */}
      <div className="w-96 shrink-0 rounded-2xl border bg-card shadow-sm flex flex-col overflow-hidden">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по адресу или теме" className="pl-9" />
          </div>
        </div>
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Загрузка…</div>
          ) : filteredConvs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
              Пока нет переписок
            </div>
          ) : filteredConvs.map(c => {
            const isActive = c.id === activeId;
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`w-full text-left p-3 border-b hover:bg-muted/50 transition-colors ${isActive ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className={`text-sm truncate ${c.unread_count > 0 ? "font-semibold" : "font-medium"}`}>
                    {c.remote_name || c.remote_email}
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(c.last_message_at), { addSuffix: false, locale: ru })}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground truncate mb-1">{c.subject || "(без темы)"}</div>
                <div className="text-xs text-muted-foreground/80 truncate">{c.last_snippet || "—"}</div>
                {c.unread_count > 0 && (
                  <Badge className="mt-1 bg-primary text-primary-foreground text-[10px] h-4 px-1.5">{c.unread_count} новых</Badge>
                )}
              </button>
            );
          })}
        </ScrollArea>
      </div>

      {/* Column 3 — thread */}
      <div className="flex-1 min-w-0 rounded-2xl border bg-card shadow-sm flex flex-col overflow-hidden">
        {!active ? (
          <div className="flex-1 grid place-items-center text-center text-muted-foreground p-8">
            <div>
              <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Выберите переписку слева</p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 grid place-items-center text-primary">
                  <User className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{active.remote_name || active.remote_email}</div>
                  <div className="text-xs text-muted-foreground truncate">{active.remote_email} · через {activeSender?.email}</div>
                </div>
              </div>
              <div className="mt-2 text-sm font-medium truncate">{active.subject || "(без темы)"}</div>
            </div>

            <ScrollArea className="flex-1" ref={scrollRef as any}>
              <div className="p-4 space-y-4">
                {messages.map(m => (
                  <div key={m.id} className={`flex ${m.direction === "outgoing" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl p-3 text-sm ${
                      m.direction === "outgoing"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}>
                      <div className={`text-[11px] mb-1 opacity-70`}>
                        {m.direction === "outgoing" ? "Вы" : (m.from_name || m.from_email)} · {new Date(m.received_at).toLocaleString("ru")}
                      </div>
                      {m.body_html ? (
                        <div className="prose prose-sm max-w-none [&_*]:!text-inherit" dangerouslySetInnerHTML={{ __html: sanitize(m.body_html) }} />
                      ) : (
                        <div className="whitespace-pre-wrap break-words">{m.body_text}</div>
                      )}
                      {m.send_error && (
                        <div className="mt-2 text-[11px] text-destructive bg-background/50 rounded px-2 py-1">
                          Ошибка отправки: {m.send_error}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {messages.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">Нет сообщений</div>
                )}
              </div>
            </ScrollArea>

            <div className="p-3 border-t bg-muted/30">
              <Textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                placeholder="Введите ответ… (Ctrl+Enter — отправить)"
                className="min-h-[90px] resize-none bg-background"
                onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") sendReply(); }}
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-muted-foreground">Отправляется через {activeSender?.email}</span>
                <Button onClick={sendReply} disabled={sending || !reply.trim()} className="gap-2">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Отправить
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function sanitize(html: string): string {
  // Простая очистка: убираем script/style/iframe/on-атрибуты
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
}
