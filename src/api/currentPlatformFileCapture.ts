import { supabase } from "@/integrations/supabase/client";
import { PLATFORM_REVIEW_ORG_ID } from "@/lib/platformCoursePublication";
import { canonicalCurrentCourseFileKey, createCurrentPlatformFileCapture, currentCourseFileMetadataFingerprint,
  CurrentPlatformFileCaptureHeld, type CurrentPlatformFileCapturePort, type CurrentPlatformFileSelection } from "@/lib/currentPlatformFileCapture";

type Result = { data: unknown; error: unknown };
type Abortable = { abortSignal(signal: AbortSignal): PromiseLike<Result> };
type CaptureRPC = {
  rpc(name: "begin_platform_course_current_file_capture", args: Parameters<CurrentPlatformFileCapturePort["begin"]>[0]): Abortable;
  rpc(name: "read_platform_course_file_receipt", args: { p_receipt_id: string }): Abortable;
};
const rpc = supabase as unknown as CaptureRPC;
function held(): never { throw new CurrentPlatformFileCaptureHeld("needs_version"); }
async function probe(s: CurrentPlatformFileSelection, signal: AbortSignal) {
  signal.throwIfAborted();
  const course = await supabase.from("courses").select("id,organization_id").eq("id", s.courseId)
    .eq("organization_id", PLATFORM_REVIEW_ORG_ID).abortSignal(signal).maybeSingle();
  signal.throwIfAborted();
  if (course.error || !course.data || course.data.id !== s.courseId || course.data.organization_id !== PLATFORM_REVIEW_ORG_ID) held();
  let fingerprint: string;
  if (s.referenceKind === "course_document") {
    const row = await supabase.from("course_documents").select("id,course_id,file_url,library_document_id")
      .eq("id", s.referenceId).eq("course_id", s.courseId).abortSignal(signal).maybeSingle();
    signal.throwIfAborted();
    if (row.error || !row.data || row.data.id !== s.referenceId || row.data.course_id !== s.courseId
      || row.data.library_document_id !== null) held();
    const key = canonicalCurrentCourseFileKey(row.data.file_url, s.courseId);
    fingerprint = await currentCourseFileMetadataFingerprint([s.courseId, s.referenceKind, s.referenceId, null, key]);
  } else {
    const row = await supabase.from("lesson_attachments").select("id,lesson_id,file_url")
      .eq("id", s.referenceId).abortSignal(signal).maybeSingle();
    signal.throwIfAborted();
    if (row.error || !row.data || row.data.id !== s.referenceId) held();
    const lesson = await supabase.from("lessons").select("id,course_id").eq("id", row.data.lesson_id)
      .eq("course_id", s.courseId).abortSignal(signal).maybeSingle();
    signal.throwIfAborted();
    if (lesson.error || !lesson.data || lesson.data.id !== row.data.lesson_id || lesson.data.course_id !== s.courseId) held();
    const key = canonicalCurrentCourseFileKey(row.data.file_url, s.courseId);
    fingerprint = await currentCourseFileMetadataFingerprint([s.courseId, s.referenceKind, s.referenceId, lesson.data.id, key]);
  }
  signal.throwIfAborted();
  // Only a digest leaves the local RLS metadata probe. Never open, forward,
  // display or log file_url, a storage key or a signed-query token.
  return { fingerprint };
}
const port: CurrentPlatformFileCapturePort = {
  async context(s, signal) {
    return await supabase.rpc("read_platform_course_publication_review_context", {
      p_marketplace_id: s.marketplaceId, p_proposal_id: null, p_expected_edition_sha256: null,
      p_history_before_sequence: null, p_confirm_event_id: null,
    }).abortSignal(signal);
  },
  probe,
  async begin(args, signal) { return await rpc.rpc("begin_platform_course_current_file_capture", args).abortSignal(signal); },
  async capture(intentId, signal) {
    return await supabase.functions.invoke<unknown>("platform-course-file/capture", {
      body: { intent_id: intentId }, signal, timeout: 45_000,
    });
  },
  async receipt(receiptId, signal) { return await rpc.rpc("read_platform_course_file_receipt", { p_receipt_id: receiptId }).abortSignal(signal); },
};
export const currentPlatformFileCapture = createCurrentPlatformFileCapture(port);
