// @vitest-environment node
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {createEmptyEducationProfile,parseEducationProfile,isEducationProfile,COMPLIANCE_STAGES,type EducationProfileV1,type ApplicabilityDecision} from '../model.ts';
import {REQUIREMENTS,REQUIREMENT_IDS,RELATED_REGISTRIES,CATALOG_VERSION,LEGAL_SOURCES} from '../catalog.ts';
import {evaluateRequirements,evaluateCondition} from '../evaluate.ts';
const asOf="2026-10-18";
function profile(patch:Partial<EducationProfileV1>={}):EducationProfileV1{return {...createEmptyEducationProfile(),legalForm:"legal_entity",providerKind:"educational_organization",educationalActivity:true,programTypes:["dpo_upskilling"],usesElearning:false,usesDistanceLearning:false,paidEducation:false,hasEmployees:false,hiresTeachers:false,hasPracticalTraining:false,usesNetworkForm:false,servesMinors:false,servesDisabilities:false,specialAreas:[],...patch};}
const evaluate=(p=profile(),options:Parameters<typeof evaluateRequirements>[1]={})=>evaluateRequirements(p,{asOf,profileRevision:1,...options});
const task=(id:string,p=profile(),options:Parameters<typeof evaluateRequirements>[1]={})=>evaluate(p,options).requirements.find(r=>r.requirement.id===id)!;
const declaration=(patch:Partial<ApplicabilityDecision>={}):ApplicabilityDecision=>({requirementId:"charter",catalogVersion:CATALOG_VERSION,profileRevision:1,decision:"not_applicable",reason:"Центр указал ИП; устав отсутствует по организационной форме",...patch});

