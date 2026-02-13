import { useState } from "react";
import { HelpCircle, MessageSquare } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
        <HelpDialog open={open} onClose={() => setOpen(false)} />
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
      <HelpDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            Сообщить о проблеме
          </DialogTitle>
          <DialogDescription>Опишите проблему — мы получим уведомление и свяжемся с вами</DialogDescription>
        </DialogHeader>
        <SupportRequestForm />
      </DialogContent>
    </Dialog>
  );
}
