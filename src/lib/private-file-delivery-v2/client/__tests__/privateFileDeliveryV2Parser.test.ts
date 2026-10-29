/** SOURCE ONLY; all UUIDs/materials/bytes are synthetic. No Auth, RPC, network or database calls. */
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  CAPTURE_ENFORCEMENT_SHA256, MAX_PRIVATE_BYTES, PrivateDeliveryV2ParseError,
  parseAuthorizeRolloutReceiptV2, parseCourseFileRoutingV2, parseDisableRolloutReceiptV2,
  parsePrivateBytesResponseV2, parsePrivateReferenceContextV2, parsePrivateRolloutControlV2,
  recordedCommandMatchesFreshControl, verifyPrivatePayloadBytes,
  type ReferenceSelection,
} from "../privateFileDeliveryV2Parser";
import {
  COURSE_ROUTING_V2, OWN_SOURCE_ORG, OWN_VALIDATION_SCOPE, PRIVATE_DELIVERY_V2, PRIVATE_ROLLOUT_V2,
  type AdminControlContext, type AdminControlReadRequest, type AuthorityMarker, type AuthorizeRolloutRequest,
  type DisableRolloutRequest, type MaterialProof, type RolloutCommandReceipt, type RolloutSnapshot,
  type SealedPrivateReferenceContext,
} from "../../contracts/privateFileDeliveryV2";

