import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import ReactMarkdown from "react-markdown";

interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

interface AiChatPanelProps {
  context?: {
    courseTitle?: string;
    lessonTitle?: string;
    lessonType?: string;
    lessonContent?: string;
  };
}

export function AiChatPanel({ context }: AiChatPanelProps) {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: AiMessage = { role: "user", content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("student-chat", {
        body: { messages: updated, context },
      });

      if (error) throw error;

      setMessages([...updated, { role: "assistant", content: data.content }]);
    } catch (err) {
      toast.error("Не удалось получить ответ от ИИ");
      console.error("AI chat error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Bot className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="font-medium mb-1">ИИ-помощник</p>
            <p className="text-xs">Задайте вопрос — я помогу разобраться</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-muted rounded-bl-md"
              }`}>
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
              <SigmaSpinner className="w-5 h-5" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border pt-3 flex items-end gap-2">
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => setMessages([])}
            title="Очистить чат"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Задайте вопрос..."
          className="min-h-[40px] max-h-[120px] rounded-xl resize-none"
          rows={1}
        />
        <Button
          size="icon"
          className="shrink-0 rounded-xl"
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
        >
          <Send className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
