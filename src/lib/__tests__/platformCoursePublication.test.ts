import { describe, expect, it, vi } from "vitest";
import { canAcceptPublicationReview, canPublishPublication, createPublicationGateway, ownPlatformPublicationTarget,
  parsePublicationContext, parsePublicationReadiness, PublicationError, PublicationIntents, PLATFORM_REVIEW_ORG_ID,
  supportedPublicationDossier, type PublicationApiPort } from "../platformCoursePublication";
import { P, contextDto, dossier, eventDto, parsedContext, proposalDto, publicationResultDto, readinessDto, sourceDto } from "./platformCoursePublication.fixtures";

function port() {
  return { readiness: vi.fn(), context: vi.fn(), submit: vi.fn(), review: vi.fn(), publish: vi.fn() } satisfies PublicationApiPort;
}
const ok = (data: unknown) => ({ data, error: null });
const model = (org = PLATFORM_REVIEW_ORG_ID) => ({ id: P.target.marketplaceId, course_id: P.target.courseId, organization_id: org,
  course: { id: P.target.courseId, organization_id: org, title: "Same synthetic title" } });

describe("own platform publication scope", () => {
  it("uses exact current source owner and a matching listing tenant, never title or lineage", () => {
    expect(ownPlatformPublicationTarget(model())).toEqual(P.target);
    expect(ownPlatformPublicationTarget({ ...model(), organization_id: null })).toEqual(P.target);
    expect(ownPlatformPublicationTarget({ ...model(P.otherActor), source_course_id: P.target.courseId })).toBeNull();
    expect(ownPlatformPublicationTarget({ ...model(), organization_id: P.otherActor })).toBeNull();
    expect(ownPlatformPublicationTarget({ ...model(), course: { ...model().course, id: P.otherProposal } })).toBeNull();
  });
  it.each([null, {}, readinessDto({ marketplace_id: P.otherProposal }), readinessDto({ course_id: P.otherProposal }), readinessDto({ edition_sha256: null }), readinessDto({ state: "unknown" })])("rejects unavailable or wrong readiness DTO %#", value => {
    expect(() => parsePublicationReadiness(value, P.target)).toThrow(PublicationError);
  });
  it("keeps legacy true truthful and never converts it into an accepted review", () => {
    const current = parsedContext({ readiness: readinessDto({ state: "legacy_unchanged", is_validated: true, proposal_id: null, review_id: null, blockers: ["explicit_template_review_missing"] }), proposal: null, history: [] });
    expect(current.readiness.isValidated).toBe(true);
    expect(canAcceptPublicationReview(current)).toBe(false);
    expect(canPublishPublication(current)).toBe(false);
  });
  it("does not silently hide unsupported persisted dossier fields before acceptance", () => {
    const saved = { ...dossier(), additional_unsupported_field: "Synthetic additional field" };
    expect(supportedPublicationDossier(saved)).toBeNull();
    const current = parsedContext({ proposal: proposalDto({ dossier: saved }) });
    expect(current.proposal?.dossier).toEqual(saved);
    expect(canAcceptPublicationReview(current)).toBe(false);
  });
  it("historical proposal remains viewable but cannot acquire current review authority", async () => {
    const api = port(), gateway = createPublicationGateway(api);
    const historical = parsedContext({ proposal: proposalDto({ id: P.otherProposal, is_current: false }) });
    expect(canAcceptPublicationReview(historical)).toBe(false);
    await expect(gateway.review(historical, "accepted_for_template_publication", "Synthetic", P.next, P.request)).rejects.toMatchObject({ code: "unsupported_dossier" });
    expect(api.review).not.toHaveBeenCalled();
  });
  it("unconfirmed file references never become receipts through a dossier field", () => {
    const files = [{ reference_kind: "course_document", reference_id: P.otherProposal, state: "unconfirmed", receipt_id: null,
      exact_version_kind: null, exact_version_id: null, file_bytes_sha256: null, byte_length: null }];
    const current = parsedContext({ current_file_state: "unconfirmed", current_source_context: sourceDto(P.target, { file_bindings: files }) });
    expect(canAcceptPublicationReview(current)).toBe(false);
    expect(canPublishPublication(current)).toBe(false);
    expect(() => parsePublicationContext(contextDto({ current_source_context: sourceDto(P.target, { file_bindings: [{ ...files[0], state: "bytes_sealed" }] }) }), P.target, P.actor)).toThrow();
  });
});

