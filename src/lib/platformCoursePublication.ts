/** Own-platform template review only. A structural pass is not publication. */
export const PLATFORM_REVIEW_ORG_ID = "4ac2c05a-d8b5-4e72-ba31-f2c743091d95";
export const TEMPLATE_REVIEW_SCOPE = "platform_template_only_not_centre_or_qualification";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/;

export interface PublicationTarget { marketplaceId: string; courseId: string }
/** Display/filter hint only; every server action rechecks the current owner. */
export function ownPlatformPublicationTarget(value: unknown): PublicationTarget | null {
  try {
    const row = object(value), course = object(row.course);
    const marketplaceId = uuid(row.id), courseId = uuid(row.course_id);
    if (uuid(course.id) !== courseId || course.organization_id !== PLATFORM_REVIEW_ORG_ID || (row.organization_id !== null && row.organization_id !== PLATFORM_REVIEW_ORG_ID)) return null;
    return { marketplaceId, courseId };
  } catch { return null; }
}
export type ReadinessState = "legacy_unchanged" | "out_of_scope" | "review_missing" | "review_incomplete" | "needs_revision" | "review_stale" | "review_due" | "eligible";
export interface PublicationReadiness extends PublicationTarget {
  state: ReadinessState;
  editionSha256: string | null;
  proposalId: string | null;
  reviewId: string | null;
  isValidated: boolean | null;
  blockers: string[];
}
export type ReviewDecision = "accepted_for_template_publication" | "needs_revision";
export const PASSPORT_FIELDS = ["purpose", "audience", "entry_requirements", "outcomes", "teaching_plan", "workload", "assessment_criteria", "applicability"] as const;
export const DOSSIER_SECTIONS = ["source_review", "subject_keys", "practices", "rights", "document_links"] as const;
export type PassportField = typeof PASSPORT_FIELDS[number];
export type DossierSectionName = typeof DOSSIER_SECTIONS[number];
export type DossierReference = { reference: string; edition: string; checked_at: string };
export type DossierSection = { state: "unconfirmed" | "confirmed" | "not_applicable"; rationale: string; evidence: DossierReference[] };
export type PublicationDossier = { schema_version: 1; passport: Record<PassportField, string> } & Record<DossierSectionName, DossierSection>;
export function emptyPublicationDossier(): PublicationDossier {
  return {
    schema_version: 1,
    passport: { purpose: "", audience: "", entry_requirements: "", outcomes: "", teaching_plan: "", workload: "", assessment_criteria: "", applicability: "" },
    source_review: { state: "unconfirmed", rationale: "", evidence: [] },
    subject_keys: { state: "unconfirmed", rationale: "", evidence: [] },
    practices: { state: "unconfirmed", rationale: "", evidence: [] },
    rights: { state: "unconfirmed", rationale: "", evidence: [] },
    document_links: { state: "unconfirmed", rationale: "", evidence: [] },
  };
}

export interface SourceContext extends PublicationTarget {
  modules: { id: string }[];
  lessons: { id: string; moduleId: string | null; type: string }[];
  fileBindings: { kind: "course_document" | "lesson_attachment"; referenceId: string; state: "unconfirmed" }[];
}
export interface ReviewEvent {
  id: string; sequence: string; proposalId: string;
  kind: "submitted" | "review_decided" | "publication_recorded";
  editionSha256: string; recordedAt: string; actorId: string; requestId: string;
  decision: ReviewDecision | null; notes: string | null; nextReviewAt: string | null; samePersonReview: boolean | null;
}
export interface PublicationProposal extends PublicationTarget {
  id: string; editionSha256: string; submittedAt: string; submittedBy: string; requestId: string;
  isCurrent: boolean;
  /** Exact immutable server payload. Unknown formats never enable review. */
  dossier: unknown;
  supportedDossier: PublicationDossier | null;
  source: SourceContext;
}

