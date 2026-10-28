import type { PublicationReviewContext } from "@/lib/platformCoursePublication";
import type { CourseFileReferenceKind } from "@/lib/courseExactFileDelivery";
export const PLATFORM_SOURCE_FILE_ORG = "4ac2c05a-d8b5-4e72-ba31-f2c743091d95";
export const PLATFORM_SOURCE_FILE_SCOPE = "selected_platform_proposal_moderator_only_not_learner_acceptance";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/;
const MAX_BYTES = 8 * 1024 * 1024;
export interface SelectedPlatformFileReference {
  readonly actorId: string; readonly marketplaceId: string; readonly courseId: string;
  readonly proposalId: string; readonly proposalEditionSha256: string;
  readonly referenceKind: CourseFileReferenceKind; readonly referenceId: string;
}
export interface SelectedPlatformFileReceipt {
  readonly receipt_id: string; readonly captured_edition_id: string; readonly source_org_version_id: string | null;
  readonly file_bytes_sha256: string; readonly byte_length: number;
}
interface ProposalFileBase {
  readonly schema_version: 1; readonly actor_id: string; readonly organization_id: typeof PLATFORM_SOURCE_FILE_ORG;
  readonly marketplace_id: string; readonly course_id: string; readonly proposal_id: string;
  readonly proposal_edition_sha256: string; readonly reference_kind: CourseFileReferenceKind; readonly reference_id: string;
  readonly delivery_scope: typeof PLATFORM_SOURCE_FILE_SCOPE;
}
export type SelectedPlatformFileContext =
  | (ProposalFileBase & { readonly state: "held"; readonly receipt: null })
  | (ProposalFileBase & { readonly state: "bytes_sealed"; readonly receipt: Readonly<SelectedPlatformFileReceipt> });
export type SealedPlatformFileContext = Extract<SelectedPlatformFileContext, { state: "bytes_sealed" }>;
export interface ExactPlatformCourseFileLease {
  readonly url: string; readonly mime: string; readonly previewKind: "pdf" | "image";
  readonly context: Readonly<SealedPlatformFileContext>; release(): void;
}
export class ExactPlatformCourseFileUnavailable extends Error {
  readonly code = "PLATFORM_SOURCE_FILE_UNAVAILABLE";
  constructor() { super("Точная редакция файла недоступна"); this.name = "ExactPlatformCourseFileUnavailable"; }
}
function deny(): never { throw new ExactPlatformCourseFileUnavailable(); }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, names: readonly string[]) => Object.keys(value).length === names.length && names.every(name => Object.prototype.hasOwnProperty.call(value, name));
export function checkSelectedPlatformFile(input: SelectedPlatformFileReference): Readonly<SelectedPlatformFileReference> {
  if (!record(input) || [input.actorId,input.marketplaceId,input.courseId,input.proposalId,input.referenceId].some(value => typeof value !== "string" || !UUID.test(value))
    || typeof input.proposalEditionSha256 !== "string" || !SHA.test(input.proposalEditionSha256)
    || !["course_document","lesson_attachment"].includes(input.referenceKind)) deny();
  return Object.freeze({ actorId:input.actorId, marketplaceId:input.marketplaceId, courseId:input.courseId, proposalId:input.proposalId,
    proposalEditionSha256:input.proposalEditionSha256, referenceKind:input.referenceKind, referenceId:input.referenceId });
}
/** Select exactly one member of this displayed saved proposal, never a current
 * reference, a receipt from a dossier claim, the first row or a latest lookup. */
