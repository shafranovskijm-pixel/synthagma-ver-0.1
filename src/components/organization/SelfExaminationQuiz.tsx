import { SelfExaminationOrderStatus } from './self-examination/SelfExaminationOrderStatus';
import { useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSelfExaminationDraft } from '@/hooks/useSelfExaminationDraft';
import { emptySelfExaminationDraft } from '../../../supabase/functions/_shared/self-examination-workflow-contract';
import { selfExaminationPeriod } from '../../../supabase/functions/_shared/self-examination-policy';
import { composeSelfExaminationDraft, quizFromDraft, selfExaminationOrderReference } from '@/lib/selfExamination/form';
import type { SelfExaminationDraftInput } from '@/lib/selfExamination/draft';
import { SelfExaminationFactsEditor } from './self-examination/SelfExaminationFactsEditor';
import { SelfExaminationSourceReviews } from './self-examination/SelfExaminationSourceReviews';
import { SelfExaminationFinalization } from './self-examination/SelfExaminationFinalization';
import { SelfExaminationHistory } from './self-examination/SelfExaminationHistory';
import { selfExaminationPriceLabel } from '@/lib/selfExamination/policy';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useSelfExaminationQuiz, QUIZ_STEPS } from "@/hooks/useSelfExaminationQuiz";
import type { QuizData } from "@/hooks/useSelfExaminationQuiz";

import { QuizStepOrganization } from "./self-examination/QuizStepOrganization";
import { QuizStepLicense } from "./self-examination/QuizStepLicense";
import { QuizStepManagement } from "./self-examination/QuizStepManagement";
import { QuizStepEducation } from "./self-examination/QuizStepEducation";
import { QuizStepQuality } from "./self-examination/QuizStepQuality";
import { QuizStepStaff } from "./self-examination/QuizStepStaff";
import { QuizStepInfrastructure } from "./self-examination/QuizStepInfrastructure";
import { QuizStepSummary } from "./self-examination/QuizStepSummary";

export type { QuizData };

export interface SelfExaminationQuizProps {
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reference: ReturnType<typeof selfExaminationOrderReference>) => Promise<void>;
  isSubmitting: boolean;
  organizationData?: {
    name?: string;
    inn?: string;
    kpp?: string;
    ogrn?: string;
    email?: string;
    phone?: string;
    legal_address?: string;
    director_name?: string;
    director_position?: string;
  };
}

