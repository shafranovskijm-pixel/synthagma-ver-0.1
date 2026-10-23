import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { captureDocumentRegistryScope, readDocumentRegistry, normalizeRegistryError, registryMessages } from '@/lib/documentRegistry/client';
import { issuanceScopeCurrent, type EducationIssuanceScope } from '@/lib/educationIssuance/client';
import type { RegistrySourceChoice } from '@/lib/documentRegistry/contract';
import type { IssuanceSource } from '@/lib/educationIssuance/types';

export function IssuanceSourcePicker({ scope, value, onChange, disabled, label = 'Подтверждающий файл: точная версия' }: {
  scope: EducationIssuanceScope | null; value: IssuanceSource | null; onChange: (source: IssuanceSource | null) => void; disabled?: boolean; label?: string;
}) {
  const [search, setSearch] = useState(''), [options, setOptions] = useState<RegistrySourceChoice[]>([]);
  const [after, setAfter] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const run = useRef(0), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; ++run.current; }; }, []);
  const load = async (append: boolean, searchText: string, cursor: string | null) => {
    const generation = ++run.current; setBusy(true); setError(null);
    if (!scope || !issuanceScopeCurrent(scope)) { setOptions([]); setAfter(null); setBusy(false); return; }
    try {
      const registryScope = captureDocumentRegistryScope(scope.organizationId, scope.issuanceScope, () => alive.current && generation === run.current && issuanceScopeCurrent(scope));
      const result = await readDocumentRegistry(registryScope, { kind: 'sources', text: searchText, after_id: cursor, limit: 100 });
      if (result.kind !== 'sources') throw new Error('SOURCE_UNAVAILABLE');
      if (alive.current && generation === run.current && issuanceScopeCurrent(scope)) { setOptions(previous => append ? [...previous, ...result.sources] : result.sources); setAfter(result.next_after_id); }
    } catch (error) { if (alive.current && generation === run.current) { setOptions([]); setAfter(null); setError(registryMessages[normalizeRegistryError(error).code]); } }
    finally { if (alive.current && generation === run.current) setBusy(false); }
  };
  useEffect(() => { setOptions([]); setAfter(null); const timer = window.setTimeout(() => { void load(false, search, null); }, 250); return () => { window.clearTimeout(timer); ++run.current; }; }, [scope, search]);
  const current = !!scope && issuanceScopeCurrent(scope), visible = current ? options : [];
  return <div className="space-y-2">
    <Label>{label}</Label>
    <Input aria-label={`Поиск: ${label}`} placeholder="Найти документ или версию" maxLength={200} value={search} disabled={disabled || !current} onChange={event => setSearch(event.target.value)} />
    <Select value={current ? value?.version_id ?? '' : ''} onValueChange={id => onChange(visible.find(row => row.source.version_id === id)?.source ?? null)} disabled={disabled || !current || busy}>
      <SelectTrigger><SelectValue placeholder={busy ? 'Загрузка версий...' : 'Выберите сохранённую приватную версию'} /></SelectTrigger>
      <SelectContent>{visible.map(row => <SelectItem key={row.source.version_id} value={row.source.version_id}>{row.label}</SelectItem>)}</SelectContent>
    </Select>
    {after && <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={() => void load(true, search, after)}>Ещё версии</Button>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <p className="text-xs text-muted-foreground">Выберите уже сохранённый документ. Его наличие не подтверждает подпись или содержание; основание проверяет ответственный сотрудник.</p>
  </div>;
}
