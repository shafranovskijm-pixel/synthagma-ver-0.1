import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { DocumentRegistryModel } from '@/hooks/useDocumentRegistry';
import type { RegistryMutation } from '@/lib/documentRegistry/contract';
import { normalizeRegistryError, registryMessages } from '@/lib/documentRegistry/errors';

export function RegistryPendingNotice({ model, onResult, onCancel }: { model: DocumentRegistryModel; onResult: (result: RegistryMutation) => void; onCancel?: () => void }) {
  const [error, setError] = useState<string | null>(null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = () => mounted.current && model.scopeCurrent();
  if (!model.pending) return null;
  const retry = async () => { setError(null); try { const result = await model.retry(); if (current()) onResult(result); } catch (failure) { if (current()) setError(registryMessages[normalizeRegistryError(failure).code]); } };
  return <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 space-y-2"><p className="text-sm">{error ?? registryMessages[model.mutationError ?? 'DEPENDENCY_UNAVAILABLE']} Повтор использует тот же запрос и не создаёт вторую регистрацию.</p><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={retry} disabled={model.saving}>Повторить тот же запрос</Button>{model.mutationError === 'REVISION_CONFLICT' && <Button variant="ghost" disabled={model.saving} onClick={() => { if (model.cancelRejected()) onCancel?.(); }}>Отменить отклонённый запрос</Button>}</div></div>;
}
