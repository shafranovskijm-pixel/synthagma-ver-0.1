import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { useEducationIssuanceScope } from "@/hooks/useEducationIssuance";
import { issuanceScopeCurrent, readEducationIssuance } from "@/lib/educationIssuance/client";
import { WithdrawalDialog } from "./education-issuance/WithdrawalDialog";

interface Props {
  enrollmentId: string; organizationId: string; groupId?: string | null; courseTitle: string;
  studentName?: string; progress?: number; timeSpent?: number; status?: string | null;
  completedAt?: string | null; hasTestAttempts?: boolean; onCancelled: () => void;
}

/** Retained withdrawal is explicit: old technical progress and official documents are never removed. */
export function CancelCourseAssignmentButton(props: Props) {
  const { can, loading } = useStaffPermissions();
  const [open, setOpen] = useState(false), [withdrawn, setWithdrawn] = useState(false);
  const capture = useEducationIssuanceScope(props.organizationId, props.groupId);
  const epoch = useRef(0);
  useEffect(() => {
    const run = ++epoch.current; setWithdrawn(false);
    if (loading || !can("students.write")) return;
    let scope: ReturnType<typeof capture>;
    try { scope = capture(); } catch { return; }
    void readEducationIssuance(scope, { kind: "withdrawal", enrollment_id: props.enrollmentId })
      .then(result => { if (run === epoch.current && issuanceScopeCurrent(scope) && result.kind === "withdrawal") setWithdrawn(result.state.state === "withdrawn"); })
      .catch(() => { /* Dialog will show the current server error; no optimistic withdrawal. */ });
    return () => { ++epoch.current; };
  }, [capture, props.enrollmentId, loading, can]);
  if (loading || !can("students.write") || !props.enrollmentId || !props.organizationId) return null;
  if (withdrawn) return <Badge variant="secondary">Обучение прекращено · история сохранена</Badge>;
  return <>
    <Button type="button" size="sm" variant="outline" className="rounded-lg gap-2" onClick={() => setOpen(true)}>
      <X className="w-4 h-4" />Прекратить обучение
    </Button>
    <WithdrawalDialog open={open} onOpenChange={setOpen} organizationId={props.organizationId} groupId={props.groupId}
      enrollmentIds={[props.enrollmentId]} labels={[props.studentName ? props.studentName + " · " + props.courseTitle : props.courseTitle]}
      onWithdrawn={() => { setWithdrawn(true); props.onCancelled(); }} />
  </>;
}
