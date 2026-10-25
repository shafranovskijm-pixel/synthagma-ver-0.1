import type {ArchiveSourceChoice} from '@/lib/archiveCases/contract';
import type {ArchiveCasesModel} from '@/hooks/useArchiveCases';
import {ArchiveSourcePicker} from './ArchiveSourcePicker';
export function ArchiveEvidenceField({model,value,onChange,label='Документ-основание',disabled=false}:{model:ArchiveCasesModel;value:ArchiveSourceChoice|null;onChange:(value:ArchiveSourceChoice)=>void;label?:string;disabled?:boolean}){
 return <div className="space-y-2"><div className="text-sm font-medium">{label}</div><ArchiveSourcePicker model={model} allowedKinds={['organization_document_version']} onChoose={onChange} label={value?'Изменить документ':'Выбрать документ'} disabled={disabled}/>{value&&<p className="text-sm text-muted-foreground break-words">{value.label}</p>}<p className="text-xs text-muted-foreground">Фиксируется точная версия. Права и доступность основания проверяются при сохранении.</p></div>;
}