const id = (n: number) => "00000000-0000-0000-0000-" + String(n).padStart(12, "0");
const actor = id(1), course = id(2), listing = id(3), proposal = id(4), ref = id(5), receiptId = id(6);
const materialHash = "a".repeat(64), vectorHash = "b".repeat(64), deliveryHash = "c".repeat(64);
const ownBytes = new Uint8Array([37, 80, 68, 70, 45]); // Synthetic header bytes, not a real document.
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const fileHash = digest(ownBytes);
const modeSelection = () => ({ actorId: actor, organizationId: OWN_SOURCE_ORG, courseId: course, accessMode: "learner" as const });
const marker = (): AuthorityMarker => ({
  authorization_id: id(7), revision: "1", course_id: course, organization_id: OWN_SOURCE_ORG, proposal_id: proposal,
  material_edition_sha256: materialHash, source_scope_generation: id(8), reference_vector_sha256: vectorHash,
  capture_enforcement_sha256: CAPTURE_ENFORCEMENT_SHA256, delivery_protocol_sha256: deliveryHash,
});
const selected = (): ReferenceSelection => ({
  actorId: actor, request: { p_course_id: course, p_reference_kind: "course_document",
    p_reference_id: ref, p_access_mode: "learner", p_purpose: "preview" }, authority: marker(),
});
const ready = (): SealedPrivateReferenceContext => ({
  schema_version: 2, protocol: PRIVATE_DELIVERY_V2, authority_scope: OWN_VALIDATION_SCOPE,
  actor_id: actor, organization_id: OWN_SOURCE_ORG, course_id: course, reference_kind: "course_document",
  reference_id: ref, access_mode: "learner", purpose: "preview", state: "bytes_sealed", authority: marker(),
  binding: { receipt_id: receiptId, captured_edition_id: id(9), source_org_version_id: null, file_bytes_sha256: fileHash,
    byte_length: ownBytes.length, module_id: null, lesson_id: null, display_name: "Synthetic.pdf",
    reference_row_sha256: "d".repeat(64), visible_to_students: true, allow_download: false },
  context_sha256: "e".repeat(64),
});
const bytesReply = () => ({ ...ready(), bytes_hex: Buffer.from(ownBytes).toString("hex") });
const proof = (): MaterialProof => ({
  course_id: course, marketplace_id: listing, proposal_id: proposal, material_edition_sha256: materialHash,
  organization_id: OWN_SOURCE_ORG, source_scope_generation: id(8), reference_vector_sha256: vectorHash,
  capture_enforcement_sha256: CAPTURE_ENFORCEMENT_SHA256,
  references: [{ reference_kind: "course_document", reference_id: ref, receipt: {
    receipt_id: receiptId, captured_edition_id: id(9), source_org_version_id: null,
    file_bytes_sha256: fileHash, byte_length: ownBytes.length,
  } }],
});
const controlSnapshot = (): RolloutSnapshot => ({
  authorization_id: id(7), revision: "1", state: "enabled_for_validation", material: proof(),
  audience: "own_source", audience_organization_id: OWN_SOURCE_ORG, delivery_protocol_sha256: deliveryHash,
  purposes: ["preview"], configured_by: actor, configured_at: "2026-10-29T00:00:00.123456+00:00", last_event_id: id(10),
});
const statusRequest = (): AdminControlReadRequest => ({
  p_course_id: course, p_marketplace_id: null, p_proposal_id: null, p_expected_material_edition_sha256: null,
});
const materialRequest = (): AdminControlReadRequest => ({
  p_course_id: course, p_marketplace_id: listing, p_proposal_id: proposal, p_expected_material_edition_sha256: materialHash,
});
const control = (): AdminControlContext => ({
  schema_version: 2, protocol: PRIVATE_ROLLOUT_V2, actor_id: actor, organization_id: OWN_SOURCE_ORG, course_id: course,
  current: controlSnapshot(), current_revision: "1", selected_material: proof(),
  installed_delivery_protocol_sha256: deliveryHash, effective_state: "enabled_for_validation", can_authorize: true, blockers: [],
});
const authorizeRequest = (): AuthorizeRolloutRequest => ({
  p_course_id: course, p_marketplace_id: listing, p_proposal_id: proposal, p_expected_material_edition_sha256: materialHash,
  p_expected_reference_vector_sha256: vectorHash, p_expected_delivery_protocol_sha256: deliveryHash,
  p_expected_revision: "0", p_purposes: ["preview"], p_reason: "Synthetic technical review only", p_request_id: id(11),
});
const authorizeReceipt = (): RolloutCommandReceipt => ({
  schema_version: 2, protocol: PRIVATE_ROLLOUT_V2, actor_id: actor, course_id: course, action: "authorize",
  authorization_id: id(7), revision: "1", event_id: id(10), request_id: id(11), request_sha256: "f".repeat(64),
  recorded_at: "2026-10-29T00:00:00Z", state_at_recording: "enabled_for_validation", replayed: false,
});
const disableRequest = (): DisableRolloutRequest => ({
  p_course_id: course, p_expected_revision: "1", p_reason: "Synthetic stop", p_request_id: id(12),
});
const disableReceipt = (): RolloutCommandReceipt => ({
  ...authorizeReceipt(), action: "disable", revision: "2", event_id: id(13), request_id: id(12),
  state_at_recording: "disabled",
});
function denied(run: () => unknown): void { expect(run).toThrow(PrivateDeliveryV2ParseError); }
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

