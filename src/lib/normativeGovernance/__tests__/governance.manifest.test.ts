// @vitest-environment node
import { describe, it, expect } from "vitest";
import { CATALOG_VERSION, CATALOG_AS_OF, LEGAL_SOURCES, REQUIREMENTS } from "@/lib/uc-compliance/catalog";
import { canonicalNormativeJson, createNormativeManifest, normativeDate, normativeSha256, verifyNormativeManifest } from "../manifest";
import { manifestImpact, parseGovernanceSnapshot } from "../model";
import { ORG_A, ORG_B, sampleManifest, sampleRequirement, sampleSource, snapshot } from "./normative.fixture";
describe("UC030 immutable metadata and independent governance states", () => {
 it("captures all real current32 IDs and legacy source facts without upgrading their legal status", async () => {
  const manifest = await createNormativeManifest({ catalogVersion: CATALOG_VERSION, asOf: CATALOG_AS_OF, sources: Object.values(LEGAL_SOURCES), requirements: REQUIREMENTS });
  await expect(verifyNormativeManifest(manifest)).resolves.toBeUndefined();expect(manifest.requirements).toHaveLength(32);
  expect(manifest.requirements.map(item => item.id).sort()).toEqual(REQUIREMENTS.map(item => item.id).sort());
  for (const source of Object.values(LEGAL_SOURCES)) expect(JSON.parse(manifest.sources.find(item => item.id === source.id)!.payloadJson)).toEqual(source);
  expect(manifest).not.toHaveProperty("legalReviewed");expect(manifest).not.toHaveProperty("published");
 });
 it("canonicalizes source and object order while preserving array order and immutable raw evidence", async () => {
  expect(canonicalNormativeJson({ b: 2, a: 1 })).toBe(canonicalNormativeJson({ a: 1, b: 2 }));
  expect(await normativeSha256(canonicalNormativeJson([1, 2]))).not.toBe(await normativeSha256(canonicalNormativeJson([2, 1])));
  const second = { ...sampleSource, id: "another_source" };
  const first = await createNormativeManifest({ catalogVersion: "synthetic-v1", asOf: "2026-10-24", sources: [sampleSource, second], requirements: [sampleRequirement] });
  const reversed = await createNormativeManifest({ catalogVersion: "synthetic-v1", asOf: "2026-10-24", sources: [second, sampleSource], requirements: [sampleRequirement] });
  expect(first.sha256).toBe(reversed.sha256);
 });
 it("rejects accessors before executing either object or array getters", () => {
  let executed = 0;const object = Object.defineProperty({}, "value", { enumerable: true, get() { ++executed; return "bad"; } });
  const array: unknown[] = [];Object.defineProperty(array, "0", { enumerable: true, get() { ++executed; return "bad"; } });
  expect(() => canonicalNormativeJson(object)).toThrow("NORMATIVE_MANIFEST_INVALID");expect(() => canonicalNormativeJson(array)).toThrow("NORMATIVE_MANIFEST_INVALID");expect(executed).toBe(0);
 });
 it("rejects payload changes and outer-hash tampering rather than trusting a catalogue label", async () => {
  const original = await sampleManifest(), changed = structuredClone(original);changed.sources[0].payloadJson = changed.sources[0].payloadJson.replace("SYNTHETIC", "CHANGED");
  await expect(verifyNormativeManifest(changed)).rejects.toThrow();await expect(verifyNormativeManifest({ ...original, sha256: "0".repeat(64) })).rejects.toThrow();
 });
 it("finds indirect requirement impact when a referenced source changes and retains removed requirement impact", async () => {
  const before = await sampleManifest();const after = await createNormativeManifest({ catalogVersion: "synthetic-v1", asOf: "2026-10-24", sources: [{ ...sampleSource, provision: "Changed synthetic provision" }], requirements: [sampleRequirement] });
  const impact = manifestImpact(before, after);expect(impact.changedRequirementIds).toEqual([]);expect(impact.changedSourceIds).toEqual([sampleSource.id]);expect(impact.affectedRequirementIds).toEqual([sampleRequirement.id]);
  const removed = await createNormativeManifest({ catalogVersion: "synthetic-v1", asOf: "2026-10-24", sources: [sampleSource], requirements: [] });expect(manifestImpact(before, removed).affectedRequirementIds).toContain(sampleRequirement.id);expect(before.requirements).toHaveLength(1);
 });
 it("keeps unknown custom-template coverage explicit and never mutates prior decisions", async () => {
  const before = await sampleManifest(), copy = JSON.stringify(before), impact = manifestImpact(before, before);
  expect(impact.templateCoverage).toBe("explicit_metadata_only_custom_templates_unmapped");expect(impact.existingDecisionsPreserved).toBe(true);expect(impact.affectedRequirementIds).toEqual([]);expect(JSON.stringify(before)).toBe(copy);
 });
 it("keeps a legacy confirmed source and owner assignment separate from legal and technical approval", async () => {
  const record = await snapshot();record.manifests[0].manifest = await createNormativeManifest({ catalogVersion: "synthetic-v1", asOf: "2026-10-24", sources: [{ ...sampleSource, reviewStatus: "confirmed" }], requirements: [sampleRequirement] });
  const parsed = await parseGovernanceSnapshot(record, ORG_A);expect(parsed.projection.ownerAssigned).toBe(true);expect(parsed.projection.legalReviewed).toBe(false);expect(parsed.projection.runtimeVerified).toBe(false);expect(parsed.projection.reviewDueOn).toBeNull();
 });
 it("rejects a technical or published status without the distinct prerequisite records", async () => {
  const record = await snapshot();record.projection.runtimeVerified = true;await expect(parseGovernanceSnapshot(record, ORG_A)).rejects.toThrow();
  record.projection.runtimeVerified = false;record.projection.published = true;await expect(parseGovernanceSnapshot(record, ORG_A)).rejects.toThrow();
  record.projection.published = false;record.projection.legalReviewed = true;await expect(parseGovernanceSnapshot(record, ORG_A)).rejects.toThrow();
 });
 it("rejects foreign organization data and event hashes bound to another source edition", async () => {
  const record = await snapshot();await expect(parseGovernanceSnapshot(record, ORG_B)).rejects.toThrow();
  record.events = [{ id: crypto.randomUUID(), sequence: 1, manifestId: record.selectedManifestId, manifestSha256: "0".repeat(64), actorId: record.actorId, organizationId: null, occurredAt: record.serverAsOf, kind: "draft_registered", body: { revision: 1 } }];
  await expect(parseGovernanceSnapshot(record, ORG_A)).rejects.toThrow();
 });
 it("invalidates centre acceptance for a changed profile without erasing the historical revision", async () => {
  const record = await snapshot();Object.assign(record.projection, { checkedSourceIds: [sampleSource.id], legalReviewed: true, published: true, runtimeVerified: true, centreAccepted: true, acceptedProfileRevision: 1 });
  await expect(parseGovernanceSnapshot(record, ORG_A)).resolves.toBeTruthy();record.profileRevision = 2;await expect(parseGovernanceSnapshot(record, ORG_A)).rejects.toThrow();expect(record.projection.acceptedProfileRevision).toBe(1);
 });
 it("rejects impossible review dates, cycles and sparse arrays", () => {
  expect(normativeDate("2026-02-29")).toBe(false);expect(normativeDate("2028-02-29")).toBe(true);const cycle: any = {};cycle.self = cycle;
  expect(() => canonicalNormativeJson(cycle)).toThrow();expect(() => canonicalNormativeJson(new Array(2))).toThrow();
 });
});
