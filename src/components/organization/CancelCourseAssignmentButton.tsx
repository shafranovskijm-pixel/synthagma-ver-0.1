import { useRef, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { cancelCourseAssignment, courseAssignmentCancellationError } from "@/api/courseAssignmentCancellation";

interface Props {
  enrollmentId: string;
  organizationId: string;
  courseTitle: string;
  studentName?: string;
  progress?: number;
  timeSpent?: number;
  status?: string | null;
  completedAt?: string | null;
  hasTestAttempts?: boolean;
  onCancelled: () => void;
}

export function CancelCourseAssignmentButton(props: Props) {
  const { can, loading } = useStaffPermissions();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const hasHistory = (props.progress || 0) > 0 || (props.timeSpent || 0) > 0 ||
    props.status === "completed" || !!props.completedAt || !!props.hasTestAttempts;
  if (loading || !can("students.write") || !props.enrollmentId || !props.organizationId) return null;

  const handleConfirm = async () => {
    if (hasHistory || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await cancelCourseAssignment({ enrollmentId: props.enrollmentId, organizationId: props.organizationId });
    } catch (cause) {
      setError(courseAssignmentCancellationError(cause));
      return;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
    setOpen(false);
    toast.success("Назначение курса отменено");
    props.onCancelled();
  };

  return <>
    <Button type="button" size="sm" variant="outline" className="rounded-lg gap-2" onClick={() => { setError(null); setOpen(true); }}>
      <X className="w-4 h-4" />Отменить назначение
    </Button>
    <Dialog open={open} onOpenChange={(value) => { if (!inFlight.current) setOpen(value); }}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Отменить назначение курса?</DialogTitle>
          <DialogDescription>
            Курс «{props.courseTitle}»{props.studentName ? ` у ученика ${props.studentName}` : ""} будет снят, если обучение ещё не начато и нет связанных документов.
          </DialogDescription>
        </DialogHeader>
        {hasHistory && <p role="alert" className="text-sm text-muted-foreground">Обучение уже начато или есть результаты. Отменить такое назначение нельзя: история обучения должна сохраниться.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Закрыть</Button>
          <Button type="button" variant="destructive" disabled={busy || hasHistory} onClick={handleConfirm}>
            {busy ? "Отмена назначения..." : "Подтвердить отмену"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
