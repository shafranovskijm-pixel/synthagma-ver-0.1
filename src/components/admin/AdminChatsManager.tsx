import { useState, useEffect, useRef, useCallback } from "react";
import { MessageCircle, Search, Send, Paperclip, FileText, Building2, ArrowLeft, Bot, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { AiChatPanel } from "@/components/chat/AiChatPanel";
import { ColleagueChatPanel } from "@/components/chat/ColleagueChatPanel";

type AdminChatMode = "organizations" | "ai" | "colleagues";

interface Organization {
  id: string;
  name: string;
  email: string | null;
}

interface AdminMessage {
  id: string;
  organization_id: string;
  sender_user_id: string;
  sender_role: string;
  content: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  is_read: boolean;
  created_at: string;
}

interface OrgConversation {
  org: Organization;
  lastMessage: string | null;
  lastMessageAt: string;
  unreadCount: number;
}

export function AdminChatsManager() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [chatMode, setChatMode] = useState<AdminChatMode>("organizations");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [conversations, setConversations] = useState<OrgConversation[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Load organizations and build conversation list
  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    setIsLoadingOrgs(true);
    // Load all organizations
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id, name, email")
      .order("name");

    if (!orgs) { setIsLoadingOrgs(false); return; }
    setOrganizations(orgs);

    // Load latest messages per org
    const { data: msgs } = await supabase
      .from("admin_org_messages")
      .select("*")
      .order("created_at", { ascending: false });

    const convos: OrgConversation[] = [];
    const orgMap = new Map(orgs.map(o => [o.id, o]));

    // Group messages by org
    const msgByOrg = new Map<string, AdminMessage[]>();
    for (const m of (msgs || []) as AdminMessage[]) {
      if (!msgByOrg.has(m.organization_id)) msgByOrg.set(m.organization_id, []);
      msgByOrg.get(m.organization_id)!.push(m);
    }

    // Orgs with messages first
    for (const [orgId, orgMsgs] of msgByOrg) {
      const org = orgMap.get(orgId);
      if (!org) continue;
      const latest = orgMsgs[0];
      convos.push({
        org,
        lastMessage: latest.content,
        lastMessageAt: latest.created_at,
        unreadCount: orgMsgs.filter(m => !m.is_read && m.sender_role === "organization").length });
      orgMap.delete(orgId);
    }

    // Remaining orgs without messages
    for (const org of orgMap.values()) {
      convos.push({ org, lastMessage: null, lastMessageAt: "", unreadCount: 0 });
    }

    setConversations(convos);
    setIsLoadingOrgs(false);
  };

  // Load messages for selected org
  useEffect(() => {
    if (!selectedOrgId) return;
    loadMessages(selectedOrgId);

    const channel = supabase
      .channel(`admin-chat-${selectedOrgId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "admin_org_messages",
        filter: `organization_id=eq.${selectedOrgId}` }, (payload) => {
        const msg = payload.new as AdminMessage;
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        setTimeout(scrollToBottom, 100);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedOrgId]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  const loadMessages = async (orgId: string) => {
    setIsLoadingMessages(true);
    const { data } = await supabase
      .from("admin_org_messages")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true })
      .limit(500);

    setMessages((data as AdminMessage[]) || []);

    // Mark org replies as read
    const unread = ((data as AdminMessage[]) || []).filter(m => !m.is_read && m.sender_role === "organization");
    if (unread.length > 0) {
      await supabase
        .from("admin_org_messages")
        .update({ is_read: true })
        .in("id", unread.map(m => m.id));
    }

    setIsLoadingMessages(false);
  };

  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text || !selectedOrgId || !user) return;
    setIsSending(true);
    try {
      const tempId = crypto.randomUUID();
      const optimistic: AdminMessage = {
        id: tempId, organization_id: selectedOrgId, sender_user_id: user.id,
        sender_role: "admin", content: text, attachment_url: null,
        attachment_name: null, attachment_type: null, is_read: false,
        created_at: new Date().toISOString() };
      setMessages(prev => [...prev, optimistic]);
      setNewMessage("");
      setTimeout(scrollToBottom, 50);

      const { data, error } = await supabase.from("admin_org_messages").insert({
        organization_id: selectedOrgId,
        sender_user_id: user.id,
        sender_role: "admin",
        content: text }).select().single();

      if (error) throw error;
      if (data) setMessages(prev => prev.map(m => m.id === tempId ? (data as AdminMessage) : m));

      // Update conversation list
      setConversations(prev => prev.map(c =>
        c.org.id === selectedOrgId
          ? { ...c, lastMessage: text, lastMessageAt: new Date().toISOString() }
          : c
      ));
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

  const formatTime = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (isToday(date)) return format(date, "HH:mm", { locale: ru });
    if (isYesterday(date)) return "Вчера";
    return format(date, "dd.MM.yy", { locale: ru });
  };

  const selectedOrg = conversations.find(c => c.org.id === selectedOrgId);

  // Filter conversations: show orgs with messages + search across all
  const filtered = searchQuery
    ? conversations.filter(c => c.org.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : conversations.filter(c => c.lastMessageAt || searchQuery);

  // If searching, show all matching orgs
  const displayList = searchQuery
    ? conversations.filter(c => c.org.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : conversations.sort((a, b) => {
        if (a.lastMessageAt && !b.lastMessageAt) return -1;
        if (!a.lastMessageAt && b.lastMessageAt) return 1;
        if (a.lastMessageAt && b.lastMessageAt) return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
        return a.org.name.localeCompare(b.org.name);
      });

  if (isLoadingOrgs) {
    return <div className="flex justify-center py-12"><SigmaSpinner /></div>;
  }

  // Mobile: show chat if selected
  if (isMobile && selectedOrgId) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => setSelectedOrgId(null)} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Назад
        </Button>
        <h3 className="font-semibold text-lg px-1">{selectedOrg?.org.name}</h3>
        {renderChat()}
      </div>
    );
  }

  function renderChat() {
    if (isLoadingMessages) {
      return <div className="flex justify-center py-12"><SigmaSpinner /></div>;
    }

    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
          {messages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>Начните переписку с организацией</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isAdmin = msg.sender_role === "admin";
              return (
                <div key={msg.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                    isAdmin
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted rounded-bl-md"
                  }`}>
                    {!isAdmin && (
                      <div className="text-[10px] font-medium mb-1 opacity-70">Организация</div>
                    )}
                    {msg.content && <p className="text-sm whitespace-pre-wrap">{msg.content}</p>}
                    <div className={`text-[10px] mt-1 ${isAdmin ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
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
    <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[400px]">
      {/* Org list */}
      <div className={`flex flex-col ${selectedOrgId && !isMobile ? "w-80 shrink-0" : "flex-1"} border border-border rounded-xl bg-card overflow-hidden`}>
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск организации..."
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {displayList.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Нет организаций</p>
            </div>
          ) : (
            displayList.map((convo) => (
              <button
                key={convo.org.id}
                onClick={() => setSelectedOrgId(convo.org.id)}
                className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-secondary/50 transition-colors ${
                  selectedOrgId === convo.org.id ? "bg-primary/5" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className={`font-medium text-sm truncate block ${convo.unreadCount > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                      {convo.org.name}
                    </span>
                    {convo.lastMessage && (
                      <p className={`text-xs truncate mt-0.5 ${convo.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                        {convo.lastMessage}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {convo.lastMessageAt && (
                      <span className="text-[10px] text-muted-foreground">{formatTime(convo.lastMessageAt)}</span>
                    )}
                    {convo.unreadCount > 0 && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 min-w-[16px] flex items-center justify-center">
                        {convo.unreadCount}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat detail */}
      {!isMobile && (
        <div className="flex-1 border border-border rounded-xl bg-card overflow-hidden flex flex-col">
          {selectedOrgId ? (
            <div className="flex flex-col h-full">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="font-semibold">{selectedOrg?.org.name}</h3>
                {selectedOrg?.org.email && (
                  <p className="text-xs text-muted-foreground">{selectedOrg.org.email}</p>
                )}
              </div>
              <div className="flex-1 p-4 overflow-hidden">
                {renderChat()}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-muted/50 mb-4">
                  <MessageCircle className="w-7 h-7 opacity-40" />
                </div>
                <p className="text-sm font-medium mb-1">Выберите организацию</p>
                <p className="text-xs text-muted-foreground/70">Найдите организацию через поиск и начните диалог</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
