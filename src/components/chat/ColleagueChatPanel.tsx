import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Send, Users, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChatAvatar } from "@/components/chat/ChatAvatar";

interface ColleagueContact {
  user_id: string;
  full_name: string;
  email?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
}

interface ColleagueMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  is_read: boolean;
  created_at: string;
}

type UserRole = "admin" | "organization";

interface ColleagueChatPanelProps {
  role: UserRole;
  organizationId?: string;
}

export function ColleagueChatPanel({ role, organizationId }: ColleagueChatPanelProps) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [contacts, setContacts] = useState<ColleagueContact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ColleagueMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingContacts, setIsLoadingContacts] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [allUsers, setAllUsers] = useState<{ user_id: string; full_name: string; email?: string }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages]);

  // Load contacts with last messages
  useEffect(() => {
    if (!user) return;
    loadContacts();
  }, [user]);

  const loadContacts = async () => {
    if (!user) return;
    setIsLoadingContacts(true);

    // Get all colleague messages for this user
    const { data: msgs } = await (supabase as any)
      .from("colleague_messages")
      .select("*")
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    // Group by partner
    const partnerMap = new Map<string, { lastMsg: ColleagueMessage; unread: number }>();
    for (const m of (msgs || []) as ColleagueMessage[]) {
      const partnerId = m.sender_id === user.id ? m.recipient_id : m.sender_id;
      if (!partnerMap.has(partnerId)) {
        partnerMap.set(partnerId, { lastMsg: m, unread: 0 });
      }
      if (!m.is_read && m.recipient_id === user.id) {
        partnerMap.get(partnerId)!.unread++;
      }
    }

    // Get profile info for partners
    const partnerIds = Array.from(partnerMap.keys());
    let profilesMap = new Map<string, { full_name: string; email?: string }>();
    if (partnerIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", partnerIds);
      for (const p of profiles || []) {
        profilesMap.set(p.user_id, { full_name: p.full_name || p.email || "Без имени", email: p.email || undefined });
      }
    }

    const contactList: ColleagueContact[] = partnerIds.map(id => {
      const info = partnerMap.get(id)!;
      const profile = profilesMap.get(id);
      return {
        user_id: id,
        full_name: profile?.full_name || "Без имени",
        email: profile?.email,
        lastMessage: info.lastMsg.content || undefined,
        lastMessageAt: info.lastMsg.created_at,
        unreadCount: info.unread,
      };
    }).sort((a, b) => {
      if (a.lastMessageAt && b.lastMessageAt) return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      return 0;
    });

    setContacts(contactList);
    setIsLoadingContacts(false);

    // Load all available users for search/new chat
    loadAllUsers();
  };

  const loadAllUsers = async () => {
    if (!user) return;
    let query = supabase.from("profiles").select("user_id, full_name, email").neq("user_id", user.id);

    if (role === "organization" && organizationId) {
      // Load org staff + other org users
      const { data: orgStaff } = await supabase
        .from("org_staff")
        .select("user_id")
        .eq("organization_id", organizationId);
      
      const { data: orgProfiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .eq("organization_id", organizationId)
        .neq("user_id", user.id);

      const staffIds = (orgStaff || []).map(s => s.user_id);
      let staffProfiles: typeof orgProfiles = [];
      if (staffIds.length > 0) {
        const { data } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", staffIds);
        staffProfiles = data || [];
      }

      const allMap = new Map<string, { user_id: string; full_name: string; email?: string }>();
      for (const p of [...(orgProfiles || []), ...(staffProfiles || [])]) {
        allMap.set(p.user_id, { user_id: p.user_id, full_name: p.full_name || p.email || "Без имени", email: p.email || undefined });
      }
      setAllUsers(Array.from(allMap.values()));
    } else {
      // Admin: load all users
      const { data } = await query.not("full_name", "is", null).order("full_name").limit(200);
      setAllUsers((data || []).map(p => ({ user_id: p.user_id, full_name: p.full_name || p.email || "Без имени", email: p.email || undefined })));
    }
  };

  // Load messages for selected contact
  useEffect(() => {
    if (!selectedContactId || !user) return;
    loadMessages(selectedContactId);

    const channel = supabase
      .channel(`colleague-chat-${selectedContactId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "colleague_messages",
      }, (payload) => {
        const msg = payload.new as ColleagueMessage;
        if ((msg.sender_id === user.id && msg.recipient_id === selectedContactId) ||
            (msg.sender_id === selectedContactId && msg.recipient_id === user.id)) {
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
          setTimeout(scrollToBottom, 100);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedContactId, user]);

  const loadMessages = async (contactId: string) => {
    if (!user) return;
    setIsLoadingMessages(true);

    const { data } = await (supabase as any)
      .from("colleague_messages")
      .select("*")
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${contactId}),and(sender_id.eq.${contactId},recipient_id.eq.${user.id})`)
      .order("created_at", { ascending: true })
      .limit(500);

    setMessages((data as ColleagueMessage[]) || []);

    // Mark as read
    const unread = ((data as ColleagueMessage[]) || []).filter(m => !m.is_read && m.recipient_id === user.id);
    if (unread.length > 0) {
      await (supabase as any)
        .from("colleague_messages")
        .update({ is_read: true })
        .in("id", unread.map(m => m.id));
    }

    setIsLoadingMessages(false);
  };

  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text || !selectedContactId || !user) return;
    setIsSending(true);

    try {
      const tempId = crypto.randomUUID();
      const optimistic: ColleagueMessage = {
        id: tempId, sender_id: user.id, recipient_id: selectedContactId,
        content: text, attachment_url: null, attachment_name: null,
        is_read: false, created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, optimistic]);
      setNewMessage("");
      setTimeout(scrollToBottom, 50);

      const { data, error } = await (supabase as any).from("colleague_messages").insert({
        sender_id: user.id,
        recipient_id: selectedContactId,
        content: text,
      }).select().single();

      if (error) throw error;
      if (data) setMessages(prev => prev.map(m => m.id === tempId ? (data as ColleagueMessage) : m));

      // Update contacts list
      setContacts(prev => {
        const existing = prev.find(c => c.user_id === selectedContactId);
        if (existing) {
          return prev.map(c => c.user_id === selectedContactId
            ? { ...c, lastMessage: text, lastMessageAt: new Date().toISOString() }
            : c
          );
        }
        return prev;
      });
    } catch {
      toast.error("Ошибка отправки");
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (isToday(date)) return format(date, "HH:mm", { locale: ru });
    if (isYesterday(date)) return "Вчера";
    return format(date, "dd.MM.yy", { locale: ru });
  };

  // Filter contacts + search in all users
  const displayContacts = searchQuery
    ? [...contacts.filter(c => c.full_name.toLowerCase().includes(searchQuery.toLowerCase())),
       ...allUsers.filter(u => 
         u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) &&
         !contacts.some(c => c.user_id === u.user_id)
       ).map(u => ({ ...u, lastMessage: undefined, lastMessageAt: undefined, unreadCount: 0 }))]
    : contacts;

  const selectedContact = contacts.find(c => c.user_id === selectedContactId) ||
    allUsers.find(u => u.user_id === selectedContactId);

  if (isLoadingContacts) {
    return <div className="flex justify-center py-12"><SigmaSpinner /></div>;
  }

  // Mobile: show chat
  if (isMobile && selectedContactId) {
    return (
      <div className="flex flex-col h-full">
        <Button variant="ghost" size="sm" onClick={() => setSelectedContactId(null)} className="gap-2 self-start mb-2">
          <ArrowLeft className="w-4 h-4" /> Назад
        </Button>
        <h3 className="font-semibold text-lg px-1 mb-3">{selectedContact?.full_name}</h3>
        {renderMessages()}
      </div>
    );
  }

  function renderMessages() {
    if (isLoadingMessages) {
      return <div className="flex justify-center py-12"><SigmaSpinner /></div>;
    }
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
          {messages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>Начните переписку</p>
            </div>
          ) : (
            messages.map(msg => {
              const isMine = msg.sender_id === user?.id;
              return (
                <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                    isMine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md"
                  }`}>
                    {msg.content && <p className="text-sm whitespace-pre-wrap">{msg.content}</p>}
                    <div className={`text-[10px] mt-1 ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                      {format(new Date(msg.created_at), "HH:mm", { locale: ru })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="border-t border-border pt-3 flex items-end gap-2">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Написать сообщение..."
            className="min-h-[40px] max-h-[120px] rounded-xl resize-none"
            rows={1}
          />
          <Button size="icon" className="shrink-0 rounded-xl" onClick={handleSend} disabled={isSending || !newMessage.trim()}>
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-full">
      {/* Contact list */}
      <div className={`flex flex-col ${selectedContactId && !isMobile ? "w-72 shrink-0" : "flex-1"} border border-border rounded-xl bg-card overflow-hidden`}>
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск коллег..."
              className="pl-9"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {displayContacts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">
                {searchQuery ? "Никого не найдено" : "Нет переписок"}
              </p>
              <p className="text-xs mt-1">Используйте поиск, чтобы найти коллег</p>
            </div>
          ) : (
            displayContacts.map(contact => (
              <button
                key={contact.user_id}
                onClick={() => setSelectedContactId(contact.user_id)}
                className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-secondary/50 transition-colors ${
                  selectedContactId === contact.user_id ? "bg-primary/5" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className={`font-medium text-sm truncate block ${contact.unreadCount > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                      {contact.full_name}
                    </span>
                    {contact.lastMessage && (
                      <p className={`text-xs truncate mt-0.5 ${contact.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                        {contact.lastMessage}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {contact.lastMessageAt && (
                      <span className="text-[10px] text-muted-foreground">{formatTime(contact.lastMessageAt)}</span>
                    )}
                    {contact.unreadCount > 0 && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 min-w-[16px] flex items-center justify-center">
                        {contact.unreadCount}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat area - desktop */}
      {!isMobile && (
        <div className="flex-1 border border-border rounded-xl bg-card overflow-hidden flex flex-col">
          {selectedContactId ? (
            <div className="flex flex-col h-full">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="font-semibold">{selectedContact?.full_name}</h3>
              </div>
              <div className="flex-1 p-4 overflow-hidden">
                {renderMessages()}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium mb-1">Выберите собеседника</p>
                <p className="text-xs text-muted-foreground/70">Найдите коллегу через поиск</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