export function selectedPlatformFileFromReview(context: PublicationReviewContext, kind: CourseFileReferenceKind, referenceId: string): Readonly<SelectedPlatformFileReference> {
  const p = context.proposal;
  if (!p || p.marketplaceId !== context.marketplaceId || p.courseId !== context.courseId
    || p.source.marketplaceId !== context.marketplaceId || p.source.courseId !== context.courseId
    || p.source.fileBindings.filter(ref => ref.kind === kind && ref.referenceId === referenceId).length !== 1) deny();
  return checkSelectedPlatformFile({ actorId:context.actorId, marketplaceId:context.marketplaceId, courseId:context.courseId,
    proposalId:p.id, proposalEditionSha256:p.editionSha256, referenceKind:kind, referenceId });
}
export function parseSelectedPlatformFileContext(raw: unknown, input: SelectedPlatformFileReference): Readonly<SelectedPlatformFileContext> {
  const s = checkSelectedPlatformFile(input);
  if (!record(raw) || !keys(raw,["schema_version","actor_id","organization_id","marketplace_id","course_id","proposal_id","proposal_edition_sha256","reference_kind","reference_id","state","receipt","delivery_scope"])
    || raw.schema_version !== 1 || raw.actor_id !== s.actorId || raw.organization_id !== PLATFORM_SOURCE_FILE_ORG
    || raw.marketplace_id !== s.marketplaceId || raw.course_id !== s.courseId || raw.proposal_id !== s.proposalId
    || raw.proposal_edition_sha256 !== s.proposalEditionSha256 || raw.reference_kind !== s.referenceKind || raw.reference_id !== s.referenceId
    || raw.delivery_scope !== PLATFORM_SOURCE_FILE_SCOPE) deny();
  if (raw.state === "held" && raw.receipt === null) return Object.freeze({ ...raw }) as unknown as SelectedPlatformFileContext;
  const r = raw.receipt;
  if (raw.state !== "bytes_sealed" || !record(r) || !keys(r,["receipt_id","captured_edition_id","source_org_version_id","file_bytes_sha256","byte_length"])
    || typeof r.receipt_id !== "string" || !UUID.test(r.receipt_id) || typeof r.captured_edition_id !== "string" || !UUID.test(r.captured_edition_id)
    || (r.source_org_version_id !== null && (typeof r.source_org_version_id !== "string" || !UUID.test(r.source_org_version_id)))
    || typeof r.file_bytes_sha256 !== "string" || !SHA.test(r.file_bytes_sha256)
    || typeof r.byte_length !== "number" || !Number.isSafeInteger(r.byte_length) || r.byte_length <= 0 || r.byte_length > MAX_BYTES) deny();
  return Object.freeze({ ...raw, receipt:Object.freeze({ ...r }) }) as unknown as SelectedPlatformFileContext;
}
export interface SelectedPlatformFilePort {
  context(args: { p_marketplace_id:string; p_proposal_id:string; p_expected_proposal_edition_sha256:string; p_reference_kind:CourseFileReferenceKind; p_reference_id:string }, signal:AbortSignal): Promise<{ data:unknown; error:unknown }>;
  bytes(receiptId:string, signal:AbortSignal): Promise<{ data:unknown; error:unknown; response?:Response }>;
}
async function bounded<T>(operation:(signal:AbortSignal)=>Promise<T>, cancellation:AbortSignal, timeout:number):Promise<T> {
  const abort = new AbortController(); let reject!: (error:unknown)=>void;
  const interrupted = new Promise<never>((_yes,no)=>{reject=no;});
  const cancel = () => abort.abort(cancellation.reason);
  const fail = () => reject(abort.signal.reason ?? new ExactPlatformCourseFileUnavailable());
  cancellation.addEventListener("abort",cancel,{once:true}); abort.signal.addEventListener("abort",fail,{once:true});
  const timer = setTimeout(()=>abort.abort(new ExactPlatformCourseFileUnavailable()),timeout);
  try { cancellation.throwIfAborted(); const value = await Promise.race([operation(abort.signal),interrupted]); cancellation.throwIfAborted(); abort.signal.throwIfAborted(); return value; }
  finally { clearTimeout(timer); cancellation.removeEventListener("abort",cancel); abort.signal.removeEventListener("abort",fail); abort.abort(); }
}
function previewMedia(bytes:Uint8Array):{mime:string;previewKind:"pdf"|"image"}|null {
  const prefix = (...values:number[])=>values.every((value,i)=>bytes[i]===value);
  if (prefix(37,80,68,70,45)) return {mime:"application/pdf",previewKind:"pdf"};
  if (prefix(137,80,78,71,13,10,26,10)) return {mime:"image/png",previewKind:"image"};
  if (prefix(255,216,255)) return {mime:"image/jpeg",previewKind:"image"};
  if (prefix(71,73,70,56,55,97)||prefix(71,73,70,56,57,97)) return {mime:"image/gif",previewKind:"image"};
  if (bytes.length>=12&&prefix(82,73,70,70)&&[87,69,66,80].every((value,i)=>bytes[i+8]===value)) return {mime:"image/webp",previewKind:"image"};
  return null; // No SVG/HTML, Office viewer, live URL or download capability.
}
export function createExactPlatformCourseFileGateway(port:SelectedPlatformFilePort) {
  return Object.freeze({
    async context(input:SelectedPlatformFileReference, cancellation:AbortSignal):Promise<Readonly<SelectedPlatformFileContext>> {
      const s = checkSelectedPlatformFile(input);
      const result = await bounded(signal=>port.context({p_marketplace_id:s.marketplaceId,p_proposal_id:s.proposalId,p_expected_proposal_edition_sha256:s.proposalEditionSha256,p_reference_kind:s.referenceKind,p_reference_id:s.referenceId},signal),cancellation,20_000);
      if (!record(result)||result.error) deny(); return parseSelectedPlatformFileContext(result.data,s);
    },
    async bytes(input:SelectedPlatformFileReference, context:SealedPlatformFileContext, cancellation:AbortSignal):Promise<ExactPlatformCourseFileLease> {
      const s=checkSelectedPlatformFile(input),c=parseSelectedPlatformFileContext(context,s); if(c.state!=="bytes_sealed") deny();
      const r=c.receipt;
      const verified=await bounded(async signal=>{
        const result=await port.bytes(r.receipt_id,signal); signal.throwIfAborted();
        if(!record(result)||result.error||!(result.data instanceof Blob)||!result.response||result.response.status!==200||result.response.redirected
          || result.response.headers.get("X-File-Receipt-Id")!==r.receipt_id||result.response.headers.get("X-File-SHA256")!==r.file_bytes_sha256
          || result.response.headers.get("Content-Length")!==String(r.byte_length)
          || result.response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase()!=="application/octet-stream"
          || result.data.size!==r.byte_length||result.data.size>MAX_BYTES) deny();
        const bytes=new Uint8Array(await result.data.arrayBuffer()); signal.throwIfAborted();
        if(bytes.byteLength!==r.byte_length) deny();
        const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)); signal.throwIfAborted();
        if(Array.from(digest,b=>b.toString(16).padStart(2,"0")).join("")!==r.file_bytes_sha256) deny();
        const media=previewMedia(bytes); if(!media) deny(); return {bytes,media};
      },cancellation,45_000);
      cancellation.throwIfAborted(); const {bytes,media}=verified;
      const url=URL.createObjectURL(new Blob([bytes],{type:media.mime})); let released=false;
      const release=()=>{if(!released){released=true;URL.revokeObjectURL(url);cancellation.removeEventListener("abort",release);}};
      cancellation.addEventListener("abort",release,{once:true});if(cancellation.aborted){release();cancellation.throwIfAborted();}
      return Object.freeze({url,...media,context:c,release});
    },
  });
}
