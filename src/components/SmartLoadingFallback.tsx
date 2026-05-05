import { useEffect, useState } from "react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface SmartLoadingFallbackProps {
  /** Seconds to wait before showing the recovery UI. Default 10. */
  timeoutSec?: number;
  /** Smaller variant for inner Suspense boundaries (no full-screen). */
  inline?: boolean;
  /** Optional label shown above the spinner */
  label?: string;
}

/**
 * Loading fallback that escalates to a recovery UI if the wait is too long.
 * Used to prevent users getting stuck on infinite spinners when a lazy
 * chunk fails to load or a downstream init hangs (cached SW, slow CDN, etc.).
 */
export function SmartLoadingFallback({
  timeoutSec = 10,
  inline = false,
  label,
}: SmartLoadingFallbackProps) {
  const [stuck, setStuck] = useState(false);
  const [hardStuck, setHardStuck] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setStuck(true), timeoutSec * 1000);
    const t2 = setTimeout(() => setHardStuck(true), (timeoutSec + 15) * 1000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [timeoutSec]);

  const purgeAndReload = async () => {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
    } catch {
      // ignore
    }
    try {
      sessionStorage.removeItem("chunk_reload_done");
      sessionStorage.removeItem("__sw_recovery_attempted");
      sessionStorage.removeItem("__purge_preview_session");
    } catch {
      // ignore
    }
    window.location.reload();
  };

  const wrapperClass = inline
    ? "flex flex-col items-center justify-center gap-4 py-16"
    : "min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-4";

  return (
    <div className={wrapperClass}>
      <SigmaSpinner size={inline ? "lg" : "xl"} />
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
      {stuck && (
        <div className="flex flex-col items-center gap-3 max-w-sm text-center mt-2">
          <p className="text-sm text-muted-foreground">
            Загрузка занимает дольше обычного. Возможно, в браузере осталась
            устаревшая версия страницы.
          </p>
          <Button onClick={purgeAndReload} variant="outline" className="rounded-xl gap-2">
            <RefreshCw className="w-4 h-4" />
            Обновить страницу
          </Button>
          {hardStuck && (
            <p className="text-xs text-muted-foreground">
              Если страница не загрузилась после обновления — попробуйте войти
              заново на странице{" "}
              <a href="/login" className="underline">
                /login
              </a>
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
}
