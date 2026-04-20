import { Bot, Headset, ChevronDown, Pencil, Send, ExternalLink } from "lucide-react";
import { SigmaLogo } from "@/components/ui/SigmaLogo";

import { HeaderBackground } from "@/components/support/HeaderBackground";
import { VersionFooter } from "@/components/support/VersionFooter";
import { useChatTheme } from "@/hooks/useChatTheme";
import type { SupportMessage, SupportStatus } from "@/components/support/utils";

interface Props {
  onClose: () => void;
  onWrite: () => void;
  hasHistory: boolean;
  messages: SupportMessage[];
  status: SupportStatus;
}

export function HomeView({ onClose, onWrite, hasHistory, messages, status }: Props) {
  const { bgId } = useChatTheme();
  const lastMsg = hasHistory ? messages[messages.length - 1] : null;

  return (
    <>
      {/* Branded header */}
      <div
        className="relative h-44 shrink-0 overflow-hidden"
        style={{
          background: `linear-gradient(135deg, hsl(var(--chat-accent)), hsl(var(--chat-accent-dark)))`,
        }}
      >
        <HeaderBackground bgId={bgId} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/30 pointer-events-none" />

        <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="relative z-20 h-8 w-8 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white backdrop-blur-sm transition-colors"
            aria-label="Свернуть"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white px-6 pointer-events-none">
          <SigmaLogo size="sm" variant="white" className="scale-90" />
          <p className="text-xs text-white/80 mt-2 font-medium">Мы на связи — поможем за минуту</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onWrite}
            className="group flex flex-col items-center gap-2.5 p-4 rounded-2xl bg-muted/60 hover:bg-muted transition-all hover:-translate-y-0.5"
          >
            <div className="h-11 w-11 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-md shadow-primary/30 group-hover:scale-110 transition-transform">
              <Pencil className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold">Написать</p>
              <p className="text-[11px] text-muted-foreground">ИИ-помощник</p>
            </div>
          </button>

          <a
            href="https://t.me/+SVTbxqnGmF1iMzIy"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col items-center gap-2.5 p-4 rounded-2xl bg-muted/60 hover:bg-muted transition-all hover:-translate-y-0.5"
          >
            <div className="h-11 w-11 rounded-full bg-gradient-to-br from-[#229ED9] to-[#1a7eb0] flex items-center justify-center shadow-md shadow-[#229ED9]/30 group-hover:scale-110 transition-transform">
              <Send className="h-5 w-5 text-white" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold">Telegram</p>
              <p className="text-[11px] text-muted-foreground">Быстрый ответ</p>
            </div>
          </a>
        </div>

        {hasHistory && lastMsg && (
          <div className="mt-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">История</p>
            <button
              type="button"
              onClick={onWrite}
              className="w-full flex items-start gap-3 p-3 rounded-2xl bg-muted/40 hover:bg-muted/70 transition-colors text-left"
            >
              <div className="h-9 w-9 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                {status === "human" ? (
                  <Headset className="h-4 w-4 text-primary" />
                ) : (
                  <Bot className="h-4 w-4 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {status === "human" ? "Оператор поддержки" : "ИИ-помощник Синтагма"}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  {lastMsg.content}
                </p>
              </div>
            </button>
          </div>
        )}

        <a
          href="/help"
          className="mt-5 flex items-center justify-between p-3 rounded-2xl bg-muted/40 hover:bg-muted/70 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <ExternalLink className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Справочный центр</p>
              <p className="text-[11px] text-muted-foreground">Гайды и инструкции</p>
            </div>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90" />
        </a>
      </div>
      <VersionFooter />
    </>
  );
}
