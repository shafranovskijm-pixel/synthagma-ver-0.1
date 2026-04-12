import { MessageCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function OrgSupportChat() {
  return (
    <div className="fixed bottom-6 right-6 z-40">
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href="https://t.me/sintagma_support"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
          >
            <MessageCircle className="h-6 w-6" />
          </a>
        </TooltipTrigger>
        <TooltipContent side="left">Чат поддержки</TooltipContent>
      </Tooltip>
    </div>
  );
}