describe("V2 routing is exact and delegates successful V1 with the actual selected scope", () => {
  const v1 = () => ({ schema_version: 1, actor_id: actor, organization_id: OWN_SOURCE_ORG, course_id: course,
    access_mode: "learner", mode: "legacy", state: "legacy", cohort: null });
  const routing = () => ({ schema_version: 2, protocol: COURSE_ROUTING_V2, actor_id: actor, organization_id: OWN_SOURCE_ORG,
    course_id: course, access_mode: "learner", route: "v1", delegated_v1: v1(), authority: null });
  it("preserves real V1 parser semantics and nullable-org discovery", () => {
    expect(parseCourseFileRoutingV2(routing(), { ...modeSelection(), organizationId: null }).route).toBe("v1");
    denied(() => parseCourseFileRoutingV2({ ...routing(), delegated_v1: { ...v1(), actor_id: id(80) } }, modeSelection()));
    denied(() => parseCourseFileRoutingV2({ ...routing(), delegated_v1: { ...v1(), organization_id: id(81) } }, modeSelection()));
    denied(() => parseCourseFileRoutingV2({ ...routing(), delegated_v1: { ...v1(), mode: "future" } }, modeSelection()));
  });
  it("returns sticky held without a delegated legacy payload", () => {
    const raw = { ...routing(), route: "held", delegated_v1: null };
    expect(parseCourseFileRoutingV2(raw, modeSelection()).route).toBe("held");
    denied(() => parseCourseFileRoutingV2({ ...raw, delegated_v1: v1() }, modeSelection()));
    denied(() => parseCourseFileRoutingV2({ ...raw, authority: marker() }, modeSelection()));
  });
  it("parses a private authority only for own-source and exact course", () => {
    const raw = { ...routing(), route: "private_v2", delegated_v1: null, authority: marker() };
    expect(parseCourseFileRoutingV2(raw, modeSelection()).route).toBe("private_v2");
    denied(() => parseCourseFileRoutingV2({ ...raw, authority: { ...marker(), course_id: id(80) } }, modeSelection()));
    denied(() => parseCourseFileRoutingV2({ ...raw, organization_id: id(81) }, { ...modeSelection(), organizationId: null }));
  });
  it.each(["unknown", "error", "", null])("does not turn malformed routing %s into V1", route => {
    denied(() => parseCourseFileRoutingV2({ ...routing(), route }, modeSelection()));
  });
  it("rejects extra locators and missing top-level fields", () => {
    denied(() => parseCourseFileRoutingV2({ ...routing(), raw_url: "https://never.invalid/file" }, modeSelection()));
    const { authority: ignored, ...partial } = routing();
    expect(ignored).toBeNull();
    denied(() => parseCourseFileRoutingV2(partial, modeSelection()));
  });
  it("accepts canonical PostgreSQL UUIDs without requiring RFC version/variant bits", () => {
    const unusual = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const raw = { ...routing(), actor_id: unusual, delegated_v1: { ...v1(), actor_id: unusual } };
    expect(parseCourseFileRoutingV2(raw, { ...modeSelection(), actorId: unusual }).actor_id).toBe(unusual);
  });
  it.each(["AAAAAAAA-bbbb-cccc-dddd-eeeeeeeeeeee", " " + actor, actor.slice(0, -1)])("rejects noncanonical V2 UUID %s", bad => {
    denied(() => parseCourseFileRoutingV2({ ...routing(), actor_id: bad }, { ...modeSelection(), actorId: bad }));
  });
});

