import { useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface PageHelpBubbleProps {
  title: string;
  description: string;
  helpUrl?: string;
  className?: string;
}

/**
 * Маленький "?" в углу страницы с короткой справкой.
 * Не залезать в Help-центр ради одной строчки.
 */
export function PageHelpBubble({ title, description, helpUrl, className }: PageHelpBubbleProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors",
            className
          )}
          aria-label="Справка по разделу"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={6}
        className="w-72 rounded-xl p-3 shadow-lg border-border/60"
      >
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground mb-1">{title}</div>
            <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
            {helpUrl && (
              <a
                href={helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 text-xs font-medium text-primary hover:underline"
              >
                Подробнее в Справочном центре →
              </a>
            )}
          </div>
          <button
            onClick={() => setOpen(false)}
            className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Закрыть"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
