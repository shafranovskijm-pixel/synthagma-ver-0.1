import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import HelpCenter from "@/pages/HelpCenter";

interface HelpCenterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HelpCenterDialog({ open, onOpenChange }: HelpCenterDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto p-0 border-none rounded-2xl [&>button]:z-50 [&>button]:bg-background/80 [&>button]:backdrop-blur-sm [&>button]:rounded-full [&>button]:w-8 [&>button]:h-8 [&>button]:top-3 [&>button]:right-3">
        <HelpCenter isModal />
      </DialogContent>
    </Dialog>
  );
}

export function useHelpCenterDialog() {
  const [open, setOpen] = useState(false);
  return { open, setOpen, openHelp: () => setOpen(true) };
}
