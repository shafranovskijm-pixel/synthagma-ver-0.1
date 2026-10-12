import { describe, expect, it } from "vitest";
import { crmActivityArguments, crmError, crmSaveArguments, parseCrmSaveReceipt, parseOrgCrmSnapshot } from "../orgCrm";

const org = "10000000-0000-4000-8000-000000000001";
const otherOrg = "10000000-0000-4000-8000-000000000002";
const clientId = "20000000-0000-4000-8000-000000000001";
const date = "2026-10-12T07:00:00.123456+00:00";
const snapshot = () => ({ clients: [{ id: clientId, organization_id: org, org_name: "Клиент",
  inn: null, email: null, phone: null, address: null, notes: null, created_at: date, updated_at: date }],
  deals: [], tasks: [], activities: [], assignees: [], counts: { clients: 1, deals: 0, tasks: 0, activities: 0 },
  truncated: { clients: false, deals: false, tasks: false, activities: false } });

describe("CRM wire contract", () => {
  it("preserves PostgreSQL timestamp precision and checks the selected organization", () => {
    expect(parseOrgCrmSnapshot(snapshot(), org).clients[0].updated_at).toBe(date);
    expect(() => parseOrgCrmSnapshot(snapshot(), otherOrg)).toThrow(/организации/);
  });
  it("rejects malformed responses and understated counts instead of claiming an empty database", () => {
    expect(() => parseOrgCrmSnapshot(null, org)).toThrow(/неполные/);
    expect(() => parseOrgCrmSnapshot({ ...snapshot(), counts: { clients: 0, deals: 0, tasks: 0, activities: 0 } }, org)).toThrow();
    const duplicate = snapshot(); duplicate.clients.push(duplicate.clients[0]); duplicate.counts.clients = 2;
    expect(() => parseOrgCrmSnapshot(duplicate, org)).toThrow();
  });
  it("requires honest truncation metadata", () => {
    const data = snapshot(); data.counts.clients = 1001;
    expect(() => parseOrgCrmSnapshot(data, org)).toThrow();
    data.truncated.clients = true;
    expect(parseOrgCrmSnapshot(data, org).truncated.clients).toBe(true);
  });
  it("separates expected revision and strips caller-supplied ownership fields", () => {
    expect(crmSaveArguments(org, "client", { id: clientId, expected_updated_at: date, org_name: " Клиент ",
      organization_id: otherOrg, created_by: clientId, email: null })).toEqual({
      p_organization_id: org, p_id: clientId, p_expected_updated_at: date, p_values: { org_name: "Клиент", email: null },
    });
    expect(() => crmSaveArguments(org, "client", { id: clientId, org_name: "Клиент" })).toThrow(/Обновите/);
  });
  it("rejects invalid deal amounts and keeps workflow stages distinct from document signing", () => {
    for (const amount of [NaN, Infinity, -1]) expect(() => crmSaveArguments(org, "deal", {
      client_id: clientId, title: "Сделка", stage: "new", amount,
    })).toThrow();
    expect(() => crmSaveArguments(org, "deal", { client_id: clientId, title: "Сделка", stage: "signed", amount: 10 })).toThrow();
  });
  it("requires a dated task and a meaningful activity", () => {
    expect(() => crmSaveArguments(org, "task", { client_id: clientId, title: "Позвонить", type: "call", status: "pending", due_date: "" })).toThrow();
    expect(() => crmActivityArguments(org, { client_id: clientId, activity_type: "note", description: "  " })).toThrow();
    expect(crmActivityArguments(org, { client_id: clientId, activity_type: "call", description: " Звонил ", actor_user_id: clientId })).toEqual({
      p_organization_id: org, p_client_id: clientId, p_deal_id: null, p_activity_type: "call", p_description: "Звонил",
    });
  });
  it("never treats a missing write receipt as a success or exposes raw server messages", () => {
    expect(() => parseCrmSaveReceipt(null)).toThrow(/подтвердить/);
    expect(crmError({ code: "40001", message: "private sql" }).message).toMatch(/уже изменена/);
    expect(crmError({ code: "42501", message: "private sql" }).message).toMatch(/Нет доступа/);
    expect(crmError({ message: "private sql" }).message).not.toContain("private sql");
  });
});
