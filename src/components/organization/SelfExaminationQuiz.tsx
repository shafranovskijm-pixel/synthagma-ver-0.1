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

interface SelfExaminationQuizProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: QuizData) => void;
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

export function SelfExaminationQuiz({ open, onOpenChange, onSubmit, isSubmitting, organizationData }: SelfExaminationQuizProps) {
  const quiz = useSelfExaminationQuiz(organizationData);

  const renderStep = () => {
    switch (quiz.currentStep) {
      case 1: return <QuizStepOrganization data={quiz.data} updateData={quiz.updateData} isLoadingInn={quiz.isLoadingInn} innLoaded={quiz.innLoaded} onInnLoad={quiz.loadCompanyByInn} setInnLoaded={() => {}} />;
      case 2: return <QuizStepLicense data={quiz.data} updateData={quiz.updateData} toggleProgramType={quiz.toggleProgramType} addCommissionMember={quiz.addCommissionMember} removeCommissionMember={quiz.removeCommissionMember} updateCommissionMember={quiz.updateCommissionMember} />;
      case 3: return <QuizStepManagement data={quiz.data} updateData={quiz.updateData} />;
      case 4: return <QuizStepEducation data={quiz.data} updateData={quiz.updateData} addProgram={quiz.addProgram} removeProgram={quiz.removeProgram} updateProgram={quiz.updateProgram} />;
      case 5: return <QuizStepQuality data={quiz.data} updateData={quiz.updateData} toggleControlType={quiz.toggleControlType} />;
      case 6: return <QuizStepStaff data={quiz.data} addStaffMember={quiz.addStaffMember} removeStaffMember={quiz.removeStaffMember} updateStaffMember={quiz.updateStaffMember} />;
      case 7: return <QuizStepInfrastructure data={quiz.data} updateData={quiz.updateData} />;
      case 8: return <QuizStepSummary data={quiz.data} updateData={quiz.updateData} />;
      default: return null;
    }
  };

  const steps = QUIZ_STEPS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Анкета для отчёта о самообследовании
          </DialogTitle>
          <DialogDescription>
            Шаг {quiz.currentStep} из {steps.length}: {steps[quiz.currentStep - 1].description}
          </DialogDescription>
        </DialogHeader>

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
          {renderStep()}
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
            <Button onClick={() => onSubmit(quiz.data)} disabled={isSubmitting} className="btn-gradient rounded-xl gap-2">
              {isSubmitting ? (
                <><SigmaSpinner size="sm" />Отправка...</>
              ) : (
                <><Sparkles className="w-4 h-4" />Заказать за 3 500 ₽</>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
