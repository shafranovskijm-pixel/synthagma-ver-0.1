import type { LegalSource, RequirementDefinition } from "@/lib/uc-compliance/model";

/** Metadata/evidence snapshot, never the hash of a complete consolidated law. */
export interface NormativeManifest {
  schemaVersion: 1;
  catalogVersion: string;
  asOf: string;
  sources: Array<{ id: string; payloadJson: string; sha256: string }>;
  requirements: Array<{ id: string; version: string; sourceIds: string[]; payloadJson: string; sha256: string }>;
  sha256: string;
}
const identifier = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_.:-]{1,200}$/.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const fail = (): never => { throw new Error("NORMATIVE_MANIFEST_INVALID"); };
export function normativeDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function canonicalNormativeJson(input: unknown): string {
  const active = new Set<object>();
  function encode(value: unknown, depth: number): string {
    if (depth > 48) return fail();
    if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
    if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : fail();
    if (typeof value !== "object" || active.has(value)) return fail();
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return fail();
    active.add(value);
    let result: string;
    if (Array.isArray(value)) {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Reflect.ownKeys(descriptors).some(key => typeof key !== "string") || Object.keys(descriptors).length !== value.length + 1
        || Array.from({ length: value.length }, (_, index) => descriptors[String(index)]).some(d => !d || !("value" in d) || !d.enumerable)) return fail();
      result = "[" + Array.from({ length: value.length }, (_, index) => encode(descriptors[String(index)].value, depth + 1)).join(",") + "]";
    } else {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Reflect.ownKeys(descriptors).some(key => typeof key !== "string") || Object.values(descriptors).some(d => !d.enumerable || !("value" in d))) return fail();
      result = "{" + Object.keys(descriptors).sort().map(key => JSON.stringify(key) + ":" + encode(descriptors[key].value, depth + 1)).join(",") + "}";
    }
    active.delete(value);
    if (result.length > 1_000_000) return fail();
    return result;
  }
  return encode(input, 0);
}
export async function normativeSha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
const exactKeys = (value: unknown, keys: string[]) => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("|") === [...keys].sort().join("|");

export async function createNormativeManifest(input: {
  catalogVersion: string; asOf: string; sources: readonly LegalSource[]; requirements: readonly RequirementDefinition[];
}): Promise<NormativeManifest> {
  if (!identifier(input.catalogVersion) || !normativeDate(input.asOf) || input.sources.length > 1000 || input.requirements.length > 10000) fail();
  const sources: NormativeManifest["sources"] = [];
  for (const source of input.sources) {
    const payloadJson = canonicalNormativeJson(source);
    sources.push({ id: source.id, payloadJson, sha256: await normativeSha256(payloadJson) });
  }
  const requirements: NormativeManifest["requirements"] = [];
  for (const requirement of input.requirements) {
    const payloadJson = canonicalNormativeJson(requirement);
    requirements.push({ id: requirement.id, version: requirement.version,
      sourceIds: [...new Set(requirement.legalSources.map(source => source.id))].sort(), payloadJson, sha256: await normativeSha256(payloadJson) });
  }
  sources.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0); requirements.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const body = { schemaVersion: 1 as const, catalogVersion: input.catalogVersion, asOf: input.asOf, sources, requirements };
  const result = { ...body, sha256: await normativeSha256(canonicalNormativeJson(body)) };
  await verifyNormativeManifest(result);
  return result;
}

export async function verifyNormativeManifest(manifest: NormativeManifest): Promise<void> {
  if (!manifest || !exactKeys(manifest, ["schemaVersion", "catalogVersion", "asOf", "sources", "requirements", "sha256"])
    || manifest.schemaVersion !== 1 || !identifier(manifest.catalogVersion) || !normativeDate(manifest.asOf) || !hash(manifest.sha256)
    || !Array.isArray(manifest.sources) || !Array.isArray(manifest.requirements) || manifest.sources.length > 1000 || manifest.requirements.length > 10000) fail();
  const sourceIds = new Set<string>(), requirementIds = new Set<string>();
  for (const source of manifest.sources) {
    if (!exactKeys(source, ["id", "payloadJson", "sha256"]) || !identifier(source.id) || sourceIds.has(source.id) || !hash(source.sha256)) fail();
    const payload = JSON.parse(source.payloadJson);
    if (payload.id !== source.id || canonicalNormativeJson(payload) !== source.payloadJson || await normativeSha256(source.payloadJson) !== source.sha256) fail();
    sourceIds.add(source.id);
  }
  for (const requirement of manifest.requirements) {
    if (!exactKeys(requirement, ["id", "version", "sourceIds", "payloadJson", "sha256"]) || !identifier(requirement.id) || !identifier(requirement.version)
      || requirementIds.has(requirement.id) || !hash(requirement.sha256) || !Array.isArray(requirement.sourceIds)
      || new Set(requirement.sourceIds).size !== requirement.sourceIds.length || requirement.sourceIds.some(id => !sourceIds.has(id))) fail();
    const payload = JSON.parse(requirement.payloadJson);
    if (payload.id !== requirement.id || payload.version !== requirement.version || !Array.isArray(payload.legalSources)
      || canonicalNormativeJson([...new Set(payload.legalSources.map((source: LegalSource) => source.id))].sort()) !== canonicalNormativeJson(requirement.sourceIds)
      || canonicalNormativeJson(payload) !== requirement.payloadJson || await normativeSha256(requirement.payloadJson) !== requirement.sha256) fail();
    requirementIds.add(requirement.id);
  }
  const { sha256, ...body } = manifest;
  if (await normativeSha256(canonicalNormativeJson(body)) !== sha256) fail();
}
