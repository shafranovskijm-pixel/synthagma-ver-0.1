import { publicEditionSchema, publicationCheckSchema, publicationEventSchema, publicationUuid, calendarDate, publicationBasisSchema, publicationInstant,
  type PublicEdition, type PublicationCurrentScope, type PublicationEvent, type PublicationProjection } from "./model";

function sameBasis(edition: PublicEdition, scope: PublicationCurrentScope): boolean {
  const a = edition.basis, b = scope.basis;
  return a.catalogVersion === b.catalogVersion && a.requirementId === b.requirementId && a.requirementVersion === b.requirementVersion
    && a.profileRevision === b.profileRevision && a.applicabilityDecisionRevision === b.applicabilityDecisionRevision
    && a.legalReview === b.legalReview && a.sourceRevisionSha256 === b.sourceRevisionSha256;
}

/** Pure rendering of already-authorized, persisted evidence. It does not authorize a read or mint verification evidence. */
export function projectPublication(editionInput: PublicEdition, events: readonly PublicationEvent[], scope: PublicationCurrentScope): PublicationProjection {
  const edition = publicEditionSchema.parse(editionInput);
  if (scope.organizationId !== edition.organizationId || !publicationInstant.safeParse(scope.asOf).success || !publicationBasisSchema.safeParse(scope.basis).success
    || Date.parse(edition.createdAt) > Date.parse(scope.asOf)
    || !Number.isFinite(scope.recheckAfterHours) || scope.recheckAfterHours <= 0 || scope.recheckAfterHours > 24 * 366) {
    throw new Error("INVALID_PUBLICATION_SCOPE");
  }
  const result: PublicationProjection = { state: "draft", legalReview: edition.basis.legalReview, approvedAt: null,
    reportedPublicationDate: null, verifiedAt: null, publicUrl: edition.publicUrl, checkId: null,
    legalComplianceConfirmed: false, continuousAvailabilityConfirmed: false };
  let lastSequence = 0, lastTime = Date.parse(edition.createdAt), approved = false, terminal = false, everApproved = false;
  for (const input of events) {
    const event = publicationEventSchema.parse(input);
    if (event.organizationId !== edition.organizationId || event.editionId !== edition.id || !publicationUuid.safeParse(event.id).success
      || !publicationUuid.safeParse(event.actorId).success || !Number.isSafeInteger(event.sequence) || event.sequence !== lastSequence + 1
      || !Number.isFinite(Date.parse(event.occurredAt)) || Date.parse(event.occurredAt) < lastTime || Date.parse(event.occurredAt) > Date.parse(scope.asOf)) {
      throw new Error("INVALID_PUBLICATION_HISTORY");
    }
    lastSequence = event.sequence; lastTime = Date.parse(event.occurredAt);
    if (terminal) throw new Error("PUBLICATION_ALREADY_WITHDRAWN");
    if (event.kind === "approved") {
      if (everApproved) throw new Error("PUBLICATION_ALREADY_APPROVED");
      everApproved = true;
      if (!event.reason.trim() || event.reason.length > 4000 || (event.reportedPublicationDate !== null && !calendarDate.safeParse(event.reportedPublicationDate).success)) throw new Error("INVALID_PUBLICATION_APPROVAL");
      approved = true; result.state = "awaiting_check"; result.approvedAt = event.occurredAt;
      result.reportedPublicationDate = event.reportedPublicationDate; result.verifiedAt = null; result.checkId = null;
    } else if (event.kind === "withdrawn") {
      if (!event.reason.trim() || event.reason.length > 4000) throw new Error("INVALID_PUBLICATION_WITHDRAWAL");
      if (!approved) throw new Error("PUBLICATION_NOT_APPROVED");
      terminal = true; approved = false; result.state = "withdrawn"; result.verifiedAt = null; result.checkId = null;
    } else if (event.kind === "check_completed") {
      const check = publicationCheckSchema.parse(event.check);
      if (check.organizationId !== edition.organizationId || check.editionId !== edition.id || check.editionRevision !== edition.revision
        || check.requestedUrl !== edition.publicUrl || Date.parse(check.checkedAt) > Date.parse(event.occurredAt) || Date.parse(check.checkedAt) < Date.parse(result.approvedAt ?? edition.createdAt)) throw new Error("INVALID_PUBLICATION_CHECK_BINDING");
      if (!approved) throw new Error("PUBLICATION_NOT_APPROVED");
      const exact = check.result === "verified" && check.httpStatus === 200 && check.observed?.sha256 === edition.content.sha256
        && check.observed.bytes === edition.content.bytes && check.observed.mime === edition.content.mime && check.responseHeadersSha256 !== null;
      if (check.result === "verified" && !exact) throw new Error("INVALID_PUBLICATION_VERIFICATION");
      result.state = exact ? "verified_at_time" : "recheck_required";
      result.verifiedAt = exact ? check.checkedAt : null; result.checkId = check.id;
    } else {
      throw new Error("INVALID_PUBLICATION_HISTORY");
    }
  }
  if (result.state !== "withdrawn" && !sameBasis(edition, scope)) { result.state = "source_changed"; result.verifiedAt = null; }
  else if (result.state === "verified_at_time" && result.verifiedAt
    && Date.parse(scope.asOf) - Date.parse(result.verifiedAt) > scope.recheckAfterHours * 3_600_000) result.state = "recheck_required";
  return result;
}
