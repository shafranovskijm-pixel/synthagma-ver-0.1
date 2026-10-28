export const SELF_PROFILE_FIELDS = ["full_name", "phone", "city", "bio", "vk_link", "telegram_link"] as const;
export type SelfProfileField = typeof SELF_PROFILE_FIELDS[number];
export type SelfProfileChanges = Partial<Record<SelfProfileField, string | null>>;
export interface SelfProfileAuthority { userId: string; authorization: string }
export interface SelfProfileReply { data: unknown; error: unknown }
export interface SelfProfilePort {
  authorize(expectedUserId: string): Promise<SelfProfileAuthority>;
  isCurrent(authority: SelfProfileAuthority): Promise<boolean>;
  ensure(authority: SelfProfileAuthority): Promise<SelfProfileReply>;
  update(authority: SelfProfileAuthority, changes: SelfProfileChanges): Promise<SelfProfileReply>;
  read(authority: SelfProfileAuthority): Promise<SelfProfileReply>;
}
export class SelfProfileError extends Error {
  readonly code: string;
  constructor(code: string) { super("Не удалось подтвердить сохранение профиля. Обновите страницу и повторите."); this.code = code; }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function requireValue(value: unknown, code: string): asserts value {
  if (!value) throw new SelfProfileError(code);
}
function checkedChanges(input: SelfProfileChanges): SelfProfileChanges {
  requireValue(object(input) && Object.keys(input).length > 0, "SELF_PROFILE_FIELDS_REQUIRED");
  const result: SelfProfileChanges = {};
  for (const [field, value] of Object.entries(input)) {
    requireValue(SELF_PROFILE_FIELDS.includes(field as SelfProfileField)
      && (typeof value === "string" || value === null), "SELF_PROFILE_FIELD_NOT_ALLOWED");
    result[field as SelfProfileField] = value;
  }
  return Object.freeze(result);
}
function checkedRow(reply: SelfProfileReply, authority: SelfProfileAuthority, changes: SelfProfileChanges) {
  requireValue(!reply.error && object(reply.data) && reply.data.user_id === authority.userId,
    "SELF_PROFILE_ROW_NOT_CONFIRMED");
  for (const [field, expected] of Object.entries(changes)) {
    requireValue(Object.prototype.hasOwnProperty.call(reply.data, field) && reply.data[field] === expected, "SELF_PROFILE_VALUE_NOT_CONFIRMED");
  }
}
function checkedInitialisation(reply: SelfProfileReply, expectedUserId: string) {
  requireValue(!reply.error && object(reply.data) && reply.data.schema_version === 1
    && reply.data.user_id === expectedUserId && typeof reply.data.id === "string" && UUID.test(reply.data.id)
    && typeof reply.data.created === "boolean", "SELF_PROFILE_INITIALISATION_NOT_CONFIRMED");
  return { id: reply.data.id, created: reply.data.created };
}
async function verifiedAuthority(port: SelfProfilePort, expectedUserId: string) {
  requireValue(typeof expectedUserId === "string" && UUID.test(expectedUserId), "SELF_PROFILE_AUTH_REQUIRED");
  const authority = await port.authorize(expectedUserId);
  requireValue(authority.userId === expectedUserId && /^Bearer \S+$/.test(authority.authorization), "SELF_PROFILE_AUTH_REQUIRED");
  return authority;
}
export function createSelfProfileInitializer(port: SelfProfilePort) {
  return async (expectedUserId: string): Promise<{ userId: string; created: boolean }> => {
    const authority = await verifiedAuthority(port, expectedUserId);
    const current = async () => requireValue(await port.isCurrent(authority), "SELF_PROFILE_ACTOR_CHANGED");
    await current();
    const ensured = checkedInitialisation(await port.ensure(authority), expectedUserId);
    await current();
    const read = await port.read(authority);
    requireValue(!read.error && object(read.data) && read.data.user_id === expectedUserId && read.data.id === ensured.id,
      "SELF_PROFILE_ROW_NOT_CONFIRMED");
    await current();
    return { userId: expectedUserId, created: ensured.created };
  };
}
export function createSelfProfileWriter(port: SelfProfilePort) {
  return async (expectedUserId: string, input: SelfProfileChanges): Promise<{ userId: string; created: boolean }> => {
    const changes = checkedChanges(input);
    const authority = await verifiedAuthority(port, expectedUserId);
    const current = async () => requireValue(await port.isCurrent(authority), "SELF_PROFILE_ACTOR_CHANGED");
    await current();
    const { created } = checkedInitialisation(await port.ensure(authority), expectedUserId);
    await current();
    // An UPDATE with no returned row is not a successful save. The adapter also
    // filters blocked/archived rows, preserving their values in a concurrent block.
    checkedRow(await port.update(authority, changes), authority, changes);
    await current();
    checkedRow(await port.read(authority), authority, changes);
    await current();
    return { userId: expectedUserId, created };
  };
}
