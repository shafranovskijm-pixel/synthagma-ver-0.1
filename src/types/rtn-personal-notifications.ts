import type { RtnUpdateEvent, RtnUpdateKind } from "./rtn-updates";
export interface RtnPersonalScope { organizationId: string; actorId: string }
export interface RtnPersonalIdentity { organization_id: string; actor_id: string }
export interface RtnPersonalSubscription {
  enabled: boolean; effective_enabled: boolean; needs_reconfiguration: boolean;
  topics: string[]; kinds: RtnUpdateKind[]; generation: number;
  enabled_since: string | null; updated_at: string | null;
}
export interface RtnPreferenceEnvelope extends RtnPersonalIdentity {
  subscription: RtnPersonalSubscription;
  options: { topics: string[]; kinds: RtnUpdateKind[] };
  delivery_mode: "own_pull";
}
export interface RtnPersonalDelivery {
  id: string; event: RtnUpdateEvent; delivered_at: string; read_at: string | null; subscription_generation: number;
}
export interface RtnPersonalNotificationPage extends RtnPersonalIdentity {
  items: RtnPersonalDelivery[]; unread_count: number; has_more: boolean; next_before_sequence: number | null;
  materialization_pending: boolean; materialized_count: number;
  subscription_generation: number; subscription_enabled: boolean; delivery_mode: "own_pull";
}
export interface RtnPersonalReadResult extends RtnPersonalIdentity { read_event_ids: string[]; matched_count: number }
