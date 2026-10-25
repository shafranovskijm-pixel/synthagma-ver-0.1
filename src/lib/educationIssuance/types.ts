import type { z } from 'zod';
import type * as c from './contract.ts';

/** Values enter these types only after strict wire validation. */
type Wire<T> = T extends (infer I)[] ? Wire<I>[] : T extends object ? { [K in keyof T]-?: Wire<T[K]> } : T;
export type IssuanceScope = Wire<z.infer<typeof c.issuanceScopeSchema>>;
export type IssuanceQuery = Wire<z.infer<typeof c.issuanceQuerySchema>>;
export type IssuanceRead = Wire<z.infer<typeof c.issuanceReadSchema>>;
export type IssuanceAction = Wire<z.infer<typeof c.issuanceActionSchema>>;
export type IssuanceMutation = Wire<z.infer<typeof c.issuanceMutationSchema>>;
export type IssuanceRecord = Wire<z.infer<typeof c.issuanceRecordSchema>>;
export type IssuanceCandidate = Wire<z.infer<typeof c.issuanceCandidateSchema>>;
export type IssuanceEvent = Wire<z.infer<typeof c.issuanceEventSchema>>;
export type IssuanceChange = Wire<z.infer<typeof c.issuanceChangeSchema>>;
export type IssuancePreview = Wire<z.infer<typeof c.issuancePreviewSchema>>;
export type ChangePreview = Wire<z.infer<typeof c.issuanceChangePreviewSchema>>;
export type IssuanceSource = Wire<z.infer<typeof c.issuanceSourceSchema>>;
export type IssuanceBasis = Wire<z.infer<typeof c.issuanceBasisSchema>>;
export type IssuanceHandover = Wire<z.infer<typeof c.issuanceHandoverSchema>>;
export type IssuanceCapabilities = Wire<z.infer<typeof c.issuanceCapabilitiesSchema>>;
export type IssuanceExport = Wire<z.infer<typeof c.issuanceExportSchema>>;
export type IssuanceSnapshot = Wire<z.infer<typeof c.issuanceExportSnapshotSchema>>;
export type WithdrawalState = Wire<z.infer<typeof c.withdrawalStateSchema>>;
export type WithdrawalEvent = Wire<z.infer<typeof c.withdrawalEventSchema>>;
export type WithdrawalPreview = Wire<z.infer<typeof c.withdrawalPreviewSchema>>;
export type WithdrawalBasis = Wire<z.infer<typeof c.withdrawalBasisSchema>>;
export type IssuanceErrorCode = z.infer<typeof c.issuanceErrorSchema>['code'];

export type IssuanceChangeIntent = Wire<z.infer<typeof c.issuanceChangeIntentSchema>>;
export type IssuancePreparationPlan = Wire<z.infer<typeof c.issuancePreparationPlanSchema>>;
export type IssuancePreparation = Wire<z.infer<typeof c.issuancePreparationSchema>>;
export type IssuancePreparationMutation = Wire<z.infer<typeof c.issuancePreparationMutationSchema>>;
export type IssuanceArtifactFinalRef = Wire<z.infer<typeof c.issuanceArtifactFinalRefSchema>>;
export type IssuanceTemplateRef = Wire<z.infer<typeof c.issuanceTemplateRefSchema>>;