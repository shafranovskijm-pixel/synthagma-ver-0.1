import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { HelpTip } from "@/constants/onboardingSteps";

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-primary" />
            Подсказки
          </DialogTitle>
          <DialogDescription>Полезные советы по текущему разделу</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2 max-h-[60vh] overflow-y-auto">
          {tips.map((tip, i) => (
            <div key={i} className="p-3 rounded-xl bg-secondary/50 border border-border/50">
              <h4 className="font-medium text-sm mb-1">{tip.title}</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">{tip.description}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
