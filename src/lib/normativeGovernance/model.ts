import { z } from "zod";
import { normativeDate, verifyNormativeManifest, type NormativeManifest } from "./manifest";

export const DESIGNATED_NORMATIVE_OWNER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const uuid = z.string().uuid();
const sha = z.string().regex(/^[0-9a-f]{64}$/);
const identifier = z.string().regex(/^[A-Za-z0-9_.:-]{1,200}$/);
const reason = z.string().min(1).max(4000).refine(value => !!value.trim());
const date = z.string().refine(normativeDate);
const instant = z.string().datetime({ offset: true });
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const eventBase = { id: uuid, sequence: revision.refine(value => value > 0), manifestId: uuid.nullable(), manifestSha256: sha.nullable(),
  actorId: uuid, occurredAt: instant, organizationId: uuid.nullable() };
export const normativeEventSchema = z.discriminatedUnion("kind", [
  z.object({ ...eventBase, kind: z.literal("owner_assigned"), body: z.object({ ownerId: z.literal(DESIGNATED_NORMATIVE_OWNER), designation: z.literal("human_2026_10_22") }).strict() }).strict(),
  z.object({ ...eventBase, kind: z.literal("draft_registered"), body: z.object({ revision: revision.refine(value => value > 0) }).strict() }).strict(),
  z.object({ ...eventBase, kind: z.literal("review_due_set"), body: z.object({ dueOn: date, reason }).strict() }).strict(),
  z.object({ ...eventBase, kind: z.literal("source_checked"), body: z.object({ sourceId: identifier, sourceSha256: sha, reason }).strict() }).strict(),
  z.object({ ...eventBase, kind: z.literal("legal_reviewed"), body: z.object({ reason }).strict() }).strict(),
  z.object({ ...eventBase, kind: z.literal("published"), body: z.object({ reason }).strict() }).strict(),
  z.object({ ...eventBase, kind: z.literal("runtime_verified"), body: z.object({ deploymentRef: z.string().min(1).max(200), receiptSha256: sha, observedManifestSha256: sha, reason }).strict() }).strict(),
  z.object({ ...eventBase, kind: z.literal("centre_accepted"), body: z.object({ profileRevision: revision.refine(value => value > 0), reason }).strict() }).strict(),
]);
export type NormativeEvent = z.infer<typeof normativeEventSchema>;
export type NormativeCommand =
  | { kind: "owner_assigned"; manifestId: null; body: { ownerId: typeof DESIGNATED_NORMATIVE_OWNER; designation: "human_2026_10_22" } }
  | { kind: "review_due_set"; manifestId: string; body: { dueOn: string; reason: string } }
  | { kind: "source_checked"; manifestId: string; body: { sourceId: string; sourceSha256: string; reason: string } }
  | { kind: "legal_reviewed" | "published"; manifestId: string; body: { reason: string } }
  | { kind: "centre_accepted"; manifestId: string; body: { profileRevision: number; reason: string } };
// Runtime evidence is written only by the technical service path, never a browser command.
export interface ManifestVersion { id: string; revision: number; predecessorId: string | null; createdAt: string; createdBy: string; manifest: NormativeManifest }
export interface ManifestImpact {
  changedSourceIds: string[]; changedRequirementIds: string[]; affectedRequirementIds: string[];
  templateCoverage: "explicit_metadata_only_custom_templates_unmapped";
  existingDecisionsPreserved: true;
}
export function manifestImpact(before: NormativeManifest | null, after: NormativeManifest): ManifestImpact {
  const priorSources = new Map(before?.sources.map(source => [source.id, source.sha256]) ?? []);
  const sources = new Map(after.sources.map(source => [source.id, source.sha256]));
  const changedSourceIds = [...new Set([...priorSources.keys(), ...sources.keys()])].filter(id => priorSources.get(id) !== sources.get(id)).sort();
  const priorRequirements = new Map(before?.requirements.map(requirement => [requirement.id, requirement]) ?? []);
  const requirements = new Map(after.requirements.map(requirement => [requirement.id, requirement]));
  const changedRequirementIds = [...new Set([...priorRequirements.keys(), ...requirements.keys()])]
    .filter(id => priorRequirements.get(id)?.sha256 !== requirements.get(id)?.sha256).sort();
  const affectedRequirementIds = [...new Set([...changedRequirementIds, ...[...priorRequirements.values(), ...requirements.values()]
    .filter(requirement => requirement.sourceIds.some(id => changedSourceIds.includes(id))).map(requirement => requirement.id)])].sort();
  return { changedSourceIds, changedRequirementIds, affectedRequirementIds,
    templateCoverage: "explicit_metadata_only_custom_templates_unmapped", existingDecisionsPreserved: true };
}
export const impactSchema = z.object({ changedSourceIds: z.array(identifier).max(1000), changedRequirementIds: z.array(identifier).max(10000),
  affectedRequirementIds: z.array(identifier).max(10000), affectedDecisions: z.array(z.object({ requirementId: identifier, revision, catalogVersion: identifier, profileRevision: revision }).strict()).max(32),
  documentTypeIds: z.array(identifier).max(1000), documentCount: revision, customTemplateCoverage: z.literal("unmapped"),
  centresCoverage: z.literal("current_organization_only"), existingDecisionsPreserved: z.literal(true) }).strict();
