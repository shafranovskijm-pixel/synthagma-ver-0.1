import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DocumentRegistryModel } from '@/hooks/useDocumentRegistry';
import type { RegistrySourceChoice } from '@/lib/documentRegistry/contract';
import { prepareRegistrySourceUpload, uploadRegistrySource } from '@/lib/documentRegistry/files';
import { normalizeRegistryError, registryMessages } from '@/lib/documentRegistry/errors';

export function RegistryChoice({ label, value, options, onChange, disabled = false }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; disabled?: boolean }) {
  const id = useId();
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger id={id} aria-label={label} className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>;
}
export function RegistrySourceField({ model, value, title, onChange, onBusy, disabled = false }: { model: DocumentRegistryModel; value: RegistrySourceChoice | null; title: string; onChange: (value: RegistrySourceChoice | null) => void; onBusy: (busy: boolean) => void; disabled?: boolean }) {
  const [sources, setSources] = useState<RegistrySourceChoice[]>([]), [next, setNext] = useState<string | null>(null), [search, setSearch] = useState(''), [loading, setLoading] = useState(false), [uploading, setUploading] = useState(false), [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null), mounted = useRef(true), ticket = useRef(0), operation = useRef<ReturnType<typeof prepareRegistrySourceUpload> | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; ticket.current++; }; }, []);
  const current = () => mounted.current && model.scopeCurrent();
  const load = async (more = false) => {
    if (!current() || !model.capabilities?.can_open_file || more && !next) return;
    const run = ++ticket.current; setLoading(true); setError(null);
    try { const result = await model.read({ kind: 'sources', text: search, after_id: more ? next : null, limit: 100 }); if (!current() || run !== ticket.current || result.kind !== 'sources') return; setSources(old => more ? [...old, ...result.sources] : result.sources); setNext(result.next_after_id); }
    catch (error) { if (current() && run === ticket.current) setError(registryMessages[normalizeRegistryError(error).code]); }
    finally { if (current() && run === ticket.current) setLoading(false); }
  };
  useEffect(() => { const timer = setTimeout(() => void load(), 250); return () => { clearTimeout(timer); ticket.current++; }; }, [search, model.read, model.capabilities?.can_open_file]);
  const upload = async () => {
    if (!current() || !model.scope || !file || uploading || disabled || !model.capabilities?.can_capture_source) return;
    setError(null); setUploading(true); onBusy(true); onChange(null);
    try {
      operation.current ??= prepareRegistrySourceUpload(model.organizationId, file, title);
      setUncertain(true);
      const saved = await uploadRegistrySource(model.scope, operation.current);
      if (!current()) return;
      const result = await model.read({ kind: 'source', document_id: saved.document_id, version_id: saved.version_id });
      if (!current() || result.kind !== 'source') return;
      onChange(result.source); setSources(old => [result.source, ...old.filter(item => item.source.version_id !== result.source.source.version_id)]); operation.current = null; setUncertain(false); setFile(null);
      toast.success('Версия файла сохранена. Регистрация выполняется отдельно.');
    } catch (error) { if (current()) setError(registryMessages[normalizeRegistryError(error).code]); }
    finally { if (current()) { setUploading(false); onBusy(false); } }
  };
  const choices = value && !sources.some(choice => choice.source.version_id === value.source.version_id) ? [value, ...sources] : sources;
  return <div className="space-y-3 rounded-xl border border-border p-4">
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <p className="font-medium text-sm">Файл и сохранённая версия *</p>
    {model.capabilities?.can_open_file && <><Input aria-label="Поиск сохранённых файлов" value={search} maxLength={200} onChange={event => setSearch(event.target.value)} placeholder="Найти сохранённую версию..." disabled={disabled || uploading || uncertain} className="rounded-xl" /><RegistryChoice label="Сохранённая версия файла" value={value?.source.version_id ?? 'none'} options={[{ value: 'none', label: 'Выберите версию' }, ...choices.map(choice => ({ value: choice.source.version_id, label: choice.label }))]} onChange={id => onChange(choices.find(choice => choice.source.version_id === id) ?? null)} disabled={disabled || uploading || uncertain} />{next && <Button variant="outline" size="sm" onClick={() => load(true)} disabled={disabled || loading}>Ещё версии</Button>}</>}
    {value && <p className="text-xs text-muted-foreground">Выбрана сохранённая версия: {value.label}. Связь подтверждает файл, а не подпись или выдачу.</p>}
    {model.capabilities?.can_capture_source && <div className="space-y-2"><Label>Или сохранить новый исходник</Label><Input aria-label="Новый исходный файл" type="file" disabled={disabled || uploading || uncertain} onChange={event => { setFile(event.target.files?.[0] ?? null); operation.current = null; event.target.value = ''; }} className="rounded-xl" />{file && <p className="text-xs text-muted-foreground">{file.name}</p>}<Button variant="outline" onClick={upload} disabled={disabled || uploading || !file}>{uploading ? 'Сохранение версии...' : uncertain ? 'Повторить сохранение той же версии' : 'Сохранить версию файла'}</Button>{uncertain && <p className="text-xs text-muted-foreground">Результат сохранения ещё не подтверждён. Повтор использует тот же запрос; файл не удаляется.</p>}</div>}
    {!model.capabilities?.can_open_file && !value && <p className="text-xs text-muted-foreground">Просмотр прежних файлов требует отдельного права. Собственный новый исходник можно сохранить при наличии права загрузки.</p>}
  </div>;
}
