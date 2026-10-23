import {z} from 'zod';
import * as foundation from '../frdoFoundation/contract';
import {canonicalJson,deepFreeze,ensureCurrent,sha256} from '../frdoFoundation/hash';
import type {CurrentGuard,FoundationInput} from '../frdoFoundation/types';
import {captureFrozenPacket} from './canonicalCapture';
import {PacketInvariantError,verifyFrozenCapture} from './invariants';

/** An explicit per-packet organization fact, not platform/legal verification.
 * A caller supplies an exact private source revision, never its byte proof. */
export const issuerReviewIntentSchema=z.discriminatedUnion('regime',[
 z.object({regime:z.literal('unconfirmed'),evidence:z.null(),review_note:z.null()}).strict(),
 z.object({regime:z.literal('ordinary_rf'),evidence:foundation.sourceRefSchema,review_note:z.string().min(1).max(2000).refine(value=>value.trim().length>0)}).strict(),
 z.object({regime:z.literal('joint_rf_foreign'),evidence:foundation.sourceRefSchema,review_note:z.string().min(1).max(2000).refine(value=>value.trim().length>0)}).strict(),
]);
export type IssuerReviewIntent=z.infer<typeof issuerReviewIntentSchema>;
export const unconfirmedIssuerReview:IssuerReviewIntent=Object.freeze({regime:'unconfirmed',evidence:null,review_note:null});
export const issuerReviewProjectionSchema=z.object({fact_kind:z.literal('operator_recorded_issuer_regime'),regime:z.enum(['unconfirmed','ordinary_rf','joint_rf_foreign']),
 evidence:foundation.sourceProjectionSchema,review_note:z.string().min(1).max(2000).nullable(),recorded_by:foundation.recordRefSchema.shape.user_id.nullable(),recorded_at:z.string().max(64).datetime({offset:true}),
 legal_policy_verified:z.literal(false),external_origin_verified:z.literal(false)}).strict();

/** Used before the single J mapper. No country/address, platform role, operator
 * appointment or browser checkbox upgrades an unconfirmed regime to ordinary. */
export function withReviewedIssuerRegime(input:FoundationInput,intent:unknown):FoundationInput{
 const review=issuerReviewIntentSchema.parse(intent);
 return {...input,context:{...input.context,issuer_regime:review.regime}};
}

/** The outer trusted resolver has read/hashed this exact private version. This
 * function binds it to the frozen CAS domain; it does not authenticate that resolver.
 * The SQL commit must independently check current actor, ALL actual required sources,
 * source object identities/revisions and every subject before accepting any result. */
export async function captureReviewedPacket(input:FoundationInput,intent:unknown,verifiedEvidence:unknown,guard:CurrentGuard){
 ensureCurrent(guard);const review=issuerReviewIntentSchema.parse(structuredClone(intent));
 if(review.regime!=='ordinary_rf')throw new PacketInvariantError('READINESS_BLOCKED');
 const proof=foundation.sealedEvidenceSchema.parse(structuredClone(verifiedEvidence));
 if(canonicalJson(review.evidence)!==canonicalJson(proof.source))throw new PacketInvariantError('SOURCE_CHANGED');
 const captured=await captureFrozenPacket(withReviewedIssuerRegime(input,review),guard);ensureCurrent(guard);
 const sourceByRef=new Map(captured.source_cas.sources.map(value=>[canonicalJson(value.source),value])),key=canonicalJson(proof.source),previous=sourceByRef.get(key);
 if(previous&&canonicalJson(previous)!==canonicalJson(proof))throw new PacketInvariantError('SOURCE_CHANGED');
 sourceByRef.set(key,proof);
 const {snapshot_sha256:ignored,...body}=captured;void ignored;
 const next={...body,source_cas:{...body.source_cas,sources:[...sourceByRef].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,value])=>value)}};
 const snapshot_sha256=await sha256(canonicalJson(next));ensureCurrent(guard);
 return deepFreeze({capture:await verifyFrozenCapture({...next,snapshot_sha256},guard),issuer_intent:review});
}