const projectionSchema = z.object({ ownerAssigned: z.boolean(), reviewDueOn: date.nullable(), checkedSourceIds: z.array(identifier).max(1000),
  legalReviewed: z.boolean(), published: z.boolean(), runtimeVerified: z.boolean(), centreAccepted: z.boolean(),
  acceptedProfileRevision: revision.nullable(), legalComplianceConfirmed: z.literal(false) }).strict();
export interface NormativeGovernanceSnapshot {
  schemaVersion: 1; organizationId: string; profileRevision: number | null; actorId: string;
  serverAsOf: string; globalSequence: number; centreSequence: number; canManage: boolean; canAccept: boolean;
  manifests: ManifestVersion[]; selectedManifestId: string | null; events: NormativeEvent[]; historyComplete: boolean;
  projection: z.infer<typeof projectionSchema>; impact: z.infer<typeof impactSchema>;
}
export async function parseGovernanceSnapshot(input: unknown, organizationId: string): Promise<NormativeGovernanceSnapshot> {
  const schema = z.object({ schemaVersion: z.literal(1), organizationId: z.literal(organizationId), profileRevision: revision.nullable(), actorId: uuid,
    serverAsOf: instant, globalSequence: revision, centreSequence: revision, canManage: z.boolean(), canAccept: z.boolean(),
    manifests: z.array(z.object({ id: uuid, revision: revision.refine(value => value > 0), predecessorId: uuid.nullable(), createdAt: instant, createdBy: uuid, manifest: z.unknown() }).strict()).max(5),
    selectedManifestId: uuid.nullable(), events: z.array(normativeEventSchema).max(100), historyComplete: z.boolean(), projection: projectionSchema, impact: impactSchema }).strict();
  const parsed = schema.parse(input);
  const ids = new Set<string>();
  for (const entry of parsed.manifests) {
    if (ids.has(entry.id)) throw Error("NORMATIVE_RECORD_AMBIGUOUS"); ids.add(entry.id);
    await verifyNormativeManifest(entry.manifest as NormativeManifest);
  }
  if (parsed.selectedManifestId !== null && !ids.has(parsed.selectedManifestId)) throw Error("NORMATIVE_SOURCE_UNAVAILABLE");
  const selected = parsed.manifests.find(entry => entry.id === parsed.selectedManifestId);
  const sourceIds = new Set((selected?.manifest as NormativeManifest | undefined)?.sources.map(source => source.id) ?? []);
  if (new Set(parsed.projection.checkedSourceIds).size !== parsed.projection.checkedSourceIds.length || parsed.projection.checkedSourceIds.some(id => !sourceIds.has(id)) || new Set(parsed.events.map(event => event.id)).size !== parsed.events.length
    || parsed.events.some(event => event.organizationId !== null && event.organizationId !== organizationId)
    || parsed.events.some(event => (event.kind === "owner_assigned") !== (event.manifestId === null) || (event.manifestId === null) !== (event.manifestSha256 === null)
      || event.sequence > (event.organizationId === null ? parsed.globalSequence : parsed.centreSequence)
      || event.manifestId !== null && event.manifestId !== parsed.selectedManifestId
      || event.manifestId !== null && event.manifestSha256 !== (selected as ManifestVersion | undefined)?.manifest.sha256
      || event.kind === "runtime_verified" && event.body.observedManifestSha256 !== event.manifestSha256)
    || parsed.events.some(event => event.kind === "centre_accepted" ? event.organizationId !== organizationId : event.organizationId !== null)
    || parsed.canManage && parsed.actorId !== DESIGNATED_NORMATIVE_OWNER
    || parsed.projection.legalReviewed && (!parsed.projection.ownerAssigned || parsed.projection.checkedSourceIds.length !== sourceIds.size)
    || parsed.projection.runtimeVerified && !parsed.projection.published
    || parsed.projection.published && !parsed.projection.legalReviewed
    || parsed.projection.centreAccepted && (!parsed.projection.runtimeVerified || parsed.projection.acceptedProfileRevision !== parsed.profileRevision)) throw Error("NORMATIVE_RECORD_INVALID");
  return parsed as NormativeGovernanceSnapshot;
}

export const impactCentresPageSchema = z.object({ schemaVersion: z.literal(1), contextOrganizationId: uuid, manifestId: uuid,
  items: z.array(z.object({ organizationId: uuid, name: z.string().nullable(), profileRevision: revision.nullable(), impact: impactSchema, coverage: z.literal("potential_impacts_not_complete_custom_template_mapping") }).strict()).max(25),
  nextBeforeOrganizationId: uuid.nullable(), complete: z.boolean(), legalComplianceConfirmed: z.literal(false) }).strict();
export type ImpactCentresPage = z.infer<typeof impactCentresPageSchema>;
