import { Button } from "@/components/ui/button";
import { Sparkles, X, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import type { RefObject } from "react";

interface ChatMessage {
  role: string;
  content: string;
}

interface AiChatPanelProps {
  isMobile: boolean;
  chatMessages: ChatMessage[];
  chatInput: string;
  setChatInput: (v: string) => void;
  isChatLoading: boolean;
  chatScrollRef: RefObject<HTMLDivElement>;
  sendChatMessage: () => void;
  onClose: () => void;
}

export function AiChatPanel({ isMobile, chatMessages, chatInput, setChatInput, isChatLoading, chatScrollRef, sendChatMessage, onClose }: AiChatPanelProps) {
  return (
    <div className={cn("fixed bg-card border border-border shadow-2xl z-50 flex flex-col overflow-hidden animate-fade-in", isMobile ? "inset-0 rounded-none" : "bottom-24 right-6 w-96 h-[500px] rounded-2xl")}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-primary to-primary/60 flex items-center justify-center"><Sparkles className="w-4 h-4 text-white" /></div>
          <div><h3 className="font-semibold text-sm">ИИ-помощник</h3><p className="text-xs text-muted-foreground">Задайте вопрос по курсу</p></div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>
      <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatMessages.map((msg, i) => (
          <div key={i} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 text-sm", msg.role === 'user' ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md")}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        {isChatLoading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3"><SigmaSpinner size="sm" /></div>
          </div>
        )}
      </div>
      <div className="p-3 border-t border-border">
        <div className="flex gap-2">
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChatMessage()}
            placeholder="Введите вопрос..."
            className="flex-1 bg-muted rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-primary/20"
          />
          <Button size="icon" onClick={sendChatMessage} disabled={!chatInput.trim() || isChatLoading} className="rounded-xl shrink-0"><Send className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  );
}
