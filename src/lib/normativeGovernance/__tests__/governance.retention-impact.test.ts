// Eight affected tests over real catalog metadata; no legal approval or database.
import {beforeAll,describe,it,expect} from 'vitest';
import {CATALOG_VERSION,CATALOG_AS_OF,LEGAL_SOURCES,REQUIREMENTS} from '@/lib/uc-compliance/catalog';
import type {LegalSource,RequirementDefinition} from '@/lib/uc-compliance/model';
import {createNormativeManifest,verifyNormativeManifest,type NormativeManifest} from '@/lib/normativeGovernance/manifest';
import {manifestImpact,parseGovernanceSnapshot,DESIGNATED_NORMATIVE_OWNER} from '@/lib/normativeGovernance/model';
const allIds: string[]=["admission_rules","attestation_protocol","attestation_rules","certificate_qualification","charter","commission_orders","credit_rules","diploma_retraining","doc_forms_approval","edu_activity_order","edu_relations","elearning_rules","electronic_docs_order","electronic_docs_rules","enrollment_order","expulsion_order","expulsion_rules","license","paid_services","pedagogical_council","personal_data","practice_rules","program_approval","program_dev_rules","qualification_issuance","registration","salary_rules","schedule_approval","self_examination_report","testimonial_position","testimonial_profession","vsoko"];
const educationIds: string[]=["admission_rules","attestation_rules","charter","credit_rules","doc_forms_approval","edu_relations","elearning_rules","electronic_docs_order","electronic_docs_rules","enrollment_order","expulsion_order","expulsion_rules","license","paid_services","pedagogical_council","qualification_issuance","self_examination_report","vsoko"];
const legacySha='76a14df756bf5484ca86dc094a2e9e407d5396183886bd84faa15d444bb849e3';
let original:NormativeManifest;
const build=(sources:LegalSource[],requirements:RequirementDefinition[]=structuredClone(REQUIREMENTS as RequirementDefinition[]))=>createNormativeManifest({catalogVersion:CATALOG_VERSION,asOf:CATALOG_AS_OF,sources,requirements});
const sources=()=>structuredClone(Object.values(LEGAL_SOURCES)) as LegalSource[];
const changed=(id:string)=>sources().map(s=>s.id===id?{...s,limitation:(s.limitation??'')+' SYNTHETIC retention impact only'}:s);
const extra=(id:string):LegalSource=>({...structuredClone(LEGAL_SOURCES.archive),id,title:'SYNTHETIC metadata only '+id,reviewStatus:'needs_legal_review'});
const requirement=(id:string,retentionId:unknown):RequirementDefinition=>({...structuredClone(REQUIREMENTS[0]),id,typeId:id,version:CATALOG_VERSION+':'+id,legalSources:[structuredClone(LEGAL_SOURCES.education)],retention:{...structuredClone(REQUIREMENTS[0].retention),sourceId:retentionId as string|null}});
beforeAll(async()=>{original=await build(sources());await verifyNormativeManifest(original);});
describe('UC030 retention source derived impact preserves immutable legacy manifests',()=>{
 it('RI-U1 archive-only metadata affects all real32 while old sourceIds and requirement hashes stay exact',async()=>{
  expect(original.sha256).toBe(legacySha);expect(original.sources).toHaveLength(12);expect(original.requirements.map(r=>r.id).sort()).toEqual(allIds);
  expect(original.requirements.every(r=>!r.sourceIds.includes('LEGAL-28')&&JSON.parse(r.payloadJson).retention.sourceId==='LEGAL-28')).toBe(true);
  const after=await build(changed('LEGAL-28')),impact=manifestImpact(original,after);
  expect(impact.changedSourceIds).toEqual(['LEGAL-28']);expect(impact.changedRequirementIds).toEqual([]);expect(impact.affectedRequirementIds).toEqual(allIds);
  expect(after.requirements).toEqual(original.requirements);
 });
 it('RI-U2 full before/after raw payloads hashes and canonical validation are unchanged by reading impact',async()=>{
  const after=await build(changed('LEGAL-28')),beforeRaw=JSON.stringify(original),afterRaw=JSON.stringify(after);
  manifestImpact(original,after);await verifyNormativeManifest(original);await verifyNormativeManifest(after);
  expect(JSON.stringify(original)).toBe(beforeRaw);expect(JSON.stringify(after)).toBe(afterRaw);expect(original.sha256).toBe(legacySha);
  for(const row of original.requirements)expect(after.requirements.find(r=>r.id===row.id)).toEqual(row);
 });
 it('RI-U3 education-only source metadata preserves exactly18 direct impacts instead of broadening to32',async()=>{
  const after=await build(changed('LEGAL-01')),impact=manifestImpact(original,after);
  expect(educationIds).toHaveLength(18);expect(impact.changedSourceIds).toEqual(['LEGAL-01']);expect(impact.changedRequirementIds).toEqual([]);expect(impact.affectedRequirementIds).toEqual(educationIds);
 });
 it('RI-U4 declared retention-only dependency impacts its requirement but an unused source does not',async()=>{
  const retention=extra('synthetic_retention'),unused=extra('synthetic_unused'),requirements=[requirement('retention_only',retention.id)];
  const before=await build([structuredClone(LEGAL_SOURCES.education),retention,unused],requirements);
  const retentionChanged=await build([structuredClone(LEGAL_SOURCES.education),{...retention,limitation:'SYNTHETIC changed'},unused],requirements);
  const unusedChanged=await build([structuredClone(LEGAL_SOURCES.education),retention,{...unused,limitation:'SYNTHETIC changed'}],requirements);
  expect(manifestImpact(before,retentionChanged).affectedRequirementIds).toEqual(['retention_only']);expect(manifestImpact(before,retentionChanged).changedRequirementIds).toEqual([]);
  expect(manifestImpact(before,unusedChanged).changedSourceIds).toEqual([unused.id]);expect(manifestImpact(before,unusedChanged).affectedRequirementIds).toEqual([]);
 });
 it('RI-U5 before-side removed dependencies and direct-plus-retention duplicates keep one affected ID',async()=>{
  const retention=extra('synthetic_retention'),first=requirement('removed_requirement',retention.id),second=requirement('duplicate_dependency','LEGAL-01');
  const before=await build([structuredClone(LEGAL_SOURCES.education),retention],[first,second]);
  const removedSource=await build([structuredClone(LEGAL_SOURCES.education)],[first,second]);
  expect(manifestImpact(before,removedSource).changedSourceIds).toEqual([retention.id]);expect(manifestImpact(before,removedSource).affectedRequirementIds).toEqual([first.id]);
  const removedBoth=await build([structuredClone(LEGAL_SOURCES.education)],[second]);expect(manifestImpact(before,removedBoth).affectedRequirementIds).toEqual([first.id]);
  const directChanged=await build([{...structuredClone(LEGAL_SOURCES.education),limitation:'SYNTHETIC changed'},retention],[first,second]);
  expect(manifestImpact(before,directChanged).affectedRequirementIds).toEqual([second.id,first.id].sort());
 });
 it('RI-U6 missing null arrays and non-string retention fields add no dependency and invalid raw JSON is rejected',async()=>{
  const retention=extra('synthetic_retention');
  for(const shape of [undefined,null,[],{}, {sourceId:null},{sourceId:42},{sourceId:false},{sourceId:[]},{sourceId:{}},{sourceId:'unknown_unlisted'}]){
   const req=requirement('invalid_retention',null) as unknown as Record<string,unknown>;
   if(shape===undefined)delete req.retention;else req.retention=shape;
   const before=await build([structuredClone(LEGAL_SOURCES.education),retention],[req as unknown as RequirementDefinition]);
   const after=await build([structuredClone(LEGAL_SOURCES.education),{...retention,limitation:'SYNTHETIC changed'}],[req as unknown as RequirementDefinition]);
   await verifyNormativeManifest(before);await verifyNormativeManifest(after);expect(manifestImpact(before,after).affectedRequirementIds).toEqual([]);
  }
  const bad=structuredClone(original);bad.requirements[0].payloadJson='{';await expect(verifyNormativeManifest(bad)).rejects.toThrow();
  expect(()=>manifestImpact(bad,bad)).toThrow(); // Exported helper contract is verified canonical manifests, not arbitrary typed objects.
 });
 it('RI-U7 unchanged input yields no impact and keeps unmapped custom-template and preserved-decision boundaries',()=>{
  const raw=JSON.stringify(original),impact=manifestImpact(original,original);
  expect(impact).toEqual({changedSourceIds:[],changedRequirementIds:[],affectedRequirementIds:[],templateCoverage:'explicit_metadata_only_custom_templates_unmapped',existingDecisionsPreserved:true});
  expect(JSON.stringify(original)).toBe(raw);
 });
 it('RI-U8 derived impact never mutates governance approval publication runtime or centre acceptance flags',async()=>{
  const org='10000000-0000-4000-8000-000000000001',id='20000000-0000-4000-8000-000000000001';
  const record={schemaVersion:1,organizationId:org,profileRevision:1,actorId:DESIGNATED_NORMATIVE_OWNER,serverAsOf:'2026-10-25T00:00:00.000Z',globalSequence:1,centreSequence:0,canManage:true,canAccept:true,manifests:[{id,revision:1,predecessorId:null,createdAt:'2026-10-25T00:00:00.000Z',createdBy:DESIGNATED_NORMATIVE_OWNER,manifest:original}],selectedManifestId:id,events:[],historyComplete:true,projection:{ownerAssigned:true,reviewDueOn:'2026-10-26',checkedSourceIds:[],legalReviewed:false,published:false,runtimeVerified:false,centreAccepted:false,acceptedProfileRevision:null,legalComplianceConfirmed:false},impact:{changedSourceIds:[],changedRequirementIds:[],affectedRequirementIds:[],affectedDecisions:[],documentTypeIds:[],documentCount:0,customTemplateCoverage:'unmapped',centresCoverage:'current_organization_only',existingDecisionsPreserved:true}};
  const before=JSON.stringify(record),parsed=await parseGovernanceSnapshot(record,org),after=await build(changed('LEGAL-28'));
  expect(manifestImpact(original,after).affectedRequirementIds).toHaveLength(32);expect(JSON.stringify(record)).toBe(before);
  expect(parsed.projection).toEqual(record.projection);expect(parsed.projection.checkedSourceIds).toEqual([]);expect(parsed.projection.legalReviewed||parsed.projection.published||parsed.projection.runtimeVerified||parsed.projection.centreAccepted).toBe(false);
 });
});
