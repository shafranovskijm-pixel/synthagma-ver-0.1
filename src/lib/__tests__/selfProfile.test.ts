import { it as test } from "vitest";
import assert from "node:assert/strict";
import { createSelfProfileInitializer, createSelfProfileWriter, SelfProfileError, type SelfProfileChanges, type SelfProfilePort, type SelfProfileReply } from "../selfProfile";

// These exercise the actual client core with mocked ports, not PostgreSQL/RLS/Auth.
const uid = "11111111-1111-4111-8111-111111111111";
const foreign = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";
function fixture() {
  const calls: string[] = [];
  let row: Record<string, unknown> = { id, user_id: uid, full_name: "Before" };
  let current = true;
  const port: SelfProfilePort = {
    async authorize(expected) { calls.push("authorize"); assert.equal(expected, uid); return { userId: uid, authorization: "Bearer synthetic-normal-session" }; },
    async isCurrent() { calls.push("current"); return current; },
    async ensure() { calls.push("ensure"); return { data: { schema_version: 1, id, user_id: uid, created: true }, error: null }; },
    async update(_authority, changes) { calls.push("update"); row = { ...row, ...changes }; return { data: { ...row }, error: null }; },
    async read() { calls.push("read"); return { data: { ...row }, error: null }; },
  };
  return { port, calls, writer: createSelfProfileWriter(port), initialize: createSelfProfileInitializer(port), setCurrent(value: boolean) { current = value; } };
}
const code = (expected: string) => (error: unknown) => error instanceof SelfProfileError && error.code === expected;
const failure = (data: unknown = null, error: unknown = null): SelfProfileReply => ({ data, error });

