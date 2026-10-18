import { z } from "zod";

export const PROGRAM_TYPES = ["dpo_upskilling", "dpo_retraining", "professional_training", "internal_nonformal"] as const;
export const SPECIAL_AREAS = ["medical_pharmaceutical", "pedagogical", "transport", "security", "occupational_safety", "other_regulated"] as const;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T00:00:00Z`); return !v.startsWith("0000-") && Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, "Укажите существующую календарную дату");
const text = z.string().min(1).max(2000).refine(v => v.trim().length > 0).nullable();
const optionalUuid = z.string().uuid().nullable();
const programTypes = z.array(z.enum(PROGRAM_TYPES)).max(PROGRAM_TYPES.length).refine(v => new Set(v).size === v.length).nullable();
export const educationProfileSchema = z.object({
  schemaVersion: z.literal(1),
  legalForm: z.enum(["legal_entity", "individual_entrepreneur"]).nullable(),
  providerKind: z.enum(["educational_organization", "training_unit", "entrepreneur_direct", "entrepreneur_with_teachers", "internal_nonformal"]).nullable(),
  educationalActivity: z.boolean().nullable(), programTypes,
  usesElearning: z.boolean().nullable(), usesDistanceLearning: z.boolean().nullable(), paidEducation: z.boolean().nullable(),
  hasEmployees: z.boolean().nullable(), hiresTeachers: z.boolean().nullable(), hasPracticalTraining: z.boolean().nullable(),
  usesNetworkForm: z.boolean().nullable(), servesMinors: z.boolean().nullable(), servesDisabilities: z.boolean().nullable(),
  specialAreas: z.array(z.enum(SPECIAL_AREAS)).max(SPECIAL_AREAS.length).refine(v => new Set(v).size === v.length).nullable(),
  license: z.object({
    status: z.enum(["declared_active", "declared_exempt", "suspended", "terminated"]).nullable(),
    registryNumber: text, authority: text, licensedActivities: programTypes,
    sourceUrl: z.string().url().max(2000).refine(v => {
      try { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password && !/\s/.test(v); } catch { return false; }
    }).nullable(),
    checkedOn: date.nullable(), exemptionReason: text, evidenceDocumentId: optionalUuid, evidenceVersionId: optionalUuid,
  }).strict().refine(v => !v.evidenceVersionId || !!v.evidenceDocumentId, "Версия требует документ-основание"),
}).strict();
export type EducationProfileV1 = z.infer<typeof educationProfileSchema>;
export type ProgramType = typeof PROGRAM_TYPES[number];
export type ProfileBooleanField = { [K in keyof EducationProfileV1]: EducationProfileV1[K] extends boolean | null ? K : never }[keyof EducationProfileV1];
export const parseEducationProfile = (value: unknown): EducationProfileV1 => educationProfileSchema.parse(value);
export const isEducationProfile = (value: unknown): value is EducationProfileV1 => educationProfileSchema.safeParse(value).success;
export function createEmptyEducationProfile(): EducationProfileV1 {
  return { schemaVersion: 1, legalForm: null, providerKind: null, educationalActivity: null, programTypes: null,
    usesElearning: null, usesDistanceLearning: null, paidEducation: null, hasEmployees: null, hiresTeachers: null,
    hasPracticalTraining: null, usesNetworkForm: null, servesMinors: null, servesDisabilities: null, specialAreas: null,
    license: { status: null, registryNumber: null, authority: null, licensedActivities: null, sourceUrl: null,
      checkedOn: null, exemptionReason: null, evidenceDocumentId: null, evidenceVersionId: null } };
}
export interface EducationProfileEnvelope { organization_id: string; revision: number; profile: EducationProfileV1; updated_at: string | null; updated_by: string | null }
export const COMPLIANCE_STAGES = [
  { id: "before_start", label: "До старта" }, { id: "during_training", label: "Во время обучения" },
  { id: "on_graduation", label: "При выпуске" }, { id: "periodic", label: "Периодически" }, { id: "archive", label: "Архив" },
] as const;
export type ComplianceStage = typeof COMPLIANCE_STAGES[number]["id"];
export type Applicability = "applicable" | "not_applicable" | "needs_information";
export type LegalReviewStatus = "confirmed" | "needs_legal_review";
export type RuleCondition =
  | { op: "always" }
  | { op: "boolean"; field: ProfileBooleanField; value: boolean }
  | { op: "equals"; field: "legalForm" | "providerKind"; value: string }
  | { op: "program"; anyOf: readonly ProgramType[] }
  | { op: "all" | "any"; conditions: readonly RuleCondition[] };
export interface LegalSource {
  id: string; title: string; provision: string; primaryUrl: string; actDate: string;
  effectiveFrom: string | null; effectiveUntil: string | null; checkedOn: string;
  reviewStatus: LegalReviewStatus; limitation: string | null;
  evidenceFiles: readonly { file: string; sha256: string }[];
}
export interface RequirementDefinition {
  id: string; typeId: string; version: string; label: string; kind: "regular" | "special"; categoryId: string;
  stage: ComplianceStage; obligation: "document" | "process" | "record" | "chosen_form";
  condition: RuleCondition; conditionDescription: string; legalSources: readonly LegalSource[];
  reviewStatus: LegalReviewStatus; validFrom: string | null; validUntil: string | null;
  period: { kind: "continuous" | "per_program" | "per_group" | "per_event" | "reporting_year"; description: string };
  deadline: { description: string; rule: "before_activity" | "before_training" | "before_issue" | "by_event" | "annual"; monthDay: string | null };
  evidence: readonly string[]; ownerRole: string;
  retention: { sourceId: string | null; provision: string | null; duration: string | null; startsAt: string; description: string; reviewStatus: LegalReviewStatus; appliesTo: "undetermined" | "linked_registry" | "related_case" };
  existingDocTypes: readonly string[];
  existingDestination: "org" | "orders" | "protocols" | "certificates" | "diplomas" | "testimonials" | "programs" | "journals" | "counterparties";
  registryMappings: readonly { table: string; discriminator: string | null; identifiers: readonly string[]; note: string }[];
  creationGuidance: string;
}
export interface ApplicabilityDecision {
  requirementId: string; catalogVersion: string; profileRevision: number; decision: "not_applicable" | "applicable" | null;
  reason: string; decidedAt?: string; decidedBy?: string;
}
export interface ComplianceDocumentEvidence {
  id: string; type: string; file_url: string | null; current_version_id?: string | null; status?: string | null;
  deleted_at?: string | null; expires_at?: string | null;
}
export interface EvaluatedRequirement {
  requirement: RequirementDefinition; applicability: Applicability; ruleApplicability: Applicability;
  explanation: string; missingFields: string[]; reviewStatus: LegalReviewStatus;
  evidence: "missing" | "file_present" | "inactive"; documentId: string | null;
  decision: ApplicabilityDecision | null; decisionState: "none" | "current" | "stale" | "withdrawn"; nextAction: string;
}
export interface ComplianceEvaluation {
  snapshot: { catalogVersion: string; profileRevision: number | null; asOf: string; profile: EducationProfileV1 };
  requirements: EvaluatedRequirement[];
  summary: { applicable: number; notApplicable: number; needsInformation: number; needsLegalReview: number; filesPresent: number; missingEvidence: number; legalReadinessConfirmed: false };
  profileWarnings: string[];
  staleDecisions: ApplicabilityDecision[];
}
