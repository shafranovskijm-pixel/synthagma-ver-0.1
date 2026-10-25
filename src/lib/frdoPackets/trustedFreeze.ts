import type {z} from 'zod';
import {BOUNDS,canonicalJson,ensureCurrent,sha256} from '../frdoFoundation/hash.ts';
import type {CurrentGuard} from '../frdoFoundation/types.ts';
import {PacketInvariantError,verifyFrozenCapture} from './invariants.ts';
import * as runtime from './runtimeContract.ts';
import {issuerReviewIntentSchema} from './issuerReview.ts';
import type {FrozenCapture} from './types.ts';
import type {correctionPlanSchema} from '../frdoFoundation/contract.ts';

/** Shared exact domain mirrored by SQL canonical hashing; never jsonb::text SHA.
 * Explicit review evidence/source epoch + every mapped subject lives in capture. */
export function previewBinding(capture:FrozenCapture,issuerIntent:unknown,correction:z.infer<typeof correctionPlanSchema>|null){
 const intent=issuerReviewIntentSchema.parse(issuerIntent),context=capture.mapped_batch.context;
 return {schema_version:1,abi_revision:runtime.RUNTIME_ABI_REVISION,organization_id:context.organization_id,scope:context.scope,
 actor_id:context.actor_id,snapshot_sha256:capture.snapshot_sha256,issuer_review:intent,correction};
}
export async function reviewedPreviewHash(capture:FrozenCapture,issuerIntent:unknown,correction:z.infer<typeof correctionPlanSchema>|null,guard:CurrentGuard){
 ensureCurrent(guard);const hash=await sha256(canonicalJson(previewBinding(capture,issuerIntent,correction)));ensureCurrent(guard);return hash;
}
/** Internal payload integrity only. The service entry still binds a real original
 * JWT-verified pending request; SQL re-locks canonical rights, exact required sources
 * and all subjects before persistence. This is not permission granted by a hash. */
export async function verifyTrustedFreezeCurrent(input:unknown,guard:CurrentGuard){
 ensureCurrent(guard);canonicalJson(input,BOUNDS.inputBytes);const value=runtime.trustedFreezeCurrentSchema.parse(structuredClone(input));
 const hash=await sha256(canonicalJson(value.command));ensureCurrent(guard);
 if(hash!==value.command_payload_sha256)throw new PacketInvariantError('IDEMPOTENCY_CONFLICT');
 const capture=await verifyFrozenCapture(value.capture,guard);ensureCurrent(guard);const action=value.command.action;
 if(action.kind!=='freeze_preview'&&action.kind!=='create_correction')throw new PacketInvariantError('INVALID_REQUEST');
 if(await reviewedPreviewHash(capture,action.issuer_review,value.correction,guard)!==value.expected_preview_hash)throw new PacketInvariantError('SOURCE_CHANGED');
 ensureCurrent(guard);return value;
}
