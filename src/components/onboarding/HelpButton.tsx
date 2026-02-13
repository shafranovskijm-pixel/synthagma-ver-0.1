import { useState } from "react";
import { HelpCircle, Lightbulb, MessageSquare } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import type { HelpTip } from "@/constants/onboardingSteps";
import { SupportRequestForm } from "./SupportRequestForm";

interface HelpButtonProps {
  tips: HelpTip[];
  className?: string;
  variant?: "sidebar" | "inline";
}

export function HelpButton({ tips, className = "", variant = "sidebar" }: HelpButtonProps) {
  const [open, setOpen] = useState(false);

  if (variant === "sidebar") {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className={`w-full flex items-center gap-3 px-4 py-2 rounded-xl text-sm transition-colors text-muted-foreground/70 hover:bg-secondary/50 hover:text-muted-foreground ${className}`}
        >
          <HelpCircle className="w-4 h-4" />
          Помощь
        </button>
        <HelpDialog open={open} onClose={() => setOpen(false)} tips={tips} />
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors text-muted-foreground hover:bg-secondary hover:text-foreground ${className}`}
      >
        <HelpCircle className="w-4 h-4" />
        Помощь
      </button>
      <HelpDialog open={open} onClose={() => setOpen(false)} tips={tips} />
    </>
  );
}

function HelpDialog({ open, onClose, tips }: { open: boolean; onClose: () => void; tips: HelpTip[] }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-primary" />
            Помощь
          </DialogTitle>
          <DialogDescription>Полезные советы и поддержка</DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-y-auto space-y-4 mt-1">
          {/* Tips accordion */}
          {tips.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="w-4 h-4 text-primary" />
                <h4 className="font-medium text-sm">Подсказки</h4>
              </div>
              <Accordion type="single" collapsible className="w-full">
                {tips.map((tip, i) => (
                  <AccordionItem key={i} value={`tip-${i}`} className="border-border/50">
                    <AccordionTrigger className="text-sm py-3 hover:no-underline">
                      {tip.title}
                    </AccordionTrigger>
                    <AccordionContent>
                      <p className="text-xs text-muted-foreground leading-relaxed">{tip.description}</p>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}

          <Separator />

          {/* Support form */}
          <div className="rounded-xl bg-secondary/30 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              <h4 className="font-medium text-sm">Сообщить о проблеме</h4>
            </div>
            <SupportRequestForm />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
