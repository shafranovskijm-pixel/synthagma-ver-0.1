import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Link } from 'react-router-dom';

const DISMISS_KEY = 'sintagma_block_banner_dismissed_until';
const DETECTED_KEY = 'sintagma_network_block_detected';

/**
 * Persistent top banner shown when safeInvoke detects that requests are blocked
 * by corporate firewall / antivirus. Polls sessionStorage flag set by
 * networkErrorDetector.markBlockDetected().
 */
export function NetworkBlockBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const check = () => {
      const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (dismissedUntil > Date.now()) { setVisible(false); return; }
      const detected = sessionStorage.getItem(DETECTED_KEY);
      setVisible(!!detected);
    };
    check();
    const interval = setInterval(check, 3000);
    return () => clearInterval(interval);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    // прячем на 30 минут
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 30 * 60 * 1000));
    setVisible(false);
  };

  return (
    <div className="sticky top-0 z-50 bg-destructive/95 text-destructive-foreground shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3 text-sm">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-medium">Часть запросов блокируется. </span>
          <span className="opacity-90">
            Возможно, корпоративный антивирус или firewall не пропускает соединение с сервером.{' '}
          </span>
          <Link to="/connection-check" className="underline font-medium hover:opacity-80">
            Проверить соединение →
          </Link>
        </div>
        <button onClick={dismiss} className="opacity-80 hover:opacity-100 shrink-0" aria-label="Скрыть">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
