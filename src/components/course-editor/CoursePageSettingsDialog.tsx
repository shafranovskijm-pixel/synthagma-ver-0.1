import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { CoursePageSettingsContent } from "./CoursePageSettingsContent";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseTitle: string;
}

export function CoursePageSettingsDialog({ open, onOpenChange, courseId, courseTitle }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Настройки страницы курса</DialogTitle>
        </DialogHeader>
        {open && <CoursePageSettingsContent courseId={courseId} courseTitle={courseTitle} />}
      </DialogContent>
    </Dialog>
  );
}