export function SelfExaminationQuiz(props:SelfExaminationQuizProps){
 const auth=useAuth(),[dirty,setDirty]=useState(false);
 const close=(next:boolean)=>{if(!next&&dirty&&!window.confirm("Есть несохранённые изменения. Закрыть анкету без их сохранения?"))return;props.onOpenChange(next);};
 return <Dialog open={props.open} onOpenChange={close}>{props.open&&<SelfExaminationYearEntry onDirtyChange={setDirty} key={props.organizationId+':'+(auth.user?.id??'')+':'+auth.userRole} {...props}/>}</Dialog>;
}
function SelfExaminationYearEntry(props:SelfExaminationQuizProps&{onDirtyChange:(dirty:boolean)=>void}){
 const[year,setYear]=useState(new Date().getUTCFullYear()-1),[dirty,setDirty]=useState(false);
 return <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl"><div className="flex gap-3 items-center pr-6"><label htmlFor="self-year" className="text-sm">Отчётный год</label><select id="self-year" value={year} disabled={dirty||props.isSubmitting} onChange={e=>setYear(Number(e.target.value))} className="rounded-xl border bg-background p-2">{Array.from({length:new Date().getUTCFullYear()-1999},(_,i)=>new Date().getUTCFullYear()-i).map(y=><option key={y} value={y}>{y}</option>)}</select>{dirty&&<span className="text-xs text-muted-foreground">Сохраните или сбросьте изменения перед сменой года.</span>}</div><SelfExaminationEntry key={year} {...props} year={year} onDirty={next=>{setDirty(next);props.onDirtyChange(next);}}/></DialogContent>;
}
function SelfExaminationEntry({organizationId,year,onSubmit,isSubmitting,organizationData,onDirty}:SelfExaminationQuizProps&{year:number;onDirty:(dirty:boolean)=>void}) {
 const model=useSelfExaminationDraft(organizationId,year),quiz=useSelfExaminationQuiz(organizationData);
 const[metadata,setMetadata]=useState<SelfExaminationDraftInput>(()=>emptySelfExaminationDraft(year)),[metaDirty,setMetaDirty]=useState(false),[localError,setLocalError]=useState<string|null>(null);
 const loaded=useRef<string|null>(null),dirty=quiz.dirty||metaDirty;
 useLayoutEffect(()=>{onDirty(dirty||model.saving||model.uncertain);},[dirty,model.saving,model.uncertain]);
 useLayoutEffect(()=>{
  if(!model.current||model.loading||!model.loaded)return;
  const marker=model.contextKey+':'+(model.draft?.revision??0);
  if(loaded.current===marker||dirty)return;loaded.current=marker;
  if(model.draft){setMetadata(model.draft.body);quiz.replaceData(quizFromDraft(model.draft.body));}
  else{const period=selfExaminationPeriod(year);quiz.replaceData({...quiz.data,periodStart:period.from,periodEnd:period.to});setMetadata(emptySelfExaminationDraft(year));}
 },[model.contextKey,model.current,model.loading,model.draft?.revision]);
 const blocked=!model.current||!model.loaded||!model.canWrite||model.loading||model.saving||model.conflict||model.denied||!!model.draft&&!model.draft.can_write;
 const save=async()=>{
  setLocalError(null);try{const body=composeSelfExaminationDraft(year,quiz.data,metadata),saved=await model.mutate({kind:'save',body});if(saved){setMetadata(saved.body);quiz.replaceData(quizFromDraft(saved.body));setMetaDirty(false);loaded.current=model.contextKey+':'+saved.revision;}return saved;}
  catch{setLocalError('Проверьте числа, применимость и выбранную редакцию. Пустое значение не заменяется нулём.');return null;}
 };
 const order=async()=>{const saved=dirty||!model.draft?await save():model.draft;if(saved)await onSubmit(selfExaminationOrderReference(saved));};
 const reset=async()=>{setMetaDirty(false);if(model.draft){setMetadata(model.draft.body);quiz.replaceData(quizFromDraft(model.draft.body));}else{quiz.replaceData(quizFromDraft(emptySelfExaminationDraft(year)));setMetadata(emptySelfExaminationDraft(year));}await model.reload();};
  const renderStep = () => {
    switch (quiz.currentStep) {
      case 1: return <QuizStepOrganization data={quiz.data} updateData={quiz.updateData} isLoadingInn={quiz.isLoadingInn} innLoaded={quiz.innLoaded} onInnLoad={quiz.loadCompanyByInn} setInnLoaded={() => {}} />;
      case 2: return <QuizStepLicense data={quiz.data} updateData={quiz.updateData} toggleProgramType={quiz.toggleProgramType} addCommissionMember={quiz.addCommissionMember} removeCommissionMember={quiz.removeCommissionMember} updateCommissionMember={quiz.updateCommissionMember} />;
      case 3: return <QuizStepManagement data={quiz.data} updateData={quiz.updateData} />;
      case 4: return <QuizStepEducation data={quiz.data} updateData={quiz.updateData} addProgram={quiz.addProgram} removeProgram={quiz.removeProgram} updateProgram={quiz.updateProgram} />;
      case 5: return <QuizStepQuality data={quiz.data} updateData={quiz.updateData} toggleControlType={quiz.toggleControlType} />;
      case 6: return <QuizStepStaff data={quiz.data} addStaffMember={quiz.addStaffMember} removeStaffMember={quiz.removeStaffMember} updateStaffMember={quiz.updateStaffMember} />;
      case 7: return <QuizStepInfrastructure data={quiz.data} updateData={quiz.updateData} />;
      case 8: return <div className="space-y-5"><QuizStepSummary data={quiz.data} updateData={quiz.updateData}/><SelfExaminationFactsEditor body={metadata} onChange={body=>{setMetadata(body);setMetaDirty(true);}} disabled={blocked}/>{model.draft&&<><SelfExaminationSourceReviews draft={model.draft} disabled={blocked||dirty} mutate={async action=>!!await model.mutate(action)}/><SelfExaminationFinalization draft={model.draft} disabled={blocked||dirty} mutate={async action=>!!await model.mutate(action)}/><SelfExaminationOrderStatus organizationId={organizationId} draftId={model.draft.id} year={year} contextKey={model.contextKey}/><SelfExaminationHistory organizationId={organizationId} year={year} contextKey={model.contextKey} revision={model.draft.revision}/></>}{dirty&&<p className="text-xs text-muted-foreground">Сохраните изменения перед подтверждением источников или итогового файла.</p>}</div>;
      default: return null;
    }
  };

  const steps = QUIZ_STEPS;

  return (
    <>
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Анкета для отчёта о самообследовании
          </DialogTitle>
          <DialogDescription>
            Шаг {quiz.currentStep} из {steps.length}: {steps[quiz.currentStep - 1].description}
          </DialogDescription>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">Период: 01.01.{year}–31.12.{year}. Ориентир размещения за этот год: 20.04.{year+1}. Применимость проверяет центр.</p>
        {(model.error||localError)&&<p role="alert" className="text-sm text-destructive">{model.error||localError}</p>}
        <div className="flex gap-2 flex-wrap"><Button variant="outline" disabled={blocked||isSubmitting} onClick={save}>{model.saving?'Сохранение...':model.uncertain?'Повторить то же сохранение':'Сохранить черновик'}</Button><Button variant="ghost" disabled={model.saving||isSubmitting} onClick={reset}>Загрузить сохранённый / сбросить правки</Button><span className="text-xs self-center text-muted-foreground">{model.draft?'Версия '+model.draft.revision+' · '+(dirty?'Есть несохранённые изменения':'Сохранено'):model.loading?'Загрузка...':model.loaded?'Черновик ещё не сохранён':'Сохранённые данные пока не подтверждены'}</span></div>
        {/* Progress */}
        <div className="space-y-3">
          <Progress value={quiz.progress} className="h-1.5" />
          <div className="flex justify-between">
            {steps.map((step) => {
              const isActive = step.id === quiz.currentStep;
              const isCompleted = step.id < quiz.currentStep;
              return (
                <button
                  key={step.id}
                  onClick={() => quiz.setCurrentStep(step.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 text-xs transition-colors",
                    isActive ? "text-primary" : isCompleted ? "text-muted-foreground" : "text-muted-foreground/50"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                    isActive ? "bg-primary text-primary-foreground" :
                    isCompleted ? "bg-primary/20 text-primary" : "bg-secondary"
                  )}>
                    <span className="text-xs font-medium">{step.id}</span>
                  </div>
                  <span className="hidden sm:block">{step.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-4 min-h-[300px]">
          {model.current&&!model.loading&&!model.denied?<fieldset disabled={blocked} className="min-w-0">{renderStep()}</fieldset>:<p className="text-sm text-muted-foreground">{model.denied?"Сведения этого центра недоступны.":"Загрузка сохранённого черновика..."}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-between pt-4 border-t border-border">
          <Button variant="outline" onClick={quiz.handleBack} disabled={quiz.currentStep === 1} className="rounded-xl gap-2">
            <ChevronLeft className="w-4 h-4" />
            Назад
          </Button>

          {quiz.currentStep < steps.length ? (
            <Button onClick={quiz.handleNext} className="btn-gradient rounded-xl gap-2">
              Далее
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={order} disabled={isSubmitting||blocked} className="btn-gradient rounded-xl gap-2">
              {isSubmitting ? (
                <><SigmaSpinner size="sm" />Отправка...</>
              ) : (
                <><Sparkles className="w-4 h-4" />Заказать за {selfExaminationPriceLabel()}</>
              )}
            </Button>
          )}
        </div>
</>
  );
}