export interface CurrentReviewFileReceipt {
  receiptId: string; capturedEditionId: string; sourceOrgVersionId: string | null;
  fileBytesSha256: string; byteLength: number;
}
export interface CurrentReviewFileReference {
  kind: "course_document" | "lesson_attachment"; referenceId: string;
  state: "bytes_sealed" | "unconfirmed"; receipt: CurrentReviewFileReceipt | null;
}
export interface CurrentFileReviewContext extends PublicationTarget {
  actorId: string; proposalId: string; proposalEditionSha256: string;
  currentEditionSha256: string; scopeGeneration: string;
  state: "unconfirmed" | "no_file_reference_detected" | "sealed_current";
  referenceCount: number; references: CurrentReviewFileReference[];
}

export interface PublicationReviewContext extends PublicationTarget {
  actorId: string; currentEditionSha256: string; readiness: PublicationReadiness;
  proposal: PublicationProposal | null; currentSource: SourceContext;
  currentFileState: "unconfirmed" | "no_file_reference_detected" | "sealed_current";
  /** Present only after an explicit current proposal/edition server read; never a learner grant. */
  currentFileContext?: CurrentFileReviewContext | null;
  history: ReviewEvent[]; historyHasMore: boolean; historyNextBeforeSequence: string | null;
  confirmedEvent: ReviewEvent | null;
}
interface RpcResult { data: unknown; error: unknown }
export interface PublicationApiPort {
  readiness(args: { p_marketplace_id: string }): PromiseLike<RpcResult>;
  context(args: { p_marketplace_id: string; p_proposal_id: string | null; p_expected_edition_sha256: string | null; p_history_before_sequence: string | null; p_confirm_event_id: string | null }): PromiseLike<RpcResult>;
  submit(args: { p_marketplace_id: string; p_expected_edition_sha256: string; p_dossier: PublicationDossier; p_request_id: string }): PromiseLike<RpcResult>;
  review(args: { p_marketplace_id: string; p_proposal_id: string; p_expected_edition_sha256: string; p_decision: ReviewDecision; p_notes: string; p_next_review_at: string | null; p_request_id: string }): PromiseLike<RpcResult>;
  publish(args: { p_marketplace_id: string; p_proposal_id: string; p_expected_edition_sha256: string; p_request_id: string }): PromiseLike<RpcResult>;
}
export class PublicationError extends Error {
  constructor(public readonly code: "unavailable" | "invalid_response" | "stale" | "forbidden" | "blocked" | "unsupported_dossier" | "structural") { super(code); }
}
function invalid(): never { throw new PublicationError("invalid_response"); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): string { if (typeof value !== "string") return invalid(); return value; }
function uuid(value: unknown): string { const id = text(value); if (!UUID.test(id)) return invalid(); return id; }
function hash(value: unknown): string { const id = text(value); if (!SHA.test(id)) return invalid(); return id; }
function bool(value: unknown): boolean { if (typeof value !== "boolean") return invalid(); return value; }
function nullableId(value: unknown): string | null { return value == null ? null : uuid(value); }
function nullableText(value: unknown): string | null { return value == null ? null : text(value); }
function list(value: unknown): unknown[] { if (!Array.isArray(value)) return invalid(); return value; }
function date(value: unknown): string { const s = text(value); if (!Number.isFinite(Date.parse(s))) return invalid(); return s; }
function cursor(value: unknown): string {
  const s = text(value);
  if (!/^[1-9][0-9]{0,18}$/.test(s) || BigInt(s) > 9223372036854775807n) return invalid();
  return s;
}
function assertTarget(row: Record<string, unknown>, target: PublicationTarget) {
  if (uuid(row.marketplace_id) !== target.marketplaceId || uuid(row.course_id) !== target.courseId) invalid();
}
function onlyKeys(row: Record<string, unknown>, keys: readonly string[]) { return Object.keys(row).every(key => keys.includes(key)); }