describe("V2 reference context binds every authority and selection field", () => {
  it("parses held separately and never accepts a partial held binding", () => {
    const held = { ...ready(), state: "held", authority: null, binding: null, context_sha256: null };
    expect(parsePrivateReferenceContextV2(held, selected()).state).toBe("held");
    denied(() => parsePrivateReferenceContextV2({ ...held, binding: ready().binding }, selected()));
  });
  it("clones receipt5 and the full binding without caller-owned mutable aliases", () => {
    const raw = { ...ready(), binding: { ...ready().binding } };
    const result = parsePrivateReferenceContextV2(raw, selected());
    raw.binding.display_name = "Changed later";
    expect(result.state).toBe("bytes_sealed");
    if (result.state !== "bytes_sealed") throw new Error("fixture");
    expect(result.binding.display_name).toBe("Synthetic.pdf");
    expect(Object.isFrozen(result.binding)).toBe(true);
  });
  it.each([
    ["actor_id", id(80)], ["organization_id", id(81)], ["course_id", id(82)],
    ["reference_kind", "lesson_attachment"], ["reference_id", id(83)], ["access_mode", "staff_preview"], ["purpose", "download"],
  ])("rejects cross-scope %s", (key, value) => {
    denied(() => parsePrivateReferenceContextV2({ ...ready(), [key]: value }, selected()));
  });
  it.each(["authorization_id", "proposal_id", "source_scope_generation"])("rejects substituted authority %s", key => {
    denied(() => parsePrivateReferenceContextV2({ ...ready(), authority: { ...marker(), [key]: id(80) } }, selected()));
  });
  it.each(["material_edition_sha256", "reference_vector_sha256", "capture_enforcement_sha256", "delivery_protocol_sha256"])("rejects substituted authority hash %s", key => {
    denied(() => parsePrivateReferenceContextV2({ ...ready(), authority: { ...marker(), [key]: "0".repeat(64) } }, selected()));
  });
  it("holds an old authorization after enable-disable-enable ABA even if material hash returns", () => {
    const raw = { ...ready(), authority: { ...marker(), revision: "3", authorization_id: id(80) } };
    denied(() => parsePrivateReferenceContextV2(raw, selected()));
  });
  it.each(["0", "01", "-1", "1e3", "9223372036854775808", 1])("rejects noncanonical/overflow persisted revision %s", revision => {
    denied(() => parsePrivateReferenceContextV2({ ...ready(), authority: { ...marker(), revision } }, selected()));
  });
  it("accepts the canonical bigint maximum without converting it to Number", () => {
    const authority = { ...marker(), revision: "9223372036854775807" };
    const result = parsePrivateReferenceContextV2({ ...ready(), authority }, { ...selected(), authority });
    expect(result.authority?.revision).toBe("9223372036854775807");
  });
  it("requires explicit null org-version and no extra receipt/resource fields", () => {
    denied(() => parsePrivateReferenceContextV2({ ...ready(), binding: { ...ready().binding, source_org_version_id: id(80) } }, selected()));
    denied(() => parsePrivateReferenceContextV2({ ...ready(), binding: { ...ready().binding, library_document_id: null } }, selected()));
    const { source_org_version_id: ignored, ...partial } = ready().binding;
    expect(ignored).toBeNull();
    denied(() => parsePrivateReferenceContextV2({ ...ready(), binding: partial }, selected()));
  });
  it("preserves purpose and ordinary visibility/download distinctions", () => {
    denied(() => parsePrivateReferenceContextV2({ ...ready(), binding: { ...ready().binding, visible_to_students: false } }, selected()));
    const q = { ...selected(), request: { ...selected().request, p_purpose: "download" as const } };
    denied(() => parsePrivateReferenceContextV2({ ...ready(), purpose: "download" }, q));
    expect(parsePrivateReferenceContextV2({ ...ready(), purpose: "download", binding: { ...ready().binding, allow_download: true } }, q).purpose).toBe("download");
  });
  it("rejects wrong lesson association and enforces the8MiB declared length bound", () => {
    denied(() => parsePrivateReferenceContextV2({ ...ready(), binding: { ...ready().binding, lesson_id: id(80) } }, selected()));
    denied(() => parsePrivateReferenceContextV2({ ...ready(), binding: { ...ready().binding, byte_length: MAX_PRIVATE_BYTES + 1 } }, selected()));
    expect(parsePrivateReferenceContextV2({ ...ready(), binding: { ...ready().binding, byte_length: MAX_PRIVATE_BYTES } }, selected()).binding?.byte_length).toBe(MAX_PRIVATE_BYTES);
  });
});