describe("saved profile contract",()=>{
 it("starts with unknown facts, preserving explicit false and empty selections",()=>{
  const empty=createEmptyEducationProfile();expect(isEducationProfile(empty)).toBe(true);expect(empty.legalForm).toBeNull();expect(empty.programTypes).toBeNull();expect(empty.hasEmployees).toBeNull();expect(empty.license.status).toBeNull();
  const p=profile({programTypes:[],specialAreas:[],usesDistanceLearning:false});expect(parseEducationProfile(p)).toEqual(p);expect(p).not.toHaveProperty("hasPedagogicalCouncil");
 });
 it("rejects missing/unknown keys, invented official verification and duplicate selections",()=>{
  const p:any=profile();delete p.paidEducation;expect(isEducationProfile(p)).toBe(false);
  expect(isEducationProfile({...profile(),officiallyVerified:true})).toBe(false);
  expect(isEducationProfile({...profile(),license:{...profile().license,officiallyVerified:true}})).toBe(false);
  expect(isEducationProfile(profile({programTypes:["dpo_upskilling","dpo_upskilling"]}))).toBe(false);
 });
 it.each(["http://official.invalid/record","https://user:secret@official.invalid/record","javascript:alert(1)","https://official.invalid/ record"])("rejects unsafe license source %s",url=>expect(isEducationProfile(profile({license:{...profile().license,sourceUrl:url}}))).toBe(false));
 it("checks real date, https URL and exact version/document pairing shape",()=>{
  expect(isEducationProfile(profile({license:{...profile().license,checkedOn:"2026-02-30"}}))).toBe(false);
  expect(isEducationProfile(profile({license:{...profile().license,evidenceVersionId:"00000000-0000-4000-8000-000000000001"}}))).toBe(false);
  expect(isEducationProfile(profile({license:{...profile().license,sourceUrl:"https://islod.obrnadzor.gov.ru/rlic/",checkedOn:"2026-10-18"}}))).toBe(true);
 });
});
describe("versioned catalog preservation and evidence",()=>{
 it("preserves exactly all 25 regular and seven special IDs from the existing source",()=>{
  const source=readFileSync("src/hooks/useOrgDocumentsManager.ts","utf8").split("export const ALL_CATEGORIES")[0];
  const legacy=[...source.matchAll(/type:\s*"([^"]+)"/g)].map(m=>m[1]);expect(legacy).toHaveLength(32);
  expect([...REQUIREMENT_IDS].sort()).toEqual(legacy.sort());expect(new Set(REQUIREMENT_IDS).size).toBe(32);
  expect(REQUIREMENTS.filter(r=>r.kind==="regular")).toHaveLength(25);expect(REQUIREMENTS.filter(r=>r.kind==="special")).toHaveLength(7);
 });
 it("gives every requirement precise source, dates, conditions, responsibility, evidence and qualified retention",()=>{
  for(const r of REQUIREMENTS){expect(r.version).toBe(`${CATALOG_VERSION}:${r.id}`);expect(r.typeId).toBe(r.id);expect(r.legalSources.length).toBeGreaterThan(0);
   for(const s of r.legalSources){expect(s.provision.length).toBeGreaterThan(0);expect(s.primaryUrl).toMatch(/^https:\/\//);expect(s.checkedOn).toBe(asOf);expect(s.actDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);if(s.reviewStatus==="needs_legal_review")expect(s.limitation).toBeTruthy();}
   expect(r.conditionDescription).toBeTruthy();expect(r.period.description).toBeTruthy();expect(r.deadline.description).toBeTruthy();expect(r.evidence.length).toBeGreaterThan(0);expect(r.ownerRole).toBeTruthy();expect(r.retention.startsAt).toBeTruthy();expect(r.retention.description).toBeTruthy();expect(r.existingDocTypes).toContain(r.id);
  }
  expect(COMPLIANCE_STAGES.map(s=>s.id)).toEqual(["before_start","during_training","on_graduation","periodic","archive"]);
 });
 it("keeps group, issuance, signature and commercial registries distinct with original identifiers",()=>{
  expect(RELATED_REGISTRIES.find(r=>r.table==="group_documents")!.identifiers).toContain("class_journal");
  expect(RELATED_REGISTRIES.find(r=>r.table==="document_signatures")!.identifiers).toContain("education_document");
  expect(task("certificate_qualification").requirement.registryMappings).toEqual(expect.arrayContaining([expect.objectContaining({table:"education_document_records",identifiers:["certificate"]})]));
  expect(task("paid_services").requirement.registryMappings.some(m=>m.table==="org_contracts")).toBe(true);
 });
 it("matches discriminator/key columns to actual captured production metadata and values to existing types",()=>{
  const schema=JSON.parse(readFileSync("src/lib/uc-compliance/__tests__/fixtures/registry-schema-20261018.json","utf8")).columns as Record<string,string[]>;
  for(const r of REQUIREMENTS)for(const mapping of r.registryMappings){expect(schema[mapping.table],mapping.table).toBeDefined();if(mapping.discriminator)expect(schema[mapping.table],mapping.table).toContain(mapping.discriminator);}
  for(const table of ["org_contracts","company_documents","org_billing_documents","subscription_invoices","commercial_proposals"])for(const key of RELATED_REGISTRIES.find(r=>r.table===table)!.identifiers)expect(schema[table]).toContain(key);
  const groupTypes=readFileSync("src/lib/group-docs/schema.ts","utf8").split("export interface GenerationContext")[0];
  for(const type of RELATED_REGISTRIES.find(r=>r.table==="group_documents")!.identifiers)expect(groupTypes).toContain(`"${type}"`);
  const journals=readFileSync("src/components/organization/JournalsManager.tsx","utf8");
  for(const r of REQUIREMENTS)for(const m of r.registryMappings.filter(m=>m.table==="journal_instances"))for(const type of m.identifiers)expect(journals).toContain(`id: "${type}"`);
  const signatures=JSON.parse(readFileSync("supabase/tests/fixtures/uc-signature-schema-20261018.json","utf8"));
  const signatureTypes=signatures.constraints.find((c:{name:string})=>c.name==="document_signatures_document_type_check").definition;
  for(const type of RELATED_REGISTRIES.find(r=>r.table==="document_signatures")!.identifiers)expect(signatureTypes).toContain(`'${type}'::text`);
 });
 it("pins confirmed official evidence to the existing audit manifest filenames and hashes",()=>{
  expect(LEGAL_SOURCES.dpo.primaryUrl).toBe("https://obrnadzor.tatarstan.ru/file/pub/pub_4580649.pdf");
  expect(LEGAL_SOURCES.dpo.evidenceFiles).toEqual([{file:"dpo-266-tatarstan.pdf",sha256:"9f0aa6a7faa2d186517616c9e4d9e6db25edf42062280a2ab05932a6f6eb1c1c"}]);
  for(const s of Object.values(LEGAL_SOURCES).filter(s=>s.reviewStatus==="confirmed")){expect(s.evidenceFiles.length).toBeGreaterThan(0);for(const f of s.evidenceFiles){expect(f.file).not.toMatch(/[\\/]/);expect(f.sha256).toMatch(/^[a-f0-9]{64}$/);}}
 });
});
describe("explainable tri-state work plan",()=>{
 it("does not infer activity, legal form, program or employment from an empty profile",()=>{
  const p=createEmptyEducationProfile(),res=evaluate(p);expect(task("charter",p).applicability).toBe("needs_information");expect(task("salary_rules",p).applicability).toBe("needs_information");expect(task("program_dev_rules",p).missingFields).toEqual(expect.arrayContaining(["educationalActivity","programTypes"]));expect(res.summary.legalReadinessConfirmed).toBe(false);expect(res.summary.needsInformation).toBeGreaterThan(20);
 });
 it("uses correct three-valued boolean logic without making false or [] unknown",()=>{
  const empty=createEmptyEducationProfile();expect(evaluateCondition({op:"all",conditions:[{op:"boolean",field:"paidEducation",value:true},{op:"boolean",field:"hasEmployees",value:true}]},{...empty,paidEducation:false}).value).toBe("not_applicable");
  expect(evaluateCondition({op:"any",conditions:[{op:"boolean",field:"usesDistanceLearning",value:true},{op:"boolean",field:"usesElearning",value:true}]},{...empty,usesDistanceLearning:true}).value).toBe("applicable");
  expect(task("program_dev_rules",profile({programTypes:[]})).applicability).toBe("not_applicable");
 });
 it("makes direct IP/internal course differ from licensed educational organization without deleting old rows",()=>{
  const internal=profile({legalForm:"individual_entrepreneur",providerKind:"internal_nonformal",educationalActivity:false,programTypes:["internal_nonformal"]});
  for(const id of ["charter","admission_rules","pedagogical_council","certificate_qualification","self_examination_report"])expect(task(id,internal).applicability).toBe("not_applicable");
  expect(task("charter").applicability).toBe("applicable");expect(task("certificate_qualification").applicability).toBe("applicable");expect(task("personal_data",internal).applicability).toBe("applicable");expect(evaluate(internal).requirements).toHaveLength(32);
 });
 it("switches conditional tasks for paid, distance, practice and employees",()=>{
  const p=profile({paidEducation:true,usesDistanceLearning:true,hasPracticalTraining:true,hasEmployees:true});
  for(const id of ["paid_services","elearning_rules","practice_rules","salary_rules"])expect(task(id,p).applicability).toBe("applicable");
  for(const id of ["paid_services","elearning_rules","practice_rules","salary_rules"])expect(task(id).applicability).toBe("not_applicable");
 });
 it("does not mistake IP/DPO or contradictory activity for a confirmed exemption",()=>{
  const p=profile({legalForm:"individual_entrepreneur",providerKind:"entrepreneur_direct"});expect(task("certificate_qualification",p).applicability).toBe("needs_information");expect(evaluate(p).profileWarnings.length).toBeGreaterThan(0);
  expect(task("program_dev_rules",profile({educationalActivity:false})).applicability).toBe("needs_information");
 });
 it("keeps regulated areas and reviewed legal periods unresolved",()=>{
  expect(task("certificate_qualification",profile({specialAreas:["medical_pharmaceutical"]})).reviewStatus).toBe("needs_legal_review");
  expect(task("program_dev_rules",profile(),{asOf:"2031-09-01"}).applicability).toBe("needs_information");expect(task("program_dev_rules",profile(),{asOf:"2025-08-31"}).reviewStatus).toBe("needs_legal_review");
 });
 it("does not evaluate a future catalog release as a historical legal verdict",()=>{
  const result=evaluate(profile(),{asOf:"2026-10-17"});expect(result.requirements.every(r=>r.applicability==="needs_information")).toBe(true);
 });
 it.each(["suspended","terminated"] as const)("shows declared %s license warning without automatically changing business access",status=>{
  const result=evaluate(profile({license:{...profile().license,status}}));expect(result.profileWarnings.join(" ")).toContain("приостановленное или прекращённое");expect(result.profileWarnings.join(" ")).toContain("не изменяет доступ автоматически");expect(result.requirements.find(r=>r.requirement.id==="certificate_qualification")!.ruleApplicability).toBe("applicable");
 });
 it("does not require both profession and position certificates for every PO learner",()=>{
  const p=profile({programTypes:["professional_training"]});for(const id of ["testimonial_profession","testimonial_position"])expect(task(id,p).applicability).toBe("needs_information");
  expect(task("certificate_qualification",p).applicability).toBe("not_applicable");
 });
 it("license facts remain self-declared and incomplete/exempt claims need follow-up",()=>{
  expect(task("license").missingFields).toContain("license.status");const exempt=profile({license:{...profile().license,status:"declared_exempt",exemptionReason:"Непосредственное обучение ИП"}});
  expect(task("license",exempt).applicability).toBe("needs_information");expect(task("license",exempt).reviewStatus).toBe("needs_legal_review");
 });
 it("counts only real current files and never treats all uploaded rows as legal approval",()=>{
  const docs=REQUIREMENTS.map((r,i)=>({id:`document-${i}`,type:r.id,file_url:"private/path.pdf",status:"active"}));const res=evaluate(profile(),{documents:docs});expect(res.summary.filesPresent).toBeGreaterThan(0);expect(res.summary.legalReadinessConfirmed).toBe(false);expect(task("charter",profile(),{documents:docs}).nextAction).toContain("не подтверждает готовность");
  for(const patch of [{file_url:null},{status:"archived"},{deleted_at:asOf},{expires_at:"2026-10-17"},{expires_at:"2026-99-99"},{expires_at:"2026-02-30"},{status:"draft"}])expect(task("charter",profile(),{documents:[{id:"doc",type:"charter",file_url:"file.pdf",...patch}]}).evidence).toBe("inactive");
 });
 it("snapshots profile/catalog/revision/date without retaining mutable caller references",()=>{
  const p=profile(),res=evaluate(p,{profileRevision:7});p.programTypes!.push("professional_training");expect(res.snapshot.profile.programTypes).toEqual(["dpo_upskilling"]);expect(res.snapshot).toMatchObject({catalogVersion:CATALOG_VERSION,profileRevision:7,asOf});
  expect(()=>evaluate(profile(),{asOf:"2026-02-30"})).toThrow();expect(()=>evaluate(profile(),{profileRevision:-1})).toThrow();
 });
});
describe("organization declarations and history",()=>{
 it("preserves reason but conflicting non-applicability cannot erase an applicable rule",()=>{
  const result=task("charter",profile(),{decisions:[declaration()]});expect(result.decisionState).toBe("current");expect(result.ruleApplicability).toBe("applicable");expect(result.applicability).toBe("needs_information");expect(result.explanation).toContain(declaration().reason);
 });
 it("accepts a motivated non-applicability matching the profile without certifying law",()=>{
  const p=profile({legalForm:"individual_entrepreneur",providerKind:"entrepreneur_direct",programTypes:["professional_training"]}),res=task("charter",p,{decisions:[declaration()]});expect(res.applicability).toBe("not_applicable");expect(res.decisionState).toBe("current");expect(res.explanation).toContain("не официальная");
 });
 it.each([{catalogVersion:"older-catalog"},{profileRevision:2}])("retains stale declaration as history without applying it: %j",patch=>{
  const d=declaration(patch),res=evaluate(profile(),{decisions:[d]});expect(res.staleDecisions).toEqual([d]);expect(res.requirements.find(r=>r.requirement.id==="charter")!).toMatchObject({decisionState:"stale",applicability:"applicable"});
 });
 it("withdrawn, unsaved-profile and empty-reason declarations cannot bypass the rule",()=>{
  expect(task("charter",profile(),{decisions:[declaration({decision:null})]})).toMatchObject({decisionState:"withdrawn",applicability:"applicable"});
  expect(task("charter",profile(),{profileRevision:0,decisions:[declaration({profileRevision:0})]}).decisionState).toBe("stale");
  expect(task("charter",profile(),{decisions:[declaration({reason:" "})]}).applicability).toBe("needs_information");
 });
});
