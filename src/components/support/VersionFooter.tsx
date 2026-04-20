import { APP_VERSION, BUILD_DATE_SHORT } from "@/lib/appVersion";

/**
 * Подвал виджета поддержки с версией и датой билда.
 * Помогает поддержке быстро понять, не нужен ли клиенту Ctrl+Shift+R.
 */
export function VersionFooter() {
  return (
    <div className="shrink-0 border-t border-border/50 bg-muted/30 px-3 py-1.5 text-center">
      <p className="text-[10px] text-muted-foreground/70 font-mono tracking-wide">
        Синтагма · v{APP_VERSION} · {BUILD_DATE_SHORT}
      </p>
    </div>
  );
}