describe("V2 byte parsing and pure injected-SHA verification", () => {
  const sha256 = { digest: async (bytes: Uint8Array) => digest(bytes) };
  const scope = () => ({ signal: new AbortController().signal, isCurrent: () => true });
  it("requires the entire unchanged context, not merely an echoed context digest", () => {
    expect(parsePrivateBytesResponseV2(bytesReply(), selected(), ready()).bytes_hex).toBe("255044462d");
    denied(() => parsePrivateBytesResponseV2({ ...bytesReply(), binding: { ...ready().binding, display_name: "Other" } }, selected(), ready()));
    denied(() => parsePrivateBytesResponseV2({ ...bytesReply(), context_sha256: "0".repeat(64) }, selected(), ready()));
    denied(() => parsePrivateBytesResponseV2({ ...bytesReply(), bytes_url: "blob:forbidden" }, selected(), ready()));
  });
  it.each(["", "255044462", "255044462D", "25504446zz", "255044462d00"])("rejects malformed or length-mismatched hex %s", bytes_hex => {
    denied(() => parsePrivateBytesResponseV2({ ...bytesReply(), bytes_hex }, selected(), ready()));
  });
  it("verifies a real synthetic SHA and sniffs PDF without creating a URL or lease", async () => {
    const result = await verifyPrivatePayloadBytes(bytesReply(), selected(), ready(), sha256, scope());
    expect([...result.bytes]).toEqual([...ownBytes]);
    expect(result.mime).toBe("application/pdf");
    expect(result.previewKind).toBe("pdf");
    expect(Object.keys(result).sort()).toEqual(["bytes", "context", "mime", "previewKind"]);
  });
  it("keeps HTML/SVG-like bytes download-only despite a PDF display name", async () => {
    const bytes = new Uint8Array([60, 115, 118, 103, 62]);
    const context = { ...ready(), binding: { ...ready().binding, file_bytes_sha256: digest(bytes) } };
    const result = await verifyPrivatePayloadBytes({ ...context, bytes_hex: Buffer.from(bytes).toString("hex") }, selected(), context, sha256, scope());
    expect(result.previewKind).toBe("download_only");
    expect(result.mime).toBe("application/octet-stream");
  });
  it("rejects a hash mismatch and zeroes the owned decoded buffer", async () => {
    let observed: Uint8Array | undefined;
    const bad = { digest: async (bytes: Uint8Array) => { observed = bytes; return "0".repeat(64); } };
    await expect(verifyPrivatePayloadBytes(bytesReply(), selected(), ready(), bad, scope())).rejects.toBeInstanceOf(PrivateDeliveryV2ParseError);
    expect(observed && [...observed]).toEqual([0, 0, 0, 0, 0]);
  });
  it("does no digest work when already aborted", async () => {
    const abort = new AbortController(); abort.abort();
    const compute = vi.fn(sha256.digest);
    await expect(verifyPrivatePayloadBytes(bytesReply(), selected(), ready(), { digest: compute },
      { signal: abort.signal, isCurrent: () => true })).rejects.toBeInstanceOf(PrivateDeliveryV2ParseError);
    expect(compute).not.toHaveBeenCalled();
  });
  it("rejects delayed SHA after a unique operation changes A→B→A", async () => {
    const computation = deferred<string>();
    let operation = { key: "A" }; const original = operation;
    const pending = verifyPrivatePayloadBytes(bytesReply(), selected(), ready(),
      { digest: () => computation.promise },
      { signal: new AbortController().signal, isCurrent: () => operation === original });
    operation = { key: "B" }; operation = { key: "A" };
    computation.resolve(fileHash);
    await expect(pending).rejects.toBeInstanceOf(PrivateDeliveryV2ParseError);
  });
  it("honours irreversible abort even if an outer boolean becomes current again", async () => {
    const computation = deferred<string>();
    const abort = new AbortController();
    const pending = verifyPrivatePayloadBytes(bytesReply(), selected(), ready(),
      { digest: () => computation.promise },
      { signal: abort.signal, isCurrent: () => true });
    abort.abort(); computation.resolve(fileHash);
    await expect(pending).rejects.toBeInstanceOf(PrivateDeliveryV2ParseError);
  });
  it("returns a cloned captured context if caller data mutates during SHA", async () => {
    const computation = deferred<string>();
    const expected = { ...ready(), binding: { ...ready().binding } };
    const pending = verifyPrivatePayloadBytes(bytesReply(), selected(), expected,
      { digest: () => computation.promise }, scope());
    expected.binding.display_name = "Changed after await";
    computation.resolve(fileHash);
    expect((await pending).context.binding.display_name).toBe("Synthetic.pdf");
  });
});

