import { describe, expect, it, vi } from "vitest";
import { BUILT_IN_TEMPLATES } from "@/components/organization/contract-template/builtInTemplates";
import { validateTemplateVariables } from "@/components/organization/contract-template/templateValidationRules";
import { getPreviewWithRealRequisites } from "@/components/organization/contract-template/realRequisitesPreview";
import { assertContractOutput, ContractFactsError, emptyContractFacts, resolveContractFacts, substituteContractTemplate, type ContractFactKey } from "../contractFacts";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { org, course, second, approvedBinding } from "./contractFacts.fixture";
import { createEmptyEducationProfile } from "@/lib/uc-compliance/model";
const client = (read: (args: Record<string, unknown>) => unknown) => ({ rpc: vi.fn(async (_name: string, args: Record<string, unknown>) => ({ data: read(args), error: null })) });

describe("Contract factual bindings and output guards", () => {
  it("uses exactly the centre's recorded license number/authority with provenance and never borrows checkedOn as issue date", async () => {
    const profile = createEmptyEducationProfile();
    profile.license = { ...profile.license, status: "declared_active", registryNumber: "Recorded centre number", authority: "Recorded centre authority", checkedOn: "2026-10-24", sourceUrl: "https://example.org/register" };
    const db = client(() => ({ organization_id: org, revision: 7, profile }));
    const facts = await resolveContractFacts(db, org, [], "{{org_license_number}} {{org_license_issuer}} {{org_license_date}}");
    expect(facts.organizationProfile).toEqual({ organizationId: org, revision: 7, license: profile.license });
    expect(substituteContractTemplate("{{org_license_number}} / {{org_license_issuer}}", {}, facts)).toBe("Recorded centre number / Recorded centre authority");
    expect(facts.org_license_date).toBeNull();
    try { substituteContractTemplate("{{org_license_date}}", {}, facts); throw Error("Expected missing date"); }
    catch (error) { expect(error).toMatchObject({ code: "MISSING_FACT", fields: ["org_license_date"] }); expect((error as Error).message).toContain("фактической датой"); }
  });

  it("rejects a foreign organization profile instead of using its license declaration", async () => {
    await expect(resolveContractFacts(client(() => ({ organization_id: second, revision: 1, profile: createEmptyEducationProfile() })), org, [], "{{org_license_number}}")).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });

  it.each(["suspended", "terminated", "declared_exempt"] as const)("retains %s provenance without presenting it as an active license", async status => {
    const profile = createEmptyEducationProfile(); profile.license = { ...profile.license, status, registryNumber: "Old number", authority: "Old authority" };
    const facts = await resolveContractFacts(client(() => ({ organization_id: org, revision: 2, profile })), org, [], "{{org_license_number}} {{org_license_issuer}}");
    expect(facts.organizationProfile?.license.status).toBe(status); expect(facts.org_license_number).toBeNull(); expect(facts.org_license_issuer).toBeNull();
  });

  it("validates the built-in full fallback date and all actually supported keys", () => {
    const text = BUILT_IN_TEMPLATES[0].text;
    expect(text).toContain("г. ______________ {{contract_date}}");
    expect(validateTemplateVariables(text)).toEqual([expect.objectContaining({ type: "ok" })]);
  });

  it.each([["dpo_upskilling", "Удостоверение о повышении квалификации"], ["dpo_retraining", "Диплом о профессиональной переподготовке"], ["professional_training", "Свидетельство о профессии рабочего, должности служащего"]])("reads approved %s facts and the existing document mapping", async (kind, documentName) => {
    const db = client(() => approvedBinding(course, "part_time", kind));
    const facts = await resolveContractFacts(db, org, [course], "{{education_form}} / {{document_type_name}}");
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("get_course_program_binding", { p_organization_id: org, p_course_id: course });
    expect(substituteContractTemplate("{{education_form}} / {{document_type_name}}", {}, facts)).toBe("Заочная / " + documentName);
    expect(facts.org_license_number).toBeNull();
  });

  it("keeps missing approved bindings missing instead of borrowing course FRDO or sales labels", async () => {
    const db = client(() => ({ revision: 0, binding: null, version: null, frdo_education_form: "Очная", license_number: "Untrusted sales" }));
    const facts = await resolveContractFacts(db, org, [course], "{{education_form}} {{document_type_name}}");
    expect(facts).toEqual(emptyContractFacts());
  });

  it.each(["foreign", "unapproved"])("refuses %s programme responses", async mode => {
    const db = client(() => { const raw = approvedBinding(); if (mode === "foreign") raw.binding.organization_id = second; else raw.version.state = "draft"; return raw; });
    await expect(resolveContractFacts(db, org, [course], "{{education_form}}")).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });

  it("does not describe several different programmes using the first programme's scalar", async () => {
    const db = client(args => approvedBinding(String(args.p_course_id), args.p_course_id === course ? "part_time" : "full_time", args.p_course_id === course ? "dpo_upskilling" : "dpo_retraining"));
    const facts = await resolveContractFacts(db, org, [course, second], "{{education_form}} {{document_type_name}}");
    expect(facts.education_form).toBeNull(); expect(facts.document_type_name).toBeNull();
    expect(() => substituteContractTemplate("{{education_form}}", {}, facts)).toThrow(ContractFactsError);
  });

  it("does not manufacture an education document for an internal nonformal programme", async () => {
    const facts = await resolveContractFacts(client(() => approvedBinding(course, "full_time", "internal_nonformal")), org, [course], "{{document_type_name}}");
    expect(facts.document_type_name).toBeNull();
  });

  it.each(["org_license_number", "org_license_date", "org_license_issuer", "education_form", "document_type_name"] as ContractFactKey[])("reports exactly the missing fact %s", key => {
    try { substituteContractTemplate(`Value {{${key}}}`, {}, emptyContractFacts()); throw Error("Expected missing fact"); }
    catch (error) { expect(error).toMatchObject({ code: "MISSING_FACT", fields: [key] }); }
  });

  it.each(["{{invented_fact}}", "{{contract_date"])("refuses unknown/malformed template %s before output", template => {
    expect(() => substituteContractTemplate(template, {}, emptyContractFacts())).toThrow(ContractFactsError);
  });

  it("rejects placeholders introduced by replacement values without recursive substitution", () => {
    expect(() => substituteContractTemplate("{{company_name}}", { "{{company_name}}": "{{contract_date}}", "{{contract_date}}": "24.10.2026" }, emptyContractFacts())).toThrow(ContractFactsError);
  });

  it("also guards appended signature/title HTML before output", () => {
    expect(() => assertContractOutput("<body>Complete text / {{signature_unknown}}</body>")).toThrow(ContractFactsError);
  });

  it("never presents sample license/programme values as real requisites", () => {
    const preview = getPreviewWithRealRequisites("{{org_name}} {{org_license_number}} {{education_form}} {{document_type_name}}", { org_name: "Actual profile" });
    expect(preview.text).toContain("Actual profile");
    expect(preview.text).toContain("[Не подтверждено: Номер лицензии]");
    expect(preview.text).not.toContain("Л035"); expect(preview.text).not.toContain("удостоверение о повышении квалификации");
    expect(preview.missing).toHaveLength(3);
  });
});
