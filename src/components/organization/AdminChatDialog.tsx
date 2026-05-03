import { useEffect, useState, useRef, useCallback } from "react";
import { Send, MessageCircle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

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

interface AdminChatDialogProps {
  organizationId: string;
  currentUserId: string;
}

export function AdminChatDialog({ organizationId, currentUserId }: AdminChatDialogProps) {
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    loadMessages();

    const channel = supabase
      .channel(`org-admin-chat-${organizationId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "admin_org_messages",
        filter: `organization_id=eq.${organizationId}` }, (payload) => {
        const msg = payload.new as AdminMessage;
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        setTimeout(scrollToBottom, 100);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [organizationId]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  const loadMessages = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("admin_org_messages")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
      .limit(500);

    const msgs = (data as AdminMessage[]) || [];
    setMessages(msgs);

    // Mark admin messages as read
    const unread = msgs.filter(m => !m.is_read && m.sender_role === "admin");
    if (unread.length > 0) {
      await supabase
        .from("admin_org_messages")
        .update({ is_read: true })
        .in("id", unread.map(m => m.id));
    }

    setIsLoading(false);
  };

  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text) return;
    setIsSending(true);
    try {
      const tempId = crypto.randomUUID();
      const optimistic: AdminMessage = {
        id: tempId, organization_id: organizationId, sender_user_id: currentUserId,
        sender_role: "organization", content: text, attachment_url: null,
        attachment_name: null, attachment_type: null, is_read: false,
        created_at: new Date().toISOString() };
      setMessages(prev => [...prev, optimistic]);
      setNewMessage("");
      setTimeout(scrollToBottom, 50);

      const { data, error } = await supabase.from("admin_org_messages").insert({
        organization_id: organizationId,
        sender_user_id: currentUserId,
        sender_role: "organization",
        content: text }).select().single();

      if (error) throw error;
      if (data) setMessages(prev => prev.map(m => m.id === tempId ? (data as AdminMessage) : m));
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

  if (isLoading) {
    return <div className="flex justify-center py-12"><SigmaSpinner /></div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Shield className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Нет сообщений от администрации платформы</p>
            <p className="text-xs mt-1">Здесь будут отображаться сообщения и уведомления</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOrg = msg.sender_role === "organization";
            return (
              <div key={msg.id} className={`flex ${isOrg ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                  isOrg
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted rounded-bl-md"
                }`}>
                  {!isOrg && (
                    <div className="flex items-center gap-1 text-[10px] font-medium mb-1 opacity-70">
                      <Shield className="w-3 h-3" />
                      Администрация платформы
                    </div>
                  )}
                  {msg.content && <p className="text-sm whitespace-pre-wrap">{msg.content}</p>}
                  <div className={`text-[10px] mt-1 ${isOrg ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
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
          placeholder="Ответить администрации..."
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