describe("V2 default-deny control shape and whole-vector contract", () => {
  const parse = (raw: unknown) => parsePrivateRolloutControlV2(raw, { actorId: actor, request: materialRequest() });
  it("accepts absent policy as decimal0/disabled without inventing a row", () => {
    const raw = { ...control(), current: null, current_revision: "0", selected_material: null,
      can_authorize: false, effective_state: "disabled" };
    expect(parsePrivateRolloutControlV2(raw, { actorId: actor, request: statusRequest() }).current).toBeNull();
  });
  it("status-only cannot authorize or silently use latest material", () => {
    const raw = { ...control(), selected_material: null, can_authorize: false };
    expect(parsePrivateRolloutControlV2(raw, { actorId: actor, request: statusRequest() }).can_authorize).toBe(false);
    denied(() => parsePrivateRolloutControlV2({ ...raw, can_authorize: true }, { actorId: actor, request: statusRequest() }));
    denied(() => parsePrivateRolloutControlV2(control(), { actorId: actor, request: statusRequest() }));
  });
  it("requires explicit all-or-none selection and selected tuple equality", () => {
    denied(() => parsePrivateRolloutControlV2(control(), { actorId: actor,
      request: { ...statusRequest(), p_marketplace_id: listing } }));
    denied(() => parse({ ...control(), selected_material: { ...proof(), proposal_id: id(80) } }));
  });
  it.each(["-1", "00", "9223372036854775808", 1])("rejects invalid current revision %s", current_revision => {
    denied(() => parse({ ...control(), current_revision }));
  });
  it("does not treat a stale delivery fingerprint as effective enabled", () => {
    denied(() => parse({ ...control(), installed_delivery_protocol_sha256: "0".repeat(64) }));
    expect(parse({ ...control(), installed_delivery_protocol_sha256: "0".repeat(64), effective_state: "held", can_authorize: false }).effective_state).toBe("held");
  });
  it("rejects missing/duplicate/reordered reference vectors rather than partial authorization", () => {
    const first = proof().references[0];
    denied(() => parse({ ...control(), selected_material: { ...proof(), references: [] } }));
    denied(() => parse({ ...control(), selected_material: { ...proof(), references: [first, first] } }));
    denied(() => parse({ ...control(), selected_material: { ...proof(),
      references: [{ ...first, reference_id: id(90) }, first] } }));
  });
  it("does not reinterpret receipt identity or accept an org-version/library extension", () => {
    const first = proof().references[0];
    denied(() => parse({ ...control(), selected_material: { ...proof(),
      references: [{ ...first, receipt: { ...first.receipt, captured_edition_id: undefined } }] } }));
    denied(() => parse({ ...control(), selected_material: { ...proof(),
      references: [{ ...first, receipt: { ...first.receipt, source_org_version_id: id(80) } }] } }));
    denied(() => parse({ ...control(), selected_material: { ...proof(), library_document_id: id(81) } }));
  });
  it.each(["2026-02-30T00:00:00Z", "yesterday", "2026-10-29", "2026-10-29T25:00:00Z"])("rejects invalid server timestamp %s", configured_at => {
    denied(() => parse({ ...control(), current: { ...controlSnapshot(), configured_at } }));
  });
});