/** Unsupported saved fields are not silently omitted before a human decision. */
export function supportedPublicationDossier(value: unknown): PublicationDossier | null {
  try {
    const row = object(value);
    if (row.schema_version !== 1 || !onlyKeys(row, ["schema_version", "passport", ...DOSSIER_SECTIONS])) return null;
    const passport = object(row.passport);
    if (!onlyKeys(passport, PASSPORT_FIELDS)) return null;
    const result = emptyPublicationDossier();
    for (const field of PASSPORT_FIELDS) result.passport[field] = text(passport[field]);
    for (const name of DOSSIER_SECTIONS) {
      const section = object(row[name]);
      if (!onlyKeys(section, ["state", "rationale", "evidence"])) return null;
      const state = section.state;
      if (state !== "unconfirmed" && state !== "confirmed" && state !== "not_applicable") return null;
      result[name] = { state, rationale: text(section.rationale), evidence: list(section.evidence).map(value => {
        const ref = object(value);
        if (!onlyKeys(ref, ["reference", "edition", "checked_at"])) return invalid();
        return { reference: text(ref.reference), edition: text(ref.edition), checked_at: text(ref.checked_at) };
      }) };
    }
    return result;
  } catch { return null; }
}
export function parsePublicationReadiness(value: unknown, target: PublicationTarget): PublicationReadiness {
  const row = object(value); assertTarget(row, target);
  const state = row.state;
  if (state !== "legacy_unchanged" && state !== "out_of_scope" && state !== "review_missing" && state !== "review_incomplete" && state !== "needs_revision" && state !== "review_stale" && state !== "review_due" && state !== "eligible") return invalid();
  const blockers = list(row.blockers).map(text);
  if (state === "out_of_scope") return { ...target, state, editionSha256: null, proposalId: null, reviewId: null, isValidated: null, blockers };
  const editionSha256 = hash(row.edition_sha256);
  const proposalId = nullableId(row.proposal_id), reviewId = nullableId(row.review_id);
  // The V3 stale early-return deliberately omits the saved listing flag.
  const isValidated = state === "review_stale" && row.is_validated == null ? null : bool(row.is_validated);
  if (state === "eligible" && (!proposalId || !reviewId || blockers.length || row.decision_scope !== TEMPLATE_REVIEW_SCOPE)) return invalid();
  return { ...target, state, editionSha256, proposalId, reviewId, isValidated, blockers };
}
function parseSource(value: unknown, target: PublicationTarget): SourceContext {
  const row = object(value); assertTarget(row, target);
  if (!onlyKeys(row, ["schema_version", "manifest_schema_version", "marketplace_id", "course_id", "modules", "lessons", "file_bindings_schema_version", "file_bindings", "historical_content_state", "file_authority_state"]) || row.manifest_schema_version !== 2 || row.schema_version !== 1 || row.file_bindings_schema_version !== 1 || row.historical_content_state !== "fingerprint_only_not_reconstructed_from_current_bank" || row.file_authority_state !== "v3_unconfirmed_until_separate_trusted_file_receipt_adapter") return invalid();
  return { ...target,
    modules: list(row.modules).map(v => ({ id: uuid(object(v).id) })),
    lessons: list(row.lessons).map(v => { const l = object(v); return { id: uuid(l.id), moduleId: nullableId(l.module_id), type: text(l.type) }; }),
    fileBindings: list(row.file_bindings).map(v => {
      const f = object(v), kind = f.reference_kind;
      // Never take a file seal from the editable dossier, a URL or an
      // unimplemented addon. A future trusted receipt contract needs review.
      if ((kind !== "course_document" && kind !== "lesson_attachment") || f.state !== "unconfirmed" || f.receipt_id !== null || f.exact_version_kind !== null || f.exact_version_id !== null || f.file_bytes_sha256 !== null || f.byte_length !== null) return invalid();
      return { kind, referenceId: uuid(f.reference_id), state: "unconfirmed" };
    }),
  };
}
function parseEvent(value: unknown): ReviewEvent {
  const row = object(value), kind = row.event_kind;
  if (kind !== "submitted" && kind !== "review_decided" && kind !== "publication_recorded") return invalid();
  const decision: ReviewDecision | null = row.decision == null ? null
    : row.decision === "accepted_for_template_publication" ? "accepted_for_template_publication"
    : row.decision === "needs_revision" ? "needs_revision" : invalid();
  if (kind === "review_decided" && !decision) return invalid();
  return { id: uuid(row.id), sequence: cursor(row.sequence), proposalId: uuid(row.proposal_id), kind,
    editionSha256: hash(row.edition_sha256), recordedAt: date(row.recorded_at), actorId: uuid(row.actor_id), requestId: uuid(row.request_id),
    decision: decision ?? null, notes: nullableText(row.notes), nextReviewAt: row.next_review_at == null ? null : date(row.next_review_at),
    samePersonReview: row.same_person_review == null ? null : bool(row.same_person_review) };
}

