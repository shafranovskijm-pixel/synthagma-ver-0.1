import { Palette, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CHAT_THEMES, CHAT_BACKGROUNDS, type ChatThemeId, type ChatBgId } from "@/hooks/useChatTheme";
import { cn } from "@/lib/utils";

interface Props {
  themeId: ChatThemeId;
  setThemeId: (id: ChatThemeId) => void;
  bgId: ChatBgId;
  setBgId: (id: ChatBgId) => void;
}

export function ChatThemePicker({ themeId, setThemeId, bgId, setBgId }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="h-8 w-8 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white backdrop-blur-sm transition-colors"
          aria-label="Настроить внешний вид"
          onClick={(e) => e.stopPropagation()}
        >
          <Palette className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-64 p-3 z-[60]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-1">
              Цвет акцента
            </p>
            <div className="flex items-center gap-2">
              {CHAT_THEMES.map((t) => {
                const active = t.id === themeId;
                return (
                  <button
                    key={t.id}
                    onClick={() => setThemeId(t.id)}
                    className={cn(
                      "relative h-9 w-9 rounded-full transition-transform hover:scale-110",
                      active && "ring-2 ring-offset-2 ring-offset-background"
                    )}
                    style={{
                      background: `linear-gradient(135deg, hsl(${t.accent}), hsl(${t.accentDark}))`,
                      boxShadow: `0 4px 12px -2px hsl(${t.accent} / 0.5)`,
                      // @ts-expect-error CSS var
                      "--tw-ring-color": `hsl(${t.accent})`,
                    }}
                    aria-label={t.name}
                    title={t.name}
                  >
                    {active && (
                      <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-px bg-border" />

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-1">
              Анимация шапки
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {CHAT_BACKGROUNDS.map((b) => {
                const active = b.id === bgId;
                return (
                  <button
                    key={b.id}
                    onClick={() => setBgId(b.id)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors text-left",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted/70 text-foreground"
                    )}
                  >
                    {b.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
