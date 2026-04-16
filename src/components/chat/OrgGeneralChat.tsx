import { useEffect, useState, useRef, useCallback } from "react";
import { Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { ChatAvatar } from "./ChatAvatar";

interface GeneralMessage {
  id: string;
  organization_id: string;
  sender_user_id: string;
  content: string | null;
  created_at: string;
  senderName?: string;
}

interface OrgGeneralChatProps {
  organizationId: string;
  currentUserId: string;
}

export function OrgGeneralChat({ organizationId, currentUserId }: OrgGeneralChatProps) {
  const [messages, setMessages] = useState<GeneralMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [profilesMap, setProfilesMap] = useState<Map<string, string>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    loadMessages();

    const channel = supabase
      .channel(`org-general-chat-${organizationId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "org_general_messages",
        filter: `organization_id=eq.${organizationId}`,
      }, (payload) => {
        const msg = payload.new as GeneralMessage;
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        // Load sender name if missing
        if (!profilesMap.has(msg.sender_user_id)) {
          supabase.from("profiles").select("full_name, email").eq("user_id", msg.sender_user_id).maybeSingle()
            .then(({ data }) => {
              if (data) setProfilesMap(prev => new Map(prev).set(msg.sender_user_id, data.full_name || data.email || ""));
            });
        }
        setTimeout(scrollToBottom, 100);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [organizationId]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  const loadMessages = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("org_general_messages")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
      .limit(500);

    const msgs = (data || []) as GeneralMessage[];
    setMessages(msgs);

    // Load all sender profiles
    const senderIds = [...new Set(msgs.map(m => m.sender_user_id))];
    if (senderIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", senderIds);
      const map = new Map<string, string>();
      for (const p of profiles || []) {
        map.set(p.user_id, p.full_name || p.email || "");
      }
      setProfilesMap(map);
    }

    setIsLoading(false);
  };

  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text) return;
    setIsSending(true);
    try {
      const tempId = crypto.randomUUID();
      const optimistic: GeneralMessage = {
        id: tempId,
        organization_id: organizationId,
        sender_user_id: currentUserId,
        content: text,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, optimistic]);
      setNewMessage("");
      setTimeout(scrollToBottom, 50);

      const { data, error } = await supabase.from("org_general_messages").insert({
        organization_id: organizationId,
        sender_user_id: currentUserId,
        content: text,
      }).select().single();

      if (error) throw error;
      if (data) setMessages(prev => prev.map(m => m.id === tempId ? (data as GeneralMessage) : m));
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
            <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Общий чат организации</p>
            <p className="text-xs mt-1">Напишите первое сообщение</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.sender_user_id === currentUserId;
            const senderName = profilesMap.get(msg.sender_user_id) || "...";
            return (
              <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                {!isMine && (
                  <div className="mr-2 mt-1 shrink-0">
                    <ChatAvatar name={senderName} size="sm" />
                  </div>
                )}
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                  isMine
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted rounded-bl-md"
                }`}>
                  {!isMine && (
                    <div className="text-[10px] font-medium mb-1 opacity-70">
                      {senderName}
                    </div>
                  )}
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
          placeholder="Написать в общий чат..."
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
