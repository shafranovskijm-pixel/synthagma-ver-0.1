import { describe, expect, it } from "vitest";
import { crmLinkArguments, parseOrgCrmContext } from '../orgCrmContext.ts';

const org = "10000000-0000-4000-8000-000000000001";
const student = "20000000-0000-4000-8000-000000000001";
const clientId = "30000000-0000-4000-8000-000000000001";
const date = "2026-10-12T07:00:00.123456+00:00";
const context = () => ({ subject: { type: "student", id: student, name: "Ученик", profile_id: student },
  client: { id: clientId, organization_id: org, org_name: "Ученик", inn: null, email: null, phone: null,
    address: null, notes: null, created_at: date, updated_at: date, company_id: null, student_user_id: student, linked_at: date },
  related_company: null,
  crm: { clients: [] as any[], deals: [] as any[], tasks: [], activities: [], assignees: [],
    counts: { clients: 1, deals: 0, tasks: 0, activities: 0 }, truncated: { clients: false, deals: false, tasks: false, activities: false } },
  timeline: { events: [{ id: "event:1", occurred_at: date, source: "learning", kind: "start", title: "Начало", description: null }], total: 1, truncated: false, restricted_sources: [], unavailable_sources: [] },
});
const fixture = () => { const value = context(); value.crm.clients.push({ ...value.client }); return value; };
describe("CRM card boundary", () => {
  it("keeps the source user id and exact recorded dates", () => {
    const value = parseOrgCrmContext(fixture(), org, "student", student);
    expect(value.timeline.events[0].occurred_at).toBe(date);
    expect(crmLinkArguments(org, "student", student, null)).toEqual({ p_organization_id: org, p_entity_type: "student", p_entity_id: student, p_client_id: null });
  });
  it("rejects another subject and organization", () => {
    expect(() => parseOrgCrmContext(fixture(), org, "student", clientId)).toThrow();
    expect(() => parseOrgCrmContext(fixture(), student, "student", student)).toThrow();
  });
  it("rejects unrelated clients and deals even within the same organization", () => {
    const otherClient = fixture(); otherClient.crm.clients[0].student_user_id = clientId;
    expect(() => parseOrgCrmContext(otherClient, org, "student", student)).toThrow();
    const otherDeal = fixture(); otherDeal.crm.deals.push({ id: student, organization_id: org, client_id: student, title: "Чужая", stage: "new", amount: 0, created_at: date, updated_at: date }); otherDeal.crm.counts.deals = 1;
    expect(() => parseOrgCrmContext(otherDeal, org, "student", student)).toThrow();
  });
  it("does not silently accept contradictory empty or duplicate timeline results", () => {
    const wrong = fixture(); wrong.client = null;
    expect(() => parseOrgCrmContext(wrong, org, "student", student)).toThrow();
    const duplicate = fixture(); duplicate.timeline.events.push(duplicate.timeline.events[0]); duplicate.timeline.total = 2;
    expect(() => parseOrgCrmContext(duplicate, org, "student", student)).toThrow();
    const truncated = fixture(); truncated.timeline.total = 9;
    expect(() => parseOrgCrmContext(truncated, org, "student", student)).toThrow();
  });
});
