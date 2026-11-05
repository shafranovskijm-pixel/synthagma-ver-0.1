import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { parseSupportScreenshotReference } from '@/lib/support/supportScreenshotReference';

interface SupportRequestScreenshotProps {
  reference: string;
  userId: string;
  requestId: string;
}
type ScreenshotState = { scope: string; status: 'loading' | 'error' | 'ready'; url?: string };

/** Mounted only inside an expanded admin request; no signed URL is persisted. */
export function SupportRequestScreenshot({ reference, userId, requestId }: SupportRequestScreenshotProps) {
  const location = useMemo(() => parseSupportScreenshotReference(reference, userId, requestId), [reference, userId, requestId]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ScreenshotState | null>(null);
  const scope = JSON.stringify([reference, userId, requestId, attempt]);

  useEffect(() => {
    if (!location) return;
    let current = true;
    setState({ scope, status: 'loading' });
    void (async () => {
      try {
        const { data, error } = await supabase.storage.from(location.bucket).createSignedUrl(location.path, 300);
        if (!current) return;
        if (error || !data?.signedUrl) throw new Error('screenshot_unavailable');
        const url = new URL(data.signedUrl);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error('invalid_screenshot_url');
        setState({ scope, status: 'ready', url: data.signedUrl });
      } catch {
        if (current) setState({ scope, status: 'error' });
      }
    })();
    return () => { current = false; };
  }, [location, scope]);

  if (!location) return <p role="alert" className="text-sm text-muted-foreground">Ссылка на скриншот не соответствует обращению.</p>;
  // A new row must not render the previous row's URL before its effect runs.
  const visible = state?.scope === scope ? state : null;
  if (visible?.status === 'error') return <div className="space-y-2">
    <p role="alert" className="text-sm text-muted-foreground">Не удалось загрузить скриншот.</p>
    <Button size="sm" variant="outline" onClick={() => setAttempt(value => value + 1)}>Загрузить скриншот снова</Button>
  </div>;
  if (visible?.status !== 'ready') return <p role="status" className="text-sm text-muted-foreground">Загрузка скриншота…</p>;
  return <img src={visible.url} alt="Скриншот обращения" className="max-h-48 rounded-lg border" referrerPolicy="no-referrer"
    onError={() => setState(current => current === visible ? { scope, status: 'error' } : current)} />;
}
