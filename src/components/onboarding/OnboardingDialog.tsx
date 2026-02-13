import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChevronRight, ChevronLeft, X } from "lucide-react";
import { OnboardingHighlight } from "./OnboardingHighlight";
import type { OnboardingStep } from "@/constants/onboardingSteps";

interface OnboardingDialogProps {
  open: boolean;
  onClose: () => void;
  steps: OnboardingStep[];
  onNavigateToTab?: (tab: string) => void;
}

export function OnboardingDialog({ open, onClose, steps, onNavigateToTab }: OnboardingDialogProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(0);

  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;
  const progressValue = ((currentStep + 1) / steps.length) * 100;

  const goNext = () => {
    if (isLast) {
      onClose();
      return;
    }
    setDirection(1);
    setCurrentStep(prev => prev + 1);
  };

  const goPrev = () => {
    if (isFirst) return;
    setDirection(-1);
    setCurrentStep(prev => prev - 1);
  };

  const handleGoToTab = () => {
    if (step.tab && onNavigateToTab) {
      onNavigateToTab(step.tab);
      onClose();
    }
  };

  const Icon = step?.icon;

  return (
    <>
    <OnboardingHighlight selector={step?.highlightSelector} />
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0 border-primary/20">
        {/* Progress bar */}
        <div className="px-6 pt-5">
          <Progress value={progressValue} className="h-1.5 bg-muted" />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-muted-foreground">
              Шаг {currentStep + 1} из {steps.length}
            </span>
            <button
              onClick={onClose}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Пропустить
            </button>
          </div>
        </div>

        {/* Step content */}
        <div className="px-6 py-6 min-h-[240px] flex items-center">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step.id}
              custom={direction}
              initial={{ opacity: 0, x: direction >= 0 ? 40 : -40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction >= 0 ? -40 : 40 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="w-full text-center"
            >
              {Icon && (
                <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <Icon className="w-7 h-7 text-primary" />
                </div>
              )}
              <h3 className="font-display text-xl font-bold mb-3">{step.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{step.description}</p>
              
              {step.tab && onNavigateToTab && (
                <Button
                  variant="link"
                  size="sm"
                  onClick={handleGoToTab}
                  className="mt-3 text-primary gap-1"
                >
                  Перейти к разделу
                  <ChevronRight className="w-3 h-3" />
                </Button>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="px-6 pb-5 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={goPrev}
            disabled={isFirst}
            className="gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            Назад
          </Button>
          <Button
            size="sm"
            onClick={goNext}
            className="gap-1 btn-gradient"
          >
            {isLast ? "Завершить" : "Далее"}
            {!isLast && <ChevronRight className="w-4 h-4" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
