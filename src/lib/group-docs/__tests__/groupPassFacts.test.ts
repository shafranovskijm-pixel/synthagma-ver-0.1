import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildGroupPassFactRows, type GroupPassFactsSnapshot } from "../../../../supabase/functions/_shared/docx-ooxml/groupPassFacts";
import { compileGroupDocumentXml, type GroupDocumentManifest } from "../../../../supabase/functions/_shared/docx-ooxml/groupDocument";
import { findUnresolvedTokens } from "../../../../supabase/functions/_shared/docx-ooxml/xml";
import { GROUP_DOCUMENT_TEMPLATE_BUNDLE } from "../../../../supabase/functions/_shared/group-doc-templates/goreltech/group-package/v1/embedded";
const fixture = (): GroupPassFactsSnapshot => ({
  organization: { id: "o" }, group: { id: "g", organization_id: "o", course_id: "c", training_dates: ["2026-09-05", "2026-09-06"], start_date: "2026-09-01", end_date: "2026-09-30" },
  profiles: ["a", "b"].map(user_id => ({ user_id, organization_id: "o", student_group_id: "g", archived_at: null, full_name: "Однофамилец Иван", email: `${user_id}@example.invalid`, phone: user_id === "a" ? "+70001" : null, company_id: user_id })),
  companies: [{ id: "a", organization_id: "o", name: "Компания <А> & Б" }, { id: "b", organization_id: "o", name: "Вторая" }],
});
const build = (snapshot = fixture(), fillMode: "data" | "blank" = "data") => buildGroupPassFactRows({ snapshot, fillMode });
describe("pass server facts", () => {
  it("preserves namesakes by IDs and each person's own company and contacts", () => {
    const result = build();
    expect(result.rows.map(r => r.COMPANY)).toEqual(["Компания <А> & Б", "Вторая"]);
    expect(result.rows.map(r => r.EMAIL)).toEqual(["a@example.invalid", "b@example.invalid"]);
    expect(result.rowSources).toEqual([{ userId: "a", companyId: "a" }, { userId: "b", companyId: "b" }]);
    expect(Object.keys(result.rows[0])).toEqual(JSON.parse(GROUP_DOCUMENT_TEMPLATE_BUNDLE.pass.manifestJson).row_tokens);
    expect(result.scalars.DAY1_DATE).toBe("05.09.2026");
    expect(result.scalars.DAY2_DATE).toBe("06.09.2026");
    expect(result.scalars.DAY3_DATE).toBe("");
    expect(result.scalars.CONTRACT_BASIS_LINE).toBe("");
    expect(result.scalars).not.toHaveProperty("SIGNATORY_SHORT");
  });
  it.each([[], ["2026-02-30"], ["2026-09-05", "2026-09-05"], ["2026-09-06", "2026-09-05"], ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]].map(dates => ({ dates })))("does not silently repair unsupported dates $dates", ({ dates }) => {
    const s = fixture(); s.group.training_dates = dates;
    const r = build(s);
    expect([1, 2, 3, 4].map(i => r.scalars[`DAY${i}_DATE`])).toEqual(["", "", "", ""]);
    expect(r.issues.some(i => i.field === "training_dates")).toBe(true);
    expect(r.rows).toHaveLength(2);
  });
  it.each(["2026-08-31", "2026-10-01"])("does not print a saved date outside the group period: %s", date => {
    const s = fixture(); s.group.training_dates = [date];
    const r = build(s);
    expect(r.scalars.DAY1_DATE).toBe("");
    expect(r.issues).toContainEqual(expect.objectContaining({ code: "training_dates_outside_period" }));
    expect(r.rows).toHaveLength(2);
  });
  it.each([null, {}, "2026-09-05", [3], [null]])("reports malformed dates without throwing: %j", dates => {
    const s = fixture(); s.group.training_dates = dates;
    const r = build(s);
    expect(r.scalars.DAY1_DATE).toBe("");
    expect(r.issues.some(i => i.code.startsWith("training_dates_invalid"))).toBe(true);
  });
  it("retains actual saved dates with an explicit warning if the period is incomplete", () => {
    const s = fixture(); s.group.start_date = null;
    const r = build(s);
    expect(r.scalars.DAY1_DATE).toBe("05.09.2026");
    expect(r.issues).toContainEqual(expect.objectContaining({ code: "group_period_incomplete" }));
  });
  it.each(["2026-02-30", "2026-10-01"])("does not use a corrupt/reversed group period %s", start => {
    const s = fixture(); s.group.start_date = start;
    const r = build(s);
    expect(r.scalars.DAY1_DATE).toBe("");
    expect(r.issues).toContainEqual(expect.objectContaining({ code: "invalid_group_period" }));
  });
  it.each(["foreign", "duplicate", "missing"])("rejects %s company without losing contacts", kind => {
    const s = fixture();
    s.companies = kind === "missing" ? [] : kind === "duplicate" ? [...s.companies, s.companies[0]] : [{ ...s.companies[0], organization_id: "foreign" }];
    const r = build(s); expect(r.rows[0].COMPANY).toBe(""); expect(r.rows[0].EMAIL).toBe("a@example.invalid");
    expect(r.rowSources[0].companyId).toBeNull(); expect(r.issues.some(i => i.code === "company_unconfirmed")).toBe(true);
  });
  it.each(["duplicate", "archived", "tenant", "group"])("fails closed for %s profile", kind => {
    const s = fixture();
    if (kind === "duplicate") s.profiles = [...s.profiles, s.profiles[0]];
    else s.profiles = [{ ...s.profiles[0], ...(kind === "archived" ? { archived_at: "2026-09-01" } : kind === "tenant" ? { organization_id: "foreign" } : { student_group_id: "foreign" }) }, s.profiles[1]];
    const r = build(s); expect(r.rowSources).toEqual([{ userId: "b", companyId: "b" }]);
    expect(r.issues.some(i => i.severity === "error")).toBe(true);
  });
  it("rejects foreign group and keeps blank mode roster but no marks", () => {
    const s = fixture(); s.group.organization_id = "foreign"; expect(build(s).rows).toEqual([]);
    const r = build(fixture(), "blank"); expect(r.rows).toHaveLength(2);
    expect(r.rows.every(row => [1, 2, 3, 4].every(i => row[`DAY_${i}`] === ""))).toBe(true);
    expect(r.issues.some(i => i.code === "attendance_source_missing")).toBe(false);
  });
  it("does not mutate or accept browser values", () => {
    const s = { ...fixture(), variables: { pass_rows: "INJECTED", contract_basis_line: "INJECTED" } }; const before = structuredClone(s);
    expect(JSON.stringify(build(s))).not.toContain("INJECTED"); expect(s).toEqual(before);
  });
  it("compiles retained DOCX and preserves every other ZIP part", async () => {
    const template = GROUP_DOCUMENT_TEMPLATE_BUNDLE.pass;
    const source = await JSZip.loadAsync(Buffer.from(template.templateBase64, "base64"));
    const output = await JSZip.loadAsync(Buffer.from(template.templateBase64, "base64"));
    const xml = await source.file("word/document.xml")!.async("string");
    const r = build();
    const scalars = Object.fromEntries(findUnresolvedTokens(xml).map(token => [token.slice(2, -2), ""]));
    const compiled = compileGroupDocumentXml({ documentXml: xml, manifest: JSON.parse(template.manifestJson) as GroupDocumentManifest, snapshot: { rows: r.rows, scalars: { ...scalars, ...r.scalars } } });
    output.file("word/document.xml", compiled);
    const reloaded = await JSZip.loadAsync(await output.generateAsync({ type: "nodebuffer" }));
    expect(compiled).toContain("Компания &lt;А&gt; &amp; Б"); expect(compiled).toContain("Вторая"); expect(compiled).toContain("a@example.invalid");
    expect(findUnresolvedTokens(compiled)).toEqual([]);
    for (const [name, entry] of Object.entries(source.files)) if (!entry.dir && name !== "word/document.xml") expect(await reloaded.file(name)!.async("uint8array")).toEqual(await entry.async("uint8array"));
  });
});