function parseCurrentFileContext(value: unknown, target: PublicationTarget, actorId: string,
  currentEdition: string, proposal: PublicationProposal | null, currentSource: SourceContext,
  currentFileState: PublicationReviewContext["currentFileState"]): CurrentFileReviewContext {
  const row = object(value); assertTarget(row, target);
  if (Object.keys(row).length !== 12 || !onlyKeys(row, ["schema_version", "actor_id", "organization_id", "marketplace_id", "course_id",
    "proposal_id", "proposal_edition_sha256", "current_edition_sha256", "scope_generation", "state", "reference_count", "references"])
    || row.schema_version !== 1 || uuid(row.actor_id) !== actorId || row.organization_id !== PLATFORM_REVIEW_ORG_ID
    || !proposal?.isCurrent || uuid(row.proposal_id) !== proposal.id || hash(row.proposal_edition_sha256) !== proposal.editionSha256
    || hash(row.current_edition_sha256) !== currentEdition || proposal.editionSha256 !== currentEdition || row.state !== currentFileState) return invalid();
  const state = row.state;
  if (state !== "unconfirmed" && state !== "no_file_reference_detected" && state !== "sealed_current") return invalid();
  const references = list(row.references).map<CurrentReviewFileReference>(value => {
    const ref = object(value), kind = ref.reference_kind;
    if (Object.keys(ref).length !== 4 || !onlyKeys(ref, ["reference_kind", "reference_id", "state", "receipt"])
      || (kind !== "course_document" && kind !== "lesson_attachment")) return invalid();
    const referenceId = uuid(ref.reference_id);
    if (ref.state === "unconfirmed" && ref.receipt === null) return { kind, referenceId, state: "unconfirmed", receipt: null };
    if (ref.state !== "bytes_sealed") return invalid();
    const receipt = object(ref.receipt), byteLength = receipt.byte_length;
    if (Object.keys(receipt).length !== 5 || !onlyKeys(receipt, ["receipt_id", "captured_edition_id", "source_org_version_id", "file_bytes_sha256", "byte_length"])
      || typeof byteLength !== "number" || !Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > 8388608) return invalid();
    return { kind, referenceId, state: "bytes_sealed", receipt: {
      receiptId: uuid(receipt.receipt_id), capturedEditionId: uuid(receipt.captured_edition_id),
      sourceOrgVersionId: nullableId(receipt.source_org_version_id), fileBytesSha256: hash(receipt.file_bytes_sha256),
      byteLength,
    } };
  });
  const pairs = references.map(ref => ref.kind + "/" + ref.referenceId).sort();
  const expected = currentSource.fileBindings.map(ref => ref.kind + "/" + ref.referenceId).sort();
  const selected = proposal.source.fileBindings.map(ref => ref.kind + "/" + ref.referenceId).sort();
  if (!Number.isSafeInteger(row.reference_count) || row.reference_count !== references.length
    || new Set(pairs).size !== pairs.length || JSON.stringify(pairs) !== JSON.stringify(expected)
    || JSON.stringify(pairs) !== JSON.stringify(selected)
    || (state === "sealed_current" && (!references.length || references.some(ref => ref.state !== "bytes_sealed" || !ref.receipt)))
    || (state === "no_file_reference_detected" && references.length !== 0)) return invalid();
  return { ...target, actorId, proposalId: proposal.id, proposalEditionSha256: proposal.editionSha256,
    currentEditionSha256: currentEdition, scopeGeneration: uuid(row.scope_generation), state,
    referenceCount: references.length, references };
}

