import { MessageCircle, Send, Bot, Headset, ChevronDown, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

import { HeaderBackground } from "@/components/support/HeaderBackground";
import { VersionFooter } from "@/components/support/VersionFooter";
import { useChatTheme } from "@/hooks/useChatTheme";
import type { SupportMessage, SupportStatus } from "@/components/support/utils";

interface Props {
  onClose: () => void;
  onBack: () => void;
  messages: SupportMessage[];
  isLoading: boolean;
  status: SupportStatus;
  input: string;
  setInput: (v: string) => void;
  handleSend: (text?: string) => void;
  requestOperator: () => void;
  needsGuestInfo: boolean;
  setNeedsGuestInfo: (v: boolean) => void;
  guestName: string;
  setGuestName: (v: string) => void;
  guestContact: string;
  setGuestContact: (v: string) => void;
  endRef: React.RefObject<HTMLDivElement>;
}

export function ChatView({
  onClose, onBack, messages, isLoading, status, input, setInput, handleSend, requestOperator,
  needsGuestInfo, setNeedsGuestInfo, guestName, setGuestName, guestContact, setGuestContact, endRef,
}: Props) {
  const { bgId } = useChatTheme();

  return (
    <>
      {/* Compact header */}
      <div
        className="relative h-16 shrink-0 overflow-hidden"
        style={{
          background: `linear-gradient(90deg, hsl(var(--chat-accent)), hsl(var(--chat-accent-dark)))`,
        }}
      >
        <HeaderBackground bgId={bgId} />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/10 pointer-events-none" />
        <div className="relative z-10 h-full flex items-center justify-between px-3">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onBack(); }}
            className="relative z-20 h-8 w-8 flex items-center justify-center rounded-full text-white hover:bg-white/15 transition-colors"
            aria-label="Назад"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-white pointer-events-none">
            <div className="h-7 w-7 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center">
              {status === "human" ? <Headset className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold leading-tight">Поддержка Синтагмы</p>
              <p className="text-[10px] text-white/80 leading-tight">
                {status === "human" ? "Оператор отвечает" : status === "closed" ? "Закрыт" : "ИИ на связи"}
              </p>
            </div>
          </div>
          <div className="relative z-20 flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="h-8 w-8 flex items-center justify-center rounded-full text-white hover:bg-white/15 transition-colors"
              aria-label="Свернуть"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
        {messages.length === 0 && (
          <div className="text-center py-6 space-y-2">
            <div className="h-12 w-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <MessageCircle className="h-6 w-6 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground px-6">
              Задайте вопрос — ИИ ответит мгновенно. Если не справится, передам оператору.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                msg.role === "user" && "text-white rounded-br-md",
                msg.role === "ai" && "bg-card border border-border rounded-bl-md",
                msg.role === "operator" && "bg-accent text-accent-foreground rounded-bl-md border border-primary/20",
              msg.role === "system" && "bg-muted/60 text-muted-foreground italic text-xs mx-auto"
            )}>
              {msg.role === "operator" && (
                <p className="text-[10px] opacity-70 mb-1 flex items-center gap-1">
                  <Headset className="h-3 w-3" /> {msg.sender_name || "Оператор"}
                </p>
              )}
              {msg.role === "user" ? (
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none break-words prose-p:my-1 prose-headings:my-2">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-2.5 shadow-sm">
              <SigmaSpinner className="w-4 h-4" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {needsGuestInfo && (
        <div className="border-t border-border p-3 space-y-2 bg-muted/30">
          <p className="text-xs font-medium">Чтобы связаться с оператором, оставьте контакты:</p>
          <Input placeholder="Ваше имя" value={guestName} onChange={e => setGuestName(e.target.value)} className="rounded-xl h-9" />
          <Input placeholder="Email или телефон" value={guestContact} onChange={e => setGuestContact(e.target.value)} className="rounded-xl h-9" />
          <Button size="sm" className="w-full rounded-xl" onClick={() => {
            if (guestName && guestContact) { setNeedsGuestInfo(false); requestOperator(); }
          }}>Продолжить</Button>
        </div>
      )}

      {status === "ai" && messages.length > 0 && !needsGuestInfo && (
        <div className="px-3 pt-2">
          <Button variant="outline" size="sm" className="w-full text-xs rounded-xl h-8" onClick={requestOperator}>
            <Headset className="h-3 w-3 mr-1" /> Связаться с оператором
          </Button>
        </div>
      )}

      <div className="border-t border-border p-3 flex items-end gap-2 bg-card">
        <Textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          placeholder={status === "closed" ? "Диалог закрыт" : "Сообщение..."}
          disabled={isLoading || status === "closed"}
          className="min-h-[40px] max-h-[100px] resize-none rounded-2xl text-sm"
          rows={1}
        />
        <Button
          size="icon"
          className="rounded-full shrink-0 h-10 w-10 bg-gradient-to-br from-primary to-primary/80 shadow-md shadow-primary/30"
          onClick={() => handleSend()}
          disabled={isLoading || !input.trim() || status === "closed"}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <VersionFooter />
    </>
  );
}
