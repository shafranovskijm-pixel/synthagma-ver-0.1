import { useEffect, useState, useRef, useCallback } from "react";
import { Send, Paperclip, FileText, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import { getSignedStorageUrl } from "@/utils/storageHelpers";

interface Message {
  id: string;
  sender_user_id: string;
  content: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  is_read: boolean;
  created_at: string;
}

interface StudentOrgChatProps {
  studentUserId: string;
  organizationId: string;
  organizationName: string;
}

export function StudentOrgChat({ studentUserId, organizationId, organizationName }: StudentOrgChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    loadMessages();
    const channel = supabase
      .channel(`student-chat-${organizationId}-${studentUserId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "org_student_messages",
        filter: `student_user_id=eq.${studentUserId}` }, (payload) => {
        const newMsg = payload.new as Message;
        if ((newMsg as any).organization_id !== organizationId) return;
        setMessages((prev) => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
        if (newMsg.attachment_url) loadSignedUrl(newMsg.attachment_url);
        setTimeout(scrollToBottom, 100);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [studentUserId, organizationId]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  const loadSignedUrl = async (url: string) => {
    if (!url || url.startsWith("http")) return;
    const signed = await getSignedStorageUrl("chat-attachments", url);
    if (signed) setSignedUrls((prev) => new Map(prev).set(url, signed));
  };

  const loadMessages = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("org_student_messages")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("student_user_id", studentUserId)
      .order("created_at", { ascending: true })
      .limit(200);
    const msgs = (data as Message[]) || [];
    setMessages(msgs);
    for (const msg of msgs) {
      if (msg.attachment_url && !msg.attachment_url.startsWith("http")) loadSignedUrl(msg.attachment_url);
    }
    // Mark org messages as read
    const unread = msgs.filter(m => !m.is_read && m.sender_user_id !== studentUserId);
    if (unread.length > 0) {
      await supabase.from("org_student_messages").update({ is_read: true }).in("id", unread.map(m => m.id));
    }
    setIsLoading(false);
  };

  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text) return;
    setIsSending(true);
    try {
      const tempId = crypto.randomUUID();
      const optimisticMsg: Message = {
        id: tempId, sender_user_id: studentUserId, content: text,
        attachment_url: null, attachment_name: null, attachment_type: null,
        is_read: false, created_at: new Date().toISOString() };
      setMessages(prev => [...prev, optimisticMsg]);
      setNewMessage("");
      setTimeout(scrollToBottom, 50);
      const { data, error } = await supabase.from("org_student_messages").insert({
        organization_id: organizationId,
        student_user_id: studentUserId,
        sender_user_id: studentUserId,
        content: text }).select().single();
      if (error) throw error;
      if (data) setMessages(prev => prev.map(m => m.id === tempId ? (data as Message) : m));
    } catch {
      toast.error("Ошибка отправки");
    } finally {
      setIsSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Максимальный размер файла — 10 МБ"); return; }
    setIsUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${organizationId}/${studentUserId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("chat-attachments").upload(path, file);
      if (uploadError) throw uploadError;
      const isImage = file.type.startsWith("image/");
      const { error } = await supabase.from("org_student_messages").insert({
        organization_id: organizationId, student_user_id: studentUserId, sender_user_id: studentUserId,
        content: null, attachment_url: path, attachment_name: file.name, attachment_type: isImage ? "image" : "file" });
      if (error) throw error;
    } catch {
      toast.error("Ошибка загрузки файла");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const getAttachmentUrl = (url: string | null): string | null => {
    if (!url) return null;
    if (url.startsWith("http")) return url;
    return signedUrls.get(url) || null;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (isLoading) return <div className="flex justify-center py-12"><SigmaSpinner /></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>Начните переписку с {organizationName}</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.sender_user_id === studentUserId;
            const attachUrl = getAttachmentUrl(msg.attachment_url);
            return (
              <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${isOwn ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md"}`}>
                  {msg.content && <p className="text-sm whitespace-pre-wrap">{msg.content}</p>}
                  {msg.attachment_type === "image" && attachUrl && (
                    <img src={attachUrl} alt={msg.attachment_name || "Изображение"} className="max-w-full rounded-lg mt-1 cursor-pointer" onClick={() => window.open(attachUrl, "_blank")} />
                  )}
                  {msg.attachment_type === "file" && attachUrl && (
                    <a href={attachUrl} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 mt-1 text-sm underline ${isOwn ? "text-primary-foreground/80" : "text-primary"}`}>
                      <FileText className="w-4 h-4 shrink-0" />{msg.attachment_name || "Файл"}
                    </a>
                  )}
                  <div className={`text-[10px] mt-1 ${isOwn ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                    {format(new Date(msg.created_at), "HH:mm", { locale: ru })}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="border-t border-border p-3 flex items-end gap-2 bg-card">
        <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={handleFileUpload} />
        <Button variant="ghost" size="icon" className="shrink-0 rounded-xl" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
          {isUploading ? <SigmaSpinner /> : <Paperclip className="w-5 h-5" />}
        </Button>
        <Textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={handleKeyDown} placeholder="Написать сообщение..." className="min-h-[40px] max-h-[120px] rounded-xl resize-none" rows={1} />
        <Button size="icon" className="shrink-0 rounded-xl" onClick={handleSend} disabled={isSending || !newMessage.trim()}>
          <Send className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