export function parsePublicationContext(value: unknown, target: PublicationTarget, actorId: string): PublicationReviewContext {
  const row = object(value); assertTarget(row, target);
  if (row.schema_version !== 1 || row.organization_id !== PLATFORM_REVIEW_ORG_ID || uuid(row.actor_id) !== actorId || row.decision_scope !== TEMPLATE_REVIEW_SCOPE) return invalid();
  const currentEditionSha256 = hash(row.current_edition_sha256), readiness = parsePublicationReadiness(row.readiness, target);
  if (readiness.state === "out_of_scope" || readiness.editionSha256 !== currentEditionSha256) return invalid();
  let proposal: PublicationProposal | null = null;
  if (row.proposal != null) {
    const p = object(row.proposal); assertTarget(p, target);
    const id = uuid(p.id), editionSha256 = hash(p.edition_sha256), isCurrent = bool(p.is_current);
    if (isCurrent !== (id === readiness.proposalId && editionSha256 === currentEditionSha256)) return invalid();
    proposal = { ...target, id, editionSha256, submittedAt: date(p.submitted_at), submittedBy: uuid(p.submitted_by), requestId: uuid(p.request_id),
      isCurrent, dossier: p.dossier, supportedDossier: supportedPublicationDossier(p.dossier), source: parseSource(p.source_context, target) };
  }
  const history = list(row.history).map(parseEvent);
  if (history.length > 25 || new Set(history.map(e => e.id)).size !== history.length || history.some((e, i) => i > 0 && BigInt(e.sequence) >= BigInt(history[i - 1].sequence))) return invalid();
  const historyHasMore = bool(row.history_has_more);
  const historyNextBeforeSequence = row.history_next_before_sequence == null ? null : cursor(row.history_next_before_sequence);
  if (historyHasMore !== (historyNextBeforeSequence !== null) || (historyHasMore && history[history.length - 1]?.sequence !== historyNextBeforeSequence)) return invalid();
  const currentFileState = row.current_file_state;
  if (currentFileState !== "unconfirmed" && currentFileState !== "no_file_reference_detected" && currentFileState !== "sealed_current") return invalid();
  const currentSource = parseSource(row.current_source_context, target);
  const currentFileContext = row.current_file_context == null ? null
    : parseCurrentFileContext(row.current_file_context, target, actorId, currentEditionSha256, proposal, currentSource, currentFileState);
  if ((currentFileState === "sealed_current" && !currentFileContext)
    || (currentFileState === "no_file_reference_detected" && currentSource.fileBindings.length !== 0)) return invalid();
  return { ...target, actorId, currentEditionSha256, readiness, proposal, currentSource, currentFileState, currentFileContext,
    history, historyHasMore, historyNextBeforeSequence, confirmedEvent: row.confirmed_event == null ? null : parseEvent(row.confirmed_event) };
}
export function publicationReadinessLabel(readiness: PublicationReadiness): string {
  const labels: Record<ReadinessState, string> = {
    legacy_unchanged: "Ранее опубликован; новая проверка не оформлена", out_of_scope: "Клиентский курс",
    review_missing: "Требуется методическая проверка", review_incomplete: "Досье не заполнено", needs_revision: "Требуется доработка",
    review_stale: "Исходная редакция изменилась", review_due: "Наступил срок повторной проверки", eligible: "Редакция проверена для каталога",
  };
  return labels[readiness.state];
}
export function canAcceptPublicationReview(context: PublicationReviewContext): boolean {
  if (!context.proposal?.isCurrent || !context.proposal.supportedDossier || context.readiness.blockers.length) return false;
  if (context.currentFileState === "no_file_reference_detected") return context.currentSource.fileBindings.length === 0;
  const proof = context.currentFileContext;
  return context.currentFileState === "sealed_current" && proof?.state === "sealed_current"
    && proof.actorId === context.actorId && proof.marketplaceId === context.marketplaceId && proof.courseId === context.courseId
    && proof.proposalId === context.proposal.id && proof.proposalEditionSha256 === context.currentEditionSha256
    && proof.currentEditionSha256 === context.currentEditionSha256 && proof.referenceCount > 0
    && proof.references.length === proof.referenceCount && proof.references.every(ref => ref.state === "bytes_sealed" && !!ref.receipt);
}
export function canPublishPublication(context: PublicationReviewContext): boolean {
  return canAcceptPublicationReview(context) && context.readiness.state === "eligible" && !!context.readiness.reviewId;
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ":" + stable(v)).join(",") + "}";
  const encoded = JSON.stringify(value);
  if (encoded === undefined) return invalid();
  return encoded;
}
/** A retry of the same exact intent reuses the same UUID; never global storage. */
export class PublicationIntents {
  private ids = new Map<string, string>();
  constructor(private readonly makeId: () => string = () => crypto.randomUUID()) {}
  id(operation: string, payload: unknown): string {
    const key = operation + ":" + stable(payload);
    let id = this.ids.get(key); if (!id) { id = this.makeId(); uuid(id); this.ids.set(key, id); }
    return id;
  }
  clear() { this.ids.clear(); }
}
async function invoke(call: () => PromiseLike<RpcResult>): Promise<unknown> {
  try {
    const response = await call();
    if (response.error) {
      const error = typeof response.error === "object" && response.error !== null ? response.error as Record<string, unknown> : {};
      if (error.code === "40001" || error.code === "40P01") throw new PublicationError("stale");
      if (error.code === "42501") throw new PublicationError("forbidden");
      if (error.code === "23514") throw new PublicationError("blocked");
      throw new PublicationError("unavailable");
    }
    if (response.data == null) return invalid();
    return response.data;
  } catch (error) { if (error instanceof PublicationError) throw error; throw new PublicationError("unavailable"); }
}
export function createPublicationGateway(api: PublicationApiPort) {
  async function readiness(target: PublicationTarget) {
    target = { marketplaceId: uuid(target.marketplaceId), courseId: uuid(target.courseId) };
    return parsePublicationReadiness(await invoke(() => api.readiness({ p_marketplace_id: target.marketplaceId })), target);
  }
  async function context(target: PublicationTarget, actorId: string, options: { proposalId?: string; expectedEdition?: string; beforeSequence?: string; confirmEventId?: string } = {}) {
    target = { marketplaceId: uuid(target.marketplaceId), courseId: uuid(target.courseId) };
    actorId = uuid(actorId); options = { ...options };
    const result = parsePublicationContext(await invoke(() => api.context({ p_marketplace_id: target.marketplaceId, p_proposal_id: options.proposalId ?? null,
      p_expected_edition_sha256: options.expectedEdition ?? null, p_history_before_sequence: options.beforeSequence ?? null, p_confirm_event_id: options.confirmEventId ?? null })), target, actorId);
    if (result.currentFileContext && (!options.proposalId || !options.expectedEdition)) return invalid();
    if (options.proposalId && result.proposal?.id !== options.proposalId) return invalid();
    if (options.expectedEdition && result.currentEditionSha256 !== options.expectedEdition) throw new PublicationError("stale");
    if (options.confirmEventId && result.confirmedEvent?.id !== options.confirmEventId) return invalid();
    return result;
  }
  async function submit(target: PublicationTarget, actorId: string, edition: string, dossier: PublicationDossier, requestId: string) {
    target = { marketplaceId: uuid(target.marketplaceId), courseId: uuid(target.courseId) };
    actorId = uuid(actorId); edition = hash(edition); requestId = uuid(requestId);
    const submittedDossier = supportedPublicationDossier(dossier);
    if (!submittedDossier) throw new PublicationError("unsupported_dossier");
    dossier = submittedDossier;
    const result = object(await invoke(() => api.submit({ p_marketplace_id: target.marketplaceId, p_expected_edition_sha256: edition, p_dossier: dossier, p_request_id: requestId })));
    const proposalId = uuid(result.proposal_id); bool(result.replayed);
    if (hash(result.edition_sha256) !== edition) return invalid();
    const saved = await context(target, actorId, { proposalId, expectedEdition: edition });
    if (!saved.proposal || saved.proposal.requestId !== requestId || saved.proposal.submittedBy !== actorId || stable(saved.proposal.dossier) !== stable(dossier)) return invalid();
    return saved;
  }
  async function review(current: PublicationReviewContext, decision: ReviewDecision, notes: string, nextReviewAt: string | null, requestId: string) {
    current = { ...current, proposal: current.proposal ? { ...current.proposal } : null, readiness: { ...current.readiness } };
    const proposal = current.proposal;
    if (!proposal?.isCurrent || (decision === "accepted_for_template_publication" && !proposal.supportedDossier)) throw new PublicationError("unsupported_dossier");
    if (!notes.trim() || (decision === "accepted_for_template_publication" && (!canAcceptPublicationReview(current) || !nextReviewAt || !Number.isFinite(Date.parse(nextReviewAt)) || Date.parse(nextReviewAt) <= Date.now()))) throw new PublicationError("blocked");
    const result = object(await invoke(() => api.review({ p_marketplace_id: current.marketplaceId, p_proposal_id: proposal.id, p_expected_edition_sha256: current.currentEditionSha256,
      p_decision: decision, p_notes: notes, p_next_review_at: nextReviewAt, p_request_id: requestId })));
    const reviewId = uuid(result.review_id); bool(result.replayed);
    const saved = await context(current, current.actorId, { proposalId: proposal.id, expectedEdition: current.currentEditionSha256, confirmEventId: reviewId });
    const event = saved.confirmedEvent;
    if (!event || event.kind !== "review_decided" || event.proposalId !== proposal.id || event.editionSha256 !== current.currentEditionSha256 || event.actorId !== current.actorId || event.requestId !== requestId || event.decision !== decision || event.notes !== notes || (event.nextReviewAt == null ? nextReviewAt !== null : nextReviewAt === null || Date.parse(event.nextReviewAt) !== Date.parse(nextReviewAt)) || saved.readiness.reviewId !== reviewId || !saved.proposal?.isCurrent) return invalid();
    if (decision === "accepted_for_template_publication" && !canPublishPublication(saved)) return invalid();
    return saved;
  }
  async function publish(current: PublicationReviewContext, requestId: string) {
    current = { ...current, proposal: current.proposal ? { ...current.proposal } : null, readiness: { ...current.readiness } };
    if (!canPublishPublication(current) || !current.proposal) throw new PublicationError("blocked");
    const result = object(await invoke(() => api.publish({ p_marketplace_id: current.marketplaceId, p_proposal_id: current.proposal!.id, p_expected_edition_sha256: current.currentEditionSha256, p_request_id: requestId })));
    const replayed = bool(result.replayed), receiptId = uuid(result.receipt_id);
    if (uuid(result.id) !== current.marketplaceId || uuid(result.course_id) !== current.courseId || hash(result.edition_sha256) !== current.currentEditionSha256 || (replayed ? result.is_validated_at_recording !== true : result.is_validated !== true)) return invalid();
    const saved = await context(current, current.actorId, { proposalId: current.proposal.id, expectedEdition: current.currentEditionSha256, confirmEventId: receiptId });
    const event = saved.confirmedEvent;
    if (!event || event.kind !== "publication_recorded" || event.proposalId !== current.proposal.id || event.editionSha256 !== current.currentEditionSha256 || event.actorId !== current.actorId || event.requestId !== requestId || !canPublishPublication(saved) || saved.readiness.isValidated !== true || saved.readiness.reviewId !== current.readiness.reviewId) return invalid();
    return saved;
  }
  return { readiness, context, submit, review, publish };
}
export type PublicationGateway = ReturnType<typeof createPublicationGateway>;