test("SP01 Save confirms returned values and a second own-row read before success", async () => {
  const f = fixture();
  assert.deepEqual(await f.writer(uid, { full_name: "After", phone: null }), { userId: uid, created: true });
  assert.deepEqual(f.calls, ["authorize", "current", "ensure", "current", "update", "current", "read", "current"]);
});
test("SP02 Existing profile is accepted as existing, not reported as newly created", async () => {
  const f = fixture(); f.port.ensure = async () => failure({ schema_version: 1, id, user_id: uid, created: false });
  assert.deepEqual(await f.writer(uid, { city: "City" }), { userId: uid, created: false });
});
test("SP03 Zero-row UPDATE without an error cannot report Save success", async () => {
  const f = fixture(); f.port.update = async () => failure();
  await assert.rejects(f.writer(uid, { full_name: "After" }), code("SELF_PROFILE_ROW_NOT_CONFIRMED"));
  assert.ok(!f.calls.includes("read"));
});
test("SP04 A foreign row from UPDATE is rejected", async () => {
  const f = fixture(); f.port.update = async () => failure({ user_id: foreign, full_name: "After" });
  await assert.rejects(f.writer(uid, { full_name: "After" }), code("SELF_PROFILE_ROW_NOT_CONFIRMED"));
});
test("SP05 An UPDATE echo with wrong values is rejected", async () => {
  const f = fixture(); f.port.update = async () => failure({ user_id: uid, full_name: "Before" });
  await assert.rejects(f.writer(uid, { full_name: "After" }), code("SELF_PROFILE_VALUE_NOT_CONFIRMED"));
});
test("SP06 Missing returned fields are not accepted as null", async () => {
  const f = fixture(); f.port.update = async () => failure({ user_id: uid });
  await assert.rejects(f.writer(uid, { phone: null }), code("SELF_PROFILE_VALUE_NOT_CONFIRMED"));
});
test("SP07 A successful UPDATE followed by zero-row read cannot report success", async () => {
  const f = fixture(); f.port.read = async () => failure();
  await assert.rejects(f.writer(uid, { city: "After" }), code("SELF_PROFILE_ROW_NOT_CONFIRMED"));
});
test("SP08 Readback must match actual saved field values", async () => {
  const f = fixture(); f.port.read = async () => failure({ user_id: uid, bio: "Older" });
  await assert.rejects(f.writer(uid, { bio: "New" }), code("SELF_PROFILE_VALUE_NOT_CONFIRMED"));
});
test("SP09 Tenant, identity and security fields are denied before any port call", async () => {
  for (const field of ["organization_id", "company_id", "student_group_id", "user_id", "email", "generated_password", "blocked_at", "archived_at", "role"]) {
    const f = fixture();
    await assert.rejects(f.writer(uid, { [field]: foreign } as SelfProfileChanges), code("SELF_PROFILE_FIELD_NOT_ALLOWED"));
    assert.deepEqual(f.calls, []);
  }
});
test("SP10 Empty changes and non-string values are denied before authorization", async () => {
  for (const changes of [{}, { phone: 123 }]) {
    const f = fixture(); await assert.rejects(f.writer(uid, changes as SelfProfileChanges)); assert.deepEqual(f.calls, []);
  }
});
test("SP11 Invalid expected identity is denied before authorization", async () => {
  const f = fixture(); await assert.rejects(f.writer("other-account", { city: "X" }), code("SELF_PROFILE_AUTH_REQUIRED")); assert.deepEqual(f.calls, []);
});
test("SP12 Genuine authorization returning another actor is denied before ensure", async () => {
  const f = fixture(); f.port.authorize = async () => ({ userId: foreign, authorization: "Bearer synthetic" });
  await assert.rejects(f.writer(uid, { city: "X" }), code("SELF_PROFILE_AUTH_REQUIRED")); assert.ok(!f.calls.includes("ensure"));
});
test("SP13 Missing ordinary bearer is rejected before ensure", async () => {
  const f = fixture(); f.port.authorize = async () => ({ userId: uid, authorization: "" });
  await assert.rejects(f.writer(uid, { city: "X" }), code("SELF_PROFILE_AUTH_REQUIRED"));
});
test("SP14 Actor/token change before ensure prevents the RPC", async () => {
  const f = fixture(); f.setCurrent(false);
  await assert.rejects(f.writer(uid, { city: "X" }), code("SELF_PROFILE_ACTOR_CHANGED")); assert.ok(!f.calls.includes("ensure"));
});
test("SP15 Actor/token change after ensure prevents UPDATE", async () => {
  const f = fixture(); const ensure = f.port.ensure; f.port.ensure = async a => { const reply = await ensure(a); f.setCurrent(false); return reply; };
  await assert.rejects(f.writer(uid, { city: "X" }), code("SELF_PROFILE_ACTOR_CHANGED")); assert.ok(!f.calls.includes("update"));
});
test("SP16 Actor/token change after UPDATE prevents readback success", async () => {
  const f = fixture(); const update = f.port.update; f.port.update = async (a, c) => { const reply = await update(a, c); f.setCurrent(false); return reply; };
  await assert.rejects(f.writer(uid, { city: "X" }), code("SELF_PROFILE_ACTOR_CHANGED")); assert.ok(!f.calls.includes("read"));
});
test("SP17 Actor/token change during final read cannot be acknowledged", async () => {
  const f = fixture(); const read = f.port.read; f.port.read = async a => { const reply = await read(a); f.setCurrent(false); return reply; };
  await assert.rejects(f.writer(uid, { city: "X" }), code("SELF_PROFILE_ACTOR_CHANGED"));
});
test("SP18 Server denial replies are propagated without UPDATE (mock, not SQL guard proof)", async () => {
  for (const reason of ["blocked", "archived", "Auth banned", "Auth deleted", "deletion revoked"]) {
    const f = fixture(); f.port.ensure = async () => failure(null, { code: "42501", reason });
    await assert.rejects(f.writer(uid, { city: "X" }), code("SELF_PROFILE_INITIALISATION_NOT_CONFIRMED")); assert.ok(!f.calls.includes("update"));
  }
});
test("SP19 A foreign/invalid initialization receipt cannot authorize Save", async () => {
  for (const data of [{ schema_version: 1, id, user_id: foreign, created: true }, { schema_version: 1, id, user_id: uid, created: "true" }, { schema_version: 1, id: "invalid", user_id: uid, created: true }]) {
    const f = fixture(); f.port.ensure = async () => failure(data);
    await assert.rejects(f.writer(uid, { city: "X" }), code("SELF_PROFILE_INITIALISATION_NOT_CONFIRMED")); assert.ok(!f.calls.includes("update"));
  }
});
test("SP20 In-flight caller mutation cannot replace the captured Save values", async () => {
  const f = fixture(); const changes = { full_name: "Captured" }; const authorize = f.port.authorize;
  f.port.authorize = async expected => { changes.full_name = "Mutated"; return authorize(expected); };
  assert.deepEqual(await f.writer(uid, changes), { userId: uid, created: true });
  const read = await f.port.read({ userId: uid, authorization: "Bearer synthetic" });
  assert.equal((read.data as Record<string, unknown>).full_name, "Captured");
});
test("SP21 Account initialization confirms exact receipt ID with independent own-row read", async () => {
  const f = fixture(); assert.deepEqual(await f.initialize(uid), { userId: uid, created: true });
  assert.deepEqual(f.calls, ["authorize", "current", "ensure", "current", "read", "current"]);
});
test("SP22 Account initialization never uses UPDATE and rejects zero-row read", async () => {
  const f = fixture(); f.port.read = async () => failure();
  await assert.rejects(f.initialize(uid), code("SELF_PROFILE_ROW_NOT_CONFIRMED")); assert.ok(!f.calls.includes("update"));
});
test("SP23 Account initialization rejects a different profile ID/actor", async () => {
  for (const row of [{ id: foreign, user_id: uid }, { id, user_id: foreign }]) {
    const f = fixture(); f.port.read = async () => failure(row);
    await assert.rejects(f.initialize(uid), code("SELF_PROFILE_ROW_NOT_CONFIRMED"));
  }
});
test("SP24 Account initialization actor switch after read is never acknowledged", async () => {
  const f = fixture(); const read = f.port.read; f.port.read = async a => { const result = await read(a); f.setCurrent(false); return result; };
  await assert.rejects(f.initialize(uid), code("SELF_PROFILE_ACTOR_CHANGED"));
});
