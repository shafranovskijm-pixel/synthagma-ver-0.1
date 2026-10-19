import { z } from 'zod';

export const identificationUuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const timestamp = z.string().datetime({offset: true}).refine(value => /(?:Z|\+00:00)$/.test(value));
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const identificationCapabilities = z.object({canSubmit: z.boolean(), canReview: z.boolean(), canReject: z.boolean(), canReset: z.boolean(), canReadMedia: z.boolean()}).strict();
export const identificationMediaRef = z.object({identificationId: identificationUuid, sourceId: identificationUuid}).strict();
export const identificationRecord = z.object({
  identificationId: identificationUuid, organizationId: identificationUuid, studentUserId: identificationUuid,
  enrollmentId: identificationUuid.nullable(), revision, status: z.enum(['pending','verified','rejected','expired']),
  sourceKind: z.enum(['self_photo','manual_staff_claim','legacy_unclassified']),
  assurance: z.enum(['unreviewed','submitted','current_server_review','historical_unproven']),
  createdAt: timestamp, submittedAt: timestamp.nullable(), decidedAt: timestamp.nullable(), rejectionReason: z.string().max(1000).nullable(),
  media: identificationMediaRef.nullable(), projectionPresent: z.boolean(), capabilities: identificationCapabilities,
}).strict();
export const identificationEvent = z.object({eventId: identificationUuid, identificationId: identificationUuid, revision,
  action: z.enum(['submitted','verified','rejected','manual_verified','reset']), at: timestamp, reason: z.string().max(1000).nullable(), reviewerUserId: identificationUuid.nullable()}).strict();
export const identificationSubject = z.object({organizationId: identificationUuid, studentUserId: identificationUuid, requestedEnrollmentId: identificationUuid.nullable(),
  current: identificationRecord.nullable(), history: z.array(identificationRecord).max(50), events: z.array(identificationEvent).max(100), historyTruncated: z.boolean(),
  compatibility: z.object({historicalVerifiedObserved: z.boolean()}).strict(), capabilities: identificationCapabilities}).strict();
export const identificationStateResult = z.object({contractVersion: z.literal(1), subjects: z.array(identificationSubject).min(1).max(100)}).strict();
export const identificationMutationResult = z.object({contractVersion: z.literal(1), replayed: z.boolean(), record: identificationRecord, event: identificationEvent.nullable()}).strict();
export const identificationPreparation = z.object({contractVersion: z.literal(1), replayed: z.boolean(), identificationId: identificationUuid, sourceId: identificationUuid,
  revision: z.literal(1), bucket: z.literal('student-identification-media'), path: z.string(), expiresAt: timestamp,
  maxBytes: z.literal(5242880), mimeType: z.literal('image/jpeg')}).strict();
export type IdentificationRecord = z.infer<typeof identificationRecord>;
export type IdentificationSubject = z.infer<typeof identificationSubject>;
export type IdentificationMutation = z.infer<typeof identificationMutationResult>;
export type IdentificationPreparation = z.infer<typeof identificationPreparation>;
export type IdentificationMediaRef = z.infer<typeof identificationMediaRef>;
export type IdentificationAction = 'verify' | 'reject' | 'manual_verify' | 'reset';
export function identificationRecords(state: IdentificationSubject | null): IdentificationRecord[] {
  return [...new Map([...(state?.current ? [state.current] : []), ...(state?.history || [])].map(record => [record.identificationId,record])).values()];
}
export function identificationView(record: IdentificationRecord) {
  return {id:record.identificationId,status:record.status,photo_url:null,created_at:record.createdAt,verified_at:record.decidedAt,
    verified_by:null,rejection_reason:record.rejectionReason,canonical:record};
}

export function identificationAssuranceLabel(record: IdentificationRecord): string {
  if (record.assurance === 'historical_unproven') return 'Историческая запись — источник не подтверждён';
  if (record.sourceKind === 'manual_staff_claim') return 'Ручная отметка сотрудника — без фотографии';
  if (record.assurance === 'current_server_review') return 'Проверено сотрудником';
  return record.assurance === 'submitted' ? 'Фото отправлено на проверку' : 'Ожидает проверки';
}
