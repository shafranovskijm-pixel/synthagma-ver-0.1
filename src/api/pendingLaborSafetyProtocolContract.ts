/** Expected API of migration 20260904090000, NOT a claim about the live schema.
 * Responses stay unknown until runtime validation. Reuses the existing session/client.
 */
type Response = { data: unknown; error: unknown };
interface ProtocolQuery extends PromiseLike<Response> {
  select(columns: string): ProtocolQuery;
  eq(column: "organization_id" | "enrollment_id", value: string): ProtocolQuery;
  in(column: "enrollment_id", values: string[]): ProtocolQuery;
  maybeSingle(): PromiseLike<Response>;
}
export interface PendingProtocolReadClient {
  from(table: "labor_safety_enrollment_protocols"): ProtocolQuery;
}
export interface PendingProtocolClient extends PendingProtocolReadClient {
  rpc(name: "save_labor_safety_enrollment_protocol", args: {
    p_organization_id: string;
    p_enrollment_id: string;
    p_protocol_number: string;
    p_knowledge_check_date: string;
    p_is_passed: boolean;
    p_expected_version: number | null;
  }): PromiseLike<Response>;
}
/** Only the pending protocol API crosses the generated-live-schema boundary. */
export function pendingProtocolReadClient(client: { from: unknown }): PendingProtocolReadClient {
  return client as unknown as PendingProtocolReadClient;
}
export function pendingProtocolClient(client: { from: unknown; rpc: unknown }): PendingProtocolClient {
  return client as unknown as PendingProtocolClient;
}