describe("persisted dossier and exact review/receipt confirmation", () => {
  it("loads the saved server dossier after a new UI session, with no local draft authority", async () => {
    const api = port(); api.context.mockResolvedValue(ok(contextDto()));
    const result = await createPublicationGateway(api).context(P.target, P.actor);
    expect(result.proposal?.supportedDossier).toEqual(dossier());
    expect(api.context).toHaveBeenCalledExactlyOnceWith({ p_marketplace_id: P.target.marketplaceId, p_proposal_id: null,
      p_expected_edition_sha256: null, p_history_before_sequence: null, p_confirm_event_id: null });
  });
  it("confirms immutable submitted payload, actor, request and exact source SHA", async () => {
    const api = port(); api.submit.mockResolvedValue(ok({ proposal_id: P.proposal, edition_sha256: P.sha, replayed: false }));
    api.context.mockResolvedValue(ok(contextDto()));
    const saved = await createPublicationGateway(api).submit(P.target, P.actor, P.sha, dossier(), P.request);
    expect(saved.proposal?.requestId).toBe(P.request);
    expect(api.submit).toHaveBeenCalledOnce();
    expect(api.context.mock.calls[0][0].p_proposal_id).toBe(P.proposal);
  });
  it.each([
    { proposal: proposalDto({ request_id: P.otherRequest }) },
    { proposal: proposalDto({ submitted_by: P.otherActor }) },
    { proposal: proposalDto({ dossier: { ...dossier(), passport: { ...dossier().passport, purpose: "Changed" } } }) },
    { current_edition_sha256: P.changedSha, readiness: readinessDto({ edition_sha256: P.changedSha }), proposal: proposalDto({ edition_sha256: P.changedSha }) },
  ])("rejects submitted readback mismatch %#", async override => {
    const api = port(); api.submit.mockResolvedValue(ok({ proposal_id: P.proposal, edition_sha256: P.sha, replayed: false }));
    api.context.mockResolvedValue(ok(contextDto(override)));
    await expect(createPublicationGateway(api).submit(P.target, P.actor, P.sha, dossier(), P.request)).rejects.toBeInstanceOf(PublicationError);
    expect(api.submit).toHaveBeenCalledOnce();
  });
  it("compares persisted timestamp instants rather than PostgreSQL/ISO spellings", async () => {
    const api = port(); api.review.mockResolvedValue(ok({ review_id: P.review, replayed: false }));
    api.context.mockResolvedValue(ok(contextDto({ confirmed_event: eventDto({ next_review_at: "2100-01-01T00:00:00+00:00" }) })));
    const before = parsedContext({ readiness: readinessDto({ state: "review_missing", review_id: null }) });
    const result = await createPublicationGateway(api).review(before, "accepted_for_template_publication", "Explicit SYNTHETIC decision", P.next, P.request);
    expect(result.readiness.reviewId).toBe(P.review);
    expect(api.context.mock.calls[0][0].p_confirm_event_id).toBe(P.review);
    expect(api.publish).not.toHaveBeenCalled();
  });
  it.each([
    eventDto({ actor_id: P.otherActor }), eventDto({ request_id: P.otherRequest }), eventDto({ proposal_id: P.otherProposal }),
    eventDto({ edition_sha256: P.changedSha }), eventDto({ notes: "Wrong synthetic notes" }),
    eventDto({ id: P.receipt }), eventDto({ decision: "needs_revision" }),
  ])("rejects a different saved decision identity %#", async event => {
    const api = port(); api.review.mockResolvedValue(ok({ review_id: P.review, replayed: true }));
    api.context.mockResolvedValue(ok(contextDto({ confirmed_event: event })));
    await expect(createPublicationGateway(api).review(parsedContext(), "accepted_for_template_publication", "Explicit SYNTHETIC decision", P.next, P.request)).rejects.toBeInstanceOf(PublicationError);
    expect(api.publish).not.toHaveBeenCalled();
  });
  it("confirms exact saved publication row and its own receipt after commit", async () => {
    const api = port(); api.publish.mockResolvedValue(ok({ id: P.target.marketplaceId, course_id: P.target.courseId,
      edition_sha256: P.sha, is_validated: true, receipt_id: P.receipt, replayed: false }));
    api.context.mockResolvedValue(ok(contextDto({ readiness: readinessDto({ is_validated: true }),
      confirmed_event: eventDto({ id: P.receipt, event_kind: "publication_recorded", decision: null, notes: null, next_review_at: null, same_person_review: null }) })));
    const result = await createPublicationGateway(api).publish(parsedContext(), P.request);
    expect(result.readiness.isValidated).toBe(true);
    expect(api.context.mock.calls[0][0].p_confirm_event_id).toBe(P.receipt);
  });
  it.each([null, {}, publicationResultDto({ id: P.otherProposal }), publicationResultDto({ course_id: P.otherProposal }), publicationResultDto({ edition_sha256: P.changedSha }), publicationResultDto({ is_validated: false }), publicationResultDto({ receipt_id: null })])("never reports a missing/mismatched saved row as published %#", async data => {
    const api = port(); api.publish.mockResolvedValue(ok(data));
    await expect(createPublicationGateway(api).publish(parsedContext(), P.request)).rejects.toBeInstanceOf(PublicationError);
    expect(api.context).not.toHaveBeenCalled();
  });
  it("does not turn an old replay receipt into a current true flag", async () => {
    const api = port(); api.publish.mockResolvedValue(ok({ id: P.target.marketplaceId, course_id: P.target.courseId,
      edition_sha256: P.sha, is_validated_at_recording: true, receipt_id: P.receipt, replayed: true }));
    api.context.mockResolvedValue(ok(contextDto({ readiness: readinessDto({ is_validated: false }),
      confirmed_event: eventDto({ id: P.receipt, event_kind: "publication_recorded", decision: null, notes: null, next_review_at: null, same_person_review: null }) })));
    await expect(createPublicationGateway(api).publish(parsedContext(), P.request)).rejects.toMatchObject({ code: "invalid_response" });
  });
  it.each(["40001", "42501", "23514", "unavailable"])("fails closed on %s without retry or publishing private diagnostics", async code => {
    const api = port(); api.readiness.mockResolvedValue({ data: null, error: { code, message: "Synthetic private detail must stay private" } });
    const action = createPublicationGateway(api).readiness(P.target);
    await expect(action).rejects.toBeInstanceOf(PublicationError);
    await expect(action).rejects.not.toThrow("Synthetic private detail");
    expect(api.readiness).toHaveBeenCalledOnce();
    expect(api.publish).not.toHaveBeenCalled();
  });
  it("does not inspect a seemingly successful publication row when its RPC returned an error", async () => {
    const api = port(); api.publish.mockResolvedValue({ data: publicationResultDto(), error: { code: "42501", message: "Synthetic private failure" } });
    await expect(createPublicationGateway(api).publish(parsedContext(), P.request)).rejects.toMatchObject({ code: "forbidden" });
    expect(api.context).not.toHaveBeenCalled();
  });
  it("sanitizes a thrown transport error without retry or a false confirmation", async () => {
    const api = port(); api.readiness.mockRejectedValueOnce(new Error("Synthetic private thrown failure"));
    await expect(createPublicationGateway(api).readiness(P.target)).rejects.toMatchObject({ code: "unavailable", message: "unavailable" });
    expect(api.readiness).toHaveBeenCalledOnce(); expect(api.publish).not.toHaveBeenCalled();
  });
  it("captures target identity before a deferred response resolves", async () => {
    const api = port(); let resolve!: (value: ReturnType<typeof ok>) => void;
    api.readiness.mockImplementation(() => new Promise(r => { resolve = r; }));
    const target = { ...P.target }, request = createPublicationGateway(api).readiness(target);
    target.courseId = P.otherProposal;
    resolve(ok(readinessDto()));
    await expect(request).resolves.toMatchObject(P.target);
  });
  it("keeps exact idempotent requests within one scope without storing evidence globally", () => {
    const makeId = vi.fn().mockReturnValueOnce(P.request).mockReturnValueOnce(P.otherRequest).mockReturnValueOnce(P.receipt);
    const intents = new PublicationIntents(makeId);
    expect(intents.id("submit", { actor: P.actor, dossier: { a: 1, b: 2 } })).toBe(P.request);
    expect(intents.id("submit", { dossier: { b: 2, a: 1 }, actor: P.actor })).toBe(P.request);
    expect(intents.id("submit", { actor: P.otherActor, dossier: { a: 1, b: 2 } })).toBe(P.otherRequest);
    intents.clear();
    expect(intents.id("submit", { actor: P.actor, dossier: { a: 1, b: 2 } })).toBe(P.receipt);
  });
  it("refuses duplicate or out-of-order history and a false complete-page claim", () => {
    expect(() => parsedContext({ history: [eventDto(), eventDto()] })).toThrow();
    expect(() => parsedContext({ history: [eventDto({ sequence: "1" }), eventDto({ id: P.receipt, sequence: "2" })] })).toThrow();
    expect(() => parsedContext({ history_has_more: true, history_next_before_sequence: null })).toThrow();
  });
});
