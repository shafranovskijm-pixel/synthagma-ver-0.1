import { WifiOff } from "lucide-react";

interface OfflineBannerProps {
  cachedAt?: number;
}

export const OfflineBanner = ({ cachedAt }: OfflineBannerProps) => {
  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-400 flex items-center gap-2 py-2 px-4 text-sm font-medium rounded-lg mx-4 mt-4">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>
        Офлайн-режим: данные загружены из кеша
        {cachedAt && <span className="text-xs opacity-75 ml-1">({formatDate(cachedAt)})</span>}
        . Прогресс будет синхронизирован при восстановлении связи.
      </span>
    </div>
  );
};