describe("V2 command receipts are historical; a fresh control is a separate prerequisite", () => {
  const authSelection = () => ({ actorId: actor, request: authorizeRequest() });
  it("parses authorize/disable only with their exact actor/action/request/revision", () => {
    const recorded = parseAuthorizeRolloutReceiptV2(authorizeReceipt(), authSelection());
    expect(recorded.revision).toBe("1");
    expect(parseDisableRolloutReceiptV2(disableReceipt(), { actorId: actor, request: disableRequest() }).state_at_recording).toBe("disabled");
    denied(() => parseAuthorizeRolloutReceiptV2({ ...authorizeReceipt(), actor_id: id(80) }, authSelection()));
    denied(() => parseAuthorizeRolloutReceiptV2({ ...authorizeReceipt(), request_id: id(81) }, authSelection()));
    denied(() => parseAuthorizeRolloutReceiptV2({ ...authorizeReceipt(), revision: "2" }, authSelection()));
    denied(() => parseAuthorizeRolloutReceiptV2(disableReceipt(), authSelection()));
  });
  it("compares a known opaque request digest on replay without inventing JSONB serialization", () => {
    const first = parseAuthorizeRolloutReceiptV2(authorizeReceipt(), authSelection());
    expect(parseAuthorizeRolloutReceiptV2({ ...first, replayed: true }, { ...authSelection(), knownReceipt: first }).replayed).toBe(true);
    denied(() => parseAuthorizeRolloutReceiptV2({ ...first, replayed: true, request_sha256: "0".repeat(64) },
      { ...authSelection(), knownReceipt: first }));
    denied(() => parseAuthorizeRolloutReceiptV2({ ...first, replayed: true, event_id: id(80) },
      { ...authSelection(), knownReceipt: first }));
  });
  it("does not claim current success from a valid historical replay after a later policy", () => {
    const old = parseAuthorizeRolloutReceiptV2({ ...authorizeReceipt(), replayed: true }, authSelection());
    const later = { ...control(), current_revision: "3",
      current: { ...controlSnapshot(), revision: "3", authorization_id: id(80), last_event_id: id(81) } };
    expect(recordedCommandMatchesFreshControl(old, later, authorizeRequest())).toBe(false);
    expect(recordedCommandMatchesFreshControl(old, control())).toBe(false);
    expect(recordedCommandMatchesFreshControl(old, control(), authorizeRequest())).toBe(true);
  });
  it("checks material/current actor and disabled metadata independently of the receipt", () => {
    const recorded = parseAuthorizeRolloutReceiptV2(authorizeReceipt(), authSelection());
    expect(recordedCommandMatchesFreshControl(recorded, control(), { ...authorizeRequest(), p_expected_material_edition_sha256: "0".repeat(64) })).toBe(false);
    expect(recordedCommandMatchesFreshControl(recorded, { ...control(), actor_id: id(80) }, authorizeRequest())).toBe(false);
    const disabled = parseDisableRolloutReceiptV2(disableReceipt(), { actorId: actor, request: disableRequest() });
    const fresh = { ...control(), current_revision: "2", effective_state: "disabled" as const,
      current: { ...controlSnapshot(), state: "disabled" as const, revision: "2", last_event_id: id(13) } };
    expect(recordedCommandMatchesFreshControl(disabled, fresh)).toBe(true);
    expect(recordedCommandMatchesFreshControl(disabled, { ...fresh, effective_state: "enabled_for_validation" })).toBe(false);
  });
  it("does not acknowledge another reference vector, delivery fingerprint or purpose set", () => {
    const recorded = parseAuthorizeRolloutReceiptV2(authorizeReceipt(), authSelection());
    expect(recordedCommandMatchesFreshControl(recorded, control(), { ...authorizeRequest(), p_expected_reference_vector_sha256: "0".repeat(64) })).toBe(false);
    expect(recordedCommandMatchesFreshControl(recorded, control(), { ...authorizeRequest(), p_expected_delivery_protocol_sha256: "0".repeat(64) })).toBe(false);
    expect(recordedCommandMatchesFreshControl(recorded, control(), { ...authorizeRequest(), p_purposes: ["download"] })).toBe(false);
  });
  it("rejects malformed command requests before accepting any response", () => {
    denied(() => parseAuthorizeRolloutReceiptV2(authorizeReceipt(), { ...authSelection(),
      request: { ...authorizeRequest(), p_purposes: ["preview", "preview"] } }));
    denied(() => parseAuthorizeRolloutReceiptV2(authorizeReceipt(), { ...authSelection(),
      request: { ...authorizeRequest(), p_reason: " " } }));
    denied(() => parseDisableRolloutReceiptV2(disableReceipt(), { actorId: actor,
      request: { ...disableRequest(), p_expected_revision: "0" } }));
  });
});
