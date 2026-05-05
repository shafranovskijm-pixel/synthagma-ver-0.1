import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getProxyStatus } from '@/utils/proxyFetch';

/**
 * Маленький ненавязчивый индикатор «соединение через резервный канал».
 * Показывается только когда прокси-режим активен (на sintagma.com.ru — всегда).
 */
export function ProxyChannelIndicator() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const update = () => {
      const { enabled } = getProxyStatus();
      setActive(enabled);
    };
    update();
    const handler = () => update();
    window.addEventListener('sintagma:proxy-activated', handler);
    const interval = setInterval(update, 10_000);
    return () => {
      window.removeEventListener('sintagma:proxy-activated', handler);
      clearInterval(interval);
    };
  }, []);

  if (!active) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="fixed bottom-3 left-3 z-40 flex items-center gap-1.5 rounded-full bg-background/85 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-md backdrop-blur-sm border border-border/40 cursor-default select-none">
            <Shield className="h-3 w-3 text-primary" />
            <span>Резервный канал</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          Соединение с сервером идёт через резервный канал на том же домене. Это нормально и не влияет на работу платформы.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
