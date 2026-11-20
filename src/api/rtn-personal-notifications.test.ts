import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { getMyRtnSubscription, saveMyRtnSubscription, getMyRtnNotifications, markMyRtnNotificationsRead } from "./rtn-personal-notifications";
const org = "11111111-1111-4111-8111-111111111111", actor = "22222222-2222-4222-8222-222222222222", eventId = "33333333-3333-4333-8333-333333333333", deliveryId = "44444444-4444-4444-8444-444444444444";
const scope = { organizationId: org, actorId: actor }, stamp = "2026-11-20T10:00:00Z";
const identity = { organization_id: org, actor_id: actor };
const preference = () => ({ ...identity, delivery_mode: "own_pull", options: { topics: ["general", "industrial-safety"], kinds: ["news", "source_change", "bank_release"] }, subscription: { enabled: false, effective_enabled: false, needs_reconfiguration: false, topics: [], kinds: [], generation: 0, enabled_since: null, updated_at: null } });
const event = () => ({ id: eventId, sequence: 50, kind: "news", topic: "general", previous_event_id: null, bank_id: null, source_revision_id: null, release_id: null, canonical_url: "https://www.gosnadzor.ru/news/64/12345/", title: "Публикация", source_excerpt: "", own_summary: "", published_at: stamp, observed_at: stamp, effective_from: null, historical: false, notifiable: true });
const page = () => ({ ...identity, delivery_mode: "own_pull", items: [{ id: deliveryId, event: event(), delivered_at: stamp, read_at: null, subscription_generation: 1 }], unread_count: 1, has_more: false, next_before_sequence: null, materialization_pending: false, materialized_count: 0, subscription_generation: 1, subscription_enabled: true });
const reply = (data: unknown) => rpc.mockResolvedValue({ data, error: null });
beforeEach(() => rpc.mockReset());
describe("own RTN notification API boundary", () => {
  it("reads an absent subscription as confirmed off without creating a preference", async () => {
    reply(preference()); expect((await getMyRtnSubscription(scope)).subscription).toMatchObject({ enabled: false, generation: 0 });
    expect(rpc).toHaveBeenCalledTimes(1); expect(rpc).toHaveBeenCalledWith("get_my_rtn_subscription", { p_organization_id: org });
  });
  it.each(["actor_id", "organization_id"])("rejects a foreign %s response", async field => {
    reply({ ...preference(), [field]: eventId });
    await expect(getMyRtnSubscription(scope)).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("rejects an invented default-on state instead of enabling it", async () => {
    const value = preference(); value.subscription.enabled = true; reply(value);
    await expect(getMyRtnSubscription(scope)).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("accepts a stored enabled selection requiring reconfiguration without pretending delivery works", async () => {
    const value = preference(); value.subscription = { ...value.subscription, enabled: true, needs_reconfiguration: true, generation: 2, topics: ["unavailable-topic"], kinds: ["news"], enabled_since: stamp, updated_at: stamp }; reply(value);
    expect((await getMyRtnSubscription(scope)).subscription).toMatchObject({ effective_enabled: false, needs_reconfiguration: true });
  });
  it("sends CAS generation and own selected values with no recipient argument", async () => {
    const value = preference(); value.subscription = { ...value.subscription, generation: 1, topics: ["general"], kinds: ["news"], updated_at: stamp }; reply(value);
    await saveMyRtnSubscription(scope, { enabled: false, topics: ["general"], kinds: ["news"], expectedGeneration: 0 });
    expect(rpc).toHaveBeenCalledWith("save_my_rtn_subscription", { p_organization_id: org, p_enabled: false, p_topics: ["general"], p_kinds: ["news"], p_expected_generation: 0 });
  });
  it("does not retry or overwrite after a CAS conflict", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "private backend detail" } });
    await expect(saveMyRtnSubscription(scope, { enabled: false, topics: [], kinds: [], expectedGeneration: 2 })).rejects.toMatchObject({ code: "conflict" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects a successful save envelope for different selected preferences", async () => {
    const value = preference(); value.subscription = { ...value.subscription, generation: 1, updated_at: stamp }; reply(value);
    await expect(saveMyRtnSubscription(scope, { enabled: false, topics: ["general"], kinds: [], expectedGeneration: 0 })).rejects.toMatchObject({ code: "invalid_response" });
  });
  it.each([{ enabled: true, topics: [], kinds: ["news"] }, { enabled: true, topics: ["general"], kinds: [] }, { enabled: false, topics: ["general", "general"], kinds: [] }])("rejects malformed selections before RPC", async draft => {
    await expect(saveMyRtnSubscription(scope, { ...draft, kinds: draft.kinds as ["news"], expectedGeneration: 0 })).rejects.toMatchObject({ code: "invalid_response" }); expect(rpc).not.toHaveBeenCalled();
  });
  it("uses the embedded canonical event without N+1 event lookups", async () => {
    reply(page()); const value = await getMyRtnNotifications(scope, { limit: 20, beforeSequence: 60 });
    expect(value.items[0].event.id).toBe(eventId); expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_my_rtn_notifications", { p_organization_id: org, p_before_sequence: 60, p_limit: 20 });
  });
  it("preserves incomplete materialization separately from a zero received count", async () => {
    reply({ ...page(), items: [], unread_count: 0, materialization_pending: true, materialized_count: 50 });
    expect(await getMyRtnNotifications(scope)).toMatchObject({ unread_count: 0, materialization_pending: true });
  });
  it.each([{ next_before_sequence: 49, has_more: true }, { items: [page().items[0], page().items[0]] }, { unread_count: 0 }])("rejects unstable own page metadata", async delta => {
    reply({ ...page(), ...delta }); await expect(getMyRtnNotifications(scope)).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("marks canonical events only and accepts an authorized event with no own delivery as a no-op", async () => {
    reply({ ...identity, read_event_ids: [], matched_count: 0 });
    expect(await markMyRtnNotificationsRead(scope, [eventId])).toMatchObject({ read_event_ids: [], matched_count: 0 });
    expect(rpc).toHaveBeenCalledWith("mark_my_rtn_notifications_read", { p_organization_id: org, p_event_ids: [eventId] });
  });
  it("rejects a mark reply containing an unrequested canonical event", async () => {
    reply({ ...identity, read_event_ids: [deliveryId], matched_count: 1 });
    await expect(markMyRtnNotificationsRead(scope, [eventId])).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("keeps denied or uninstalled personal access as errors, never zero notifications", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } }).mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
    await expect(getMyRtnNotifications(scope)).rejects.toMatchObject({ code: "forbidden" });
    await expect(getMyRtnNotifications(scope)).rejects.toMatchObject({ code: "unknown" });
  });
});
