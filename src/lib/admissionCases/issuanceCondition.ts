import { z } from "zod";

// Independent of the issuance runtime: UC010 remains the only admission case and decision process.
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const text = (max = 4000) => z.string().trim().min(1).max(max);
export const admissionIssuanceConditionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("primary_education_before_qualification"), education_levels: z.tuple([z.literal("spo"), z.literal("vo")]),
    concurrent_study_admission_allowed: z.boolean() }).strict(),
  z.object({ kind: z.literal("no_separate_primary_education_condition"), reason: text(1000) }).strict(),
]);
export const admissionIssuanceEvidenceSchema = z.object({ kind: z.literal("completed_primary_education"), education_level: z.enum(["spo", "vo"]),
  evidence_version_ids: z.array(uuid).min(1).max(20).refine(ids => new Set(ids).size === ids.length) }).strict();
export const admissionIssuanceReviewSnapshotSchema = z.object({ requirement_id: uuid, requirement_revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  event_id: uuid, actor_id: uuid.nullable(), condition: admissionIssuanceConditionSchema, evidence: admissionIssuanceEvidenceSchema.nullable() }).strict();
export type AdmissionIssuanceCondition = z.infer<typeof admissionIssuanceConditionSchema>;
export type AdmissionIssuanceEvidence = z.infer<typeof admissionIssuanceEvidenceSchema>;
