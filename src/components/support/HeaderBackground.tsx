import { forwardRef } from "react";
import { StarfieldCanvas } from "@/components/landing/StarfieldCanvas";
import { AuroraBackground } from "@/components/support/chat-backgrounds/Aurora";
import { WavesBackground } from "@/components/support/chat-backgrounds/Waves";
import type { ChatBgId } from "@/hooks/useChatTheme";

interface Props {
  bgId: ChatBgId;
}

/**
 * Анимированный фон для шапки виджета поддержки.
 * Обёрнут в forwardRef, чтобы не было React-warning при использовании
 * внутри Radix-композиций (Tooltip / Popover Trigger asChild).
 */
export const HeaderBackground = forwardRef<HTMLDivElement, Props>(
  ({ bgId }, ref) => {
    if (bgId === "stars") {
      return (
        <div ref={ref} className="absolute inset-0 opacity-60 pointer-events-none">
          <StarfieldCanvas density="low" />
        </div>
      );
    }
    if (bgId === "aurora") return <AuroraBackground ref={ref} />;
    if (bgId === "waves") return <WavesBackground ref={ref} />;
    return <div ref={ref} className="hidden" />;
  }
);
HeaderBackground.displayName = "HeaderBackground";
