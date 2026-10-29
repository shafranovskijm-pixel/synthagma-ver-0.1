import type { ExactPlatformCourseFileLease } from "@/lib/exactPlatformCourseFile";
import { VerifiedPdfCanvas } from "@/components/course-learning/VerifiedPdfCanvas";

/** Preserve the selected moderator lease API; rendering receives verified memory only. */
export function VerifiedSelectedPdfCanvas({lease,title}:{lease:ExactPlatformCourseFileLease;title:string}) {
  return <VerifiedPdfCanvas lease={lease} title={title} />;
}
