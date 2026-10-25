import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RegistrySourceField } from '../RegistrySourceField';
import { useDocumentRegistry } from '@/hooks/useDocumentRegistry';
import type { RegistrySourceChoice } from '@/lib/documentRegistry/contract';
import type { SelfExaminationAction, SelfExaminationDraft, SelfExaminationFact } from '@/lib/selfExamination/draft';
import { selfExaminationFactLabel } from '../../../../supabase/functions/_shared/self-examination-labels';
const scope={kind:'organization' as const};
const stateLabel={unknown:'Не указано',entered:'Введено, не подтверждено',confirmed:'Подтверждено',not_applicable:'Не применимо'};
type Props={draft:SelfExaminationDraft;disabled:boolean;mutate:(a:SelfExaminationAction)=>Promise<boolean>};
export function SelfExaminationSourceReviews({draft,disabled,mutate}:Props){
 const[selected,setSelected]=useState<string|null>(null);
 const fact=draft.facts.find(f=>f.fact_key===selected);
 return <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer font-medium">Подтверждение фактов — осталось {draft.missing_fact_keys.length}</summary>
 <p className="text-xs text-muted-foreground my-3">Для каждого сведения укажите исходный файл, место в нём и результат проверки. Введённое значение само по себе не считается проверенным. Сформированный отчёт не может подтверждать собственные исходные факты.</p>
 <Label htmlFor="self-fact">Выберите сведение</Label><select id="self-fact" className="w-full rounded-xl border bg-background p-2" disabled={disabled} value={selected??''} onChange={e=>setSelected(e.target.value||null)}><option value="">Выберите...</option>{draft.facts.map(f=><option key={f.fact_key} value={f.fact_key}>{selfExaminationFactLabel(f.fact_key)} — {stateLabel[f.state]}{['confirmed','not_applicable'].includes(f.state)&&!f.source_current?' (источник изменился)':''}</option>)}</select>
 {fact&&<FactReview key={draft.id+':'+draft.revision+':'+fact.fact_key} organizationId={draft.organization_id} fact={fact} disabled={disabled} mutate={mutate}/>}</details>;
}
function FactReview({organizationId,fact,disabled,mutate}:{organizationId:string;fact:SelfExaminationFact;disabled:boolean;mutate:Props['mutate']}){
 const registry=useDocumentRegistry(organizationId,scope);
 const[source,setSource]=useState<RegistrySourceChoice|null>(null),[busy,setBusy]=useState(false),[location,setLocation]=useState(fact.location??''),[note,setNote]=useState(fact.review_note??''),[state,setState]=useState<'confirmed'|'not_applicable'>('confirmed'),[error,setError]=useState<string|null>(null);
 const submit=async()=>{if(!source||source.source.kind!=='org_document_version'){setError('Выберите сохранённую версию документа организации.');return;}setError(null);await mutate({kind:'review_fact',fact_key:fact.fact_key,expected_value_hash:fact.value_hash,state,source:source.source,location:location.trim(),review_note:note.trim()});};
 return <div className="space-y-3 mt-4"><p className="text-sm">Сохранённое значение: <span className="break-words">{fact.value===null?'Не указано':typeof fact.value==='object'?JSON.stringify(fact.value):String(fact.value)}</span></p>
 <RegistrySourceField model={registry} title={'Основание самообследования: '+selfExaminationFactLabel(fact.fact_key)} value={source} onChange={choice=>{if(choice&&choice.source.kind!=='org_document_version'){setError('Пакет ФРДО не является исходным документом для этого сведения.');setSource(null);}else setSource(choice);}} onBusy={setBusy} disabled={disabled}/>
 <Label htmlFor="self-fact-location">Страница, раздел или строка источника</Label><Input id="self-fact-location" value={location} maxLength={2000} disabled={disabled||busy} onChange={e=>setLocation(e.target.value)}/>
 <Label htmlFor="self-fact-review">Что проверено; для неприменимости — обоснование</Label><Textarea id="self-fact-review" value={note} maxLength={4000} disabled={disabled||busy} onChange={e=>setNote(e.target.value)}/>
 <select aria-label="Результат проверки" className="w-full rounded-xl border bg-background p-2" value={state} disabled={disabled||busy} onChange={e=>setState(e.target.value as typeof state)}><option value="confirmed">Подтверждаю введённое значение по источнику</option><option value="not_applicable">Не применимо — основание указано выше</option></select>
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 <div className="flex gap-2 flex-wrap"><Button variant="outline" disabled={disabled||busy||!source||!location.trim()||!note.trim()} onClick={submit}>Сохранить проверку</Button><Button variant="ghost" disabled={disabled||busy||!fact.source} onClick={()=>mutate({kind:'clear_review',fact_key:fact.fact_key})}>Снять подтверждение</Button></div></div>;
}
