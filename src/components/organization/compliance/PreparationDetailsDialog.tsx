import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PREPARATION_EDITION, preparationExample, preparationFileName, preparationPlan } from '@/lib/uc-compliance/preparationCatalog';
import { ADAPTATION_EDITION, adaptationDraftBasis } from '@/lib/uc-compliance/adaptationDrafts';
import type { RequirementDefinition } from '@/lib/uc-compliance/model';

type WorkflowLink = { href: string; label: string };
interface Props {
 requirement: RequirementDefinition;
 workflow: WorkflowLink | null;
 onSelfExamination?: () => void;
 onUploadDraft?: () => void;
 onOpenVersions?: () => void;
 onClose: () => void;
}
export function PreparationDetailsDialog({ requirement, workflow, onSelfExamination, onUploadDraft, onOpenVersions, onClose }: Props) {
 const plan = preparationPlan(requirement.id), example = preparationExample(requirement.id);
 const [downloadError, setDownloadError] = useState(false);
 const isDraft = plan?.kind === 'adaptation_outline', basis = adaptationDraftBasis(requirement.id);
 if (!plan || !example) return null;
 const download = () => {
  const name = preparationFileName(requirement.id); if (!name) return;
  let url: string | null = null;
  try {
   url = URL.createObjectURL(new Blob([example], { type: 'text/plain;charset=utf-8' }));
   const anchor = document.createElement('a'); anchor.href = url; anchor.download = name;
   document.body.appendChild(anchor); anchor.click(); anchor.remove(); setDownloadError(false);
  } catch { setDownloadError(true); }
  finally { if (url) URL.revokeObjectURL(url); }
 };
 return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl">
  <DialogHeader><DialogTitle>{requirement.label}: образец и подготовка</DialogTitle><DialogDescription>{plan.scope}</DialogDescription></DialogHeader>
  <p className="text-sm text-muted-foreground">Это материал для подготовки и адаптации. Он не утверждает документ, не подписывает его и не подтверждает правовую готовность центра.</p>
  <p className="text-xs text-muted-foreground">Редакция примера: {isDraft ? ADAPTATION_EDITION : PREPARATION_EDITION}. Дата редакции не означает проверку всех действующих норм.</p>
  {plan.limit && <p className="text-sm text-muted-foreground">{plan.limit}</p>}
  <section className="space-y-2"><h3 className="font-medium">Что заполнить и проверить</h3><ol className="list-decimal pl-5 space-y-2 text-sm">{plan.steps.map(step => <li key={step}>{step}</li>)}</ol></section>
  <section className="space-y-2"><h3 className="font-medium">{plan.kind === 'official_record' ? 'Чек-лист подлинного документа' : plan.kind === 'adaptation_outline' ? 'Проект для адаптации' : 'Памятка по подготовке'}</h3><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl border bg-muted/30 p-3 text-xs" aria-label="Текст примера для адаптации">{example}</pre><Button size="sm" variant="outline" onClick={download}>{plan.kind === 'adaptation_outline' ? 'Скачать проект для адаптации' : 'Скачать чек-лист'}</Button>{downloadError && <p role="alert" className="text-sm text-destructive">Не удалось скачать пример. Его текст доступен в предпросмотре.</p>}</section>
  <section className="space-y-2"><h3 className="font-medium">Основания и ограничения</h3><p className="text-sm text-muted-foreground">Перед использованием проверьте полную текущую редакцию источников, применимость к своему виду деятельности и полномочия согласующих. Неподтверждённые сведения не заполняются автоматически.</p>{isDraft ? basis.map(source => <div key={source.id} className="space-y-1 text-sm"><p><a href={source.href} target="_blank" rel="noopener noreferrer" className="text-primary underline">{source.title}</a> — {source.provision}</p><p className="text-muted-foreground">Прочитанная редакция / объём: {source.readEdition}</p><p className="text-muted-foreground">Предел проверки: {source.readScope}</p><p className="text-muted-foreground">{source.limitation}</p></div>) : requirement.legalSources.map(source => <p key={source.id} className="text-sm"><a href={source.primaryUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">{source.title}</a> — {source.provision}{source.limitation && <span className="block text-muted-foreground">{source.limitation}</span>}</p>)}{plan.links?.map(link => <div key={link.href} className="text-sm"><a href={link.href} target="_blank" rel="noopener noreferrer" className="text-primary underline">{link.label}</a><p className="text-muted-foreground">{link.verification}</p></div>)}</section>
  <section className="space-y-2"><h3 className="font-medium">Следующий шаг</h3><p className="text-sm">{plan.nextStep}</p>{isDraft && <p className="text-sm text-muted-foreground">Скачайте TXT, адаптируйте его в редакторе и сохраните PDF или DOCX: существующая форма напрямую TXT не принимает. Загрузка выполняется только по вашей команде в существующей форме. После сохранения откройте «Файл и версии» и выберите точную редакцию; наличие файла не подтверждает утверждение.</p>}<div className="flex flex-wrap gap-2">{isDraft && onUploadDraft && <Button size="sm" variant="outline" onClick={() => { onClose(); onUploadDraft(); }}>Загрузить подготовленный проект</Button>}{isDraft && onOpenVersions && <Button size="sm" variant="outline" onClick={() => { onClose(); onOpenVersions(); }}>Открыть файл и версии проекта</Button>}{workflow && <Button size="sm" variant="outline" asChild><a href={workflow.href}>{workflow.label}</a></Button>}{onSelfExamination && <Button size="sm" variant="outline" onClick={onSelfExamination}>Открыть анкету самообследования</Button>}<Button size="sm" variant="outline" onClick={onClose}>Закрыть</Button></div></section>
 </DialogContent></Dialog>;
}
