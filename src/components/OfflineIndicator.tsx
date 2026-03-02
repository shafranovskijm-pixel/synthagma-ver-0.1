import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

export const OfflineIndicator = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => {
      setIsOffline(false);
      setShowRestored(true);
      setTimeout(() => setShowRestored(false), 3000);
    };

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!isOffline && !showRestored) return null;

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-[200] flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium transition-all duration-300",
        isOffline
          ? "bg-destructive text-destructive-foreground"
          : "bg-green-600 text-white"
      )}
    >
      {isOffline ? (
        <>
          <WifiOff className="w-4 h-4" />
          <span>Нет подключения к интернету. Данные могут быть устаревшими.</span>
        </>
      ) : (
        <>
          <Wifi className="w-4 h-4" />
          <span>Соединение восстановлено</span>
        </>
      )}
    </div>
  );
};
