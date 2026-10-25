import type {z} from 'zod';
import type * as c from './contract.ts';
export type Stream='dpo'|'po';
export type TemplateId='dpo20230116'|'po16102026';
export type FrozenFrdoFacts=z.infer<typeof c.issuanceFrdoFactsSchema>;
export type FoundationContext=z.infer<typeof c.foundationContextSchema>;
export type MappingEntry=z.infer<typeof c.mapperEntrySchema>;
export type FoundationInput=z.infer<typeof c.foundationInputSchema>;
export type MappedBatch=z.infer<typeof c.mappedBatchSchema>;
export type Row=z.infer<typeof c.rowSchema>;
export type Issue=z.infer<typeof c.issueSchema>;
export type Supplement=z.infer<typeof c.supplementReadSchema>;
/** Raw future write facts and currently readable masked facts are separate wire types. */
export type SupplementWriteFields=z.infer<typeof c.supplementFieldsSchema>;
export type SupplementFields=Supplement['fields'];
export type OfficialCell=string|number|null;
/** A future current actor/org/scope epoch must stay captured across every await.
 * No method in this module authenticates a caller or grants source access. */
export interface CurrentGuard {assertCurrent:()=>void;}
export interface PartProof {path:string;bytes:number;sha256:string;}
export interface WorkbookOutput {template_id:TemplateId;root_sha256:string;bytes:Uint8Array;byte_sha256:string;byte_size:number;mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';signing:{status:'not_verified'};row_count:number;parts:PartProof[];}
