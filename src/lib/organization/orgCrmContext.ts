import { z } from "zod";
import { crmClientSchema, OrgCrmError, parseOrgCrmSnapshot, type OrgCrmClient, type OrgCrmSnapshot } from './orgCrm.ts';

const id = z.string().uuid();
const entityType = z.enum(["company", "student"]);
const source = z.enum(["crm", "learning", "documents", "activity"]);
const contextSchema = z.object({
  subject: z.object({ type: entityType, id, name: z.string(), profile_id: id.nullable() }),
  client: crmClientSchema.nullable(),
  related_company: z.object({ id, name: z.string(), client_id: id.nullable() }).nullable(),
  crm: z.unknown(),
  timeline: z.object({
    events: z.array(z.object({ id: z.string().min(1), occurred_at: z.string().datetime({ offset: true }),
      source, kind: z.string().min(1), title: z.string(), description: z.string().nullable() })),
    total: z.number().int().nonnegative().safe(), truncated: z.boolean(),
    restricted_sources: z.array(source), unavailable_sources: z.array(source),
  }),
});
export type OrgCrmEntityType = z.infer<typeof entityType>;
export interface OrgCrmContext {
  subject: { type: OrgCrmEntityType; id: string; name: string; profile_id: string | null };
  client: OrgCrmClient | null;
  related_company: { id: string; name: string; client_id: string | null } | null;
  crm: OrgCrmSnapshot;
  timeline: {
    events: { id: string; occurred_at: string; source: "crm" | "learning" | "documents" | "activity";
      kind: string; title: string; description: string | null }[];
    total: number; truncated: boolean; restricted_sources: string[]; unavailable_sources: string[];
  };
}

export function crmContextArguments(organizationId: string, type: OrgCrmEntityType, entityId: string) {
  if (!id.safeParse(organizationId).success || !entityType.safeParse(type).success || !id.safeParse(entityId).success) {
    throw new OrgCrmError("Выберите доступную карточку компании или ученика.", "CRM_INVALID_INPUT");
  }
  return { p_organization_id: organizationId, p_entity_type: type, p_entity_id: entityId };
}

export function crmLinkArguments(organizationId: string, type: OrgCrmEntityType, entityId: string, clientId: string | null) {
  if (clientId !== null && !id.safeParse(clientId).success) throw new OrgCrmError("Выберите клиента CRM.", "CRM_INVALID_INPUT");
  return { ...crmContextArguments(organizationId, type, entityId), p_client_id: clientId };
}

export function parseOrgCrmContext(value: unknown, organizationId: string, type: OrgCrmEntityType, entityId: string): OrgCrmContext {
  const parsed = contextSchema.safeParse(value);
  const invalid = () => new OrgCrmError("Данные CRM не соответствуют выбранной карточке. Обновите страницу.", "CRM_INVALID_RESPONSE");
  if (!parsed.success) throw invalid();
  const result = parsed.data;
  const crm = parseOrgCrmSnapshot(result.crm, organizationId);
  if (result.subject.type !== type || result.subject.id !== entityId
    || (type === "company" && (result.subject.profile_id !== null || result.related_company !== null))) throw invalid();
  const client = result.client;
  if (crm.counts.clients !== (client ? 1 : 0) || crm.truncated.clients) throw invalid();
  if (client) {
    if (client.organization_id !== organizationId || !client.linked_at
      || (type === "company" ? client.company_id !== entityId || !!client.student_user_id : client.student_user_id !== entityId || !!client.company_id)
      || crm.clients.length !== 1 || crm.clients[0].id !== client.id
      || crm.clients[0].company_id !== client.company_id || crm.clients[0].student_user_id !== client.student_user_id
      || [...crm.deals, ...crm.tasks, ...crm.activities].some(row => row.client_id !== client.id)) throw invalid();
  } else if (crm.clients.length || crm.deals.length || crm.tasks.length || crm.activities.length) throw invalid();
  const timeline = result.timeline;
  if (new Set(timeline.events.map(event => event.id)).size !== timeline.events.length
    || timeline.events.some(event => timeline.restricted_sources.includes(event.source))
    || timeline.total < timeline.events.length || timeline.truncated !== (timeline.total > timeline.events.length)) throw invalid();
  // Zod guarantees required fields; this project disables strictNullChecks,
  // which otherwise makes its inferred object keys appear optional to consumers.
  return { ...result, crm } as OrgCrmContext;
}
