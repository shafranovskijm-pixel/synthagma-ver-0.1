/** Current school-only access. This DTO never grants global account authority. */
export type DrivingMemberRole = 'student' | 'instructor';
export type DrivingMembership = { id: string; userId: string; updatedAt: string };
export type DrivingMembershipAccess = {
  actorId: string;
  organizationId: string;
  role: DrivingMemberRole;
  targetId: string;
  state: 'unlinked' | 'protected' | 'linked' | 'revoked';
  membership: DrivingMembership | null;
  revocation: { requestId: string; revokedAt: string } | null;
};
export type DrivingRevocationReceipt = {
  actorId: string;
  organizationId: string;
  membershipId: string;
  userId: string;
  role: DrivingMemberRole;
  targetId: string;
  requestId: string;
  revokedAt: string;
};
export type DrivingMembershipAccessPort = {
  read: (role: DrivingMemberRole, targetId: string) => Promise<DrivingMembershipAccess>;
};

function unavailable(): never { throw new Error('Не удалось подтвердить доступ участника. Обновите данные.'); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) unavailable();
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(value, key))) unavailable();
}
// PostgreSQL UUID syntax; do not reject valid legacy identifiers by RFC bits.
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) unavailable();
  return value.toLowerCase();
}
function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) unavailable();
  return value; // Preserve the exact server optimistic-version value.
}
function role(value: unknown): DrivingMemberRole {
  if (value !== 'student' && value !== 'instructor') unavailable();
  return value;
}
export function parseDrivingMembershipAccess(
  raw: unknown, organizationId: string, expectedRole: DrivingMemberRole, targetId: string,
): DrivingMembershipAccess {
  const value = record(raw);
  exact(value, ['contract_version', 'actor_id', 'organization_id', 'role', 'target_id', 'state', 'membership', 'revocation']);
  if (value.contract_version !== 'driving_membership_access_v1'
      || uuid(value.organization_id) !== uuid(organizationId)
      || role(value.role) !== expectedRole || uuid(value.target_id) !== uuid(targetId)
      || typeof value.state !== 'string' || !['unlinked', 'protected', 'linked', 'revoked'].includes(value.state)) unavailable();
  const state = value.state as DrivingMembershipAccess['state'];
  let membership: DrivingMembership | null = null;
  let revocation: DrivingMembershipAccess['revocation'] = null;
  if (state === 'linked' || state === 'revoked') {
    const member = record(value.membership);
    exact(member, ['id', 'user_id', 'updated_at']);
    membership = { id: uuid(member.id), userId: uuid(member.user_id), updatedAt: timestamp(member.updated_at) };
  } else if (value.membership !== null) unavailable();
  if (state === 'revoked') {
    const revoked = record(value.revocation);
    exact(revoked, ['request_id', 'revoked_at']);
    revocation = { requestId: uuid(revoked.request_id), revokedAt: timestamp(revoked.revoked_at) };
  } else if (value.revocation !== null) unavailable();
  return { actorId: uuid(value.actor_id), organizationId: uuid(value.organization_id), role: expectedRole,
    targetId: uuid(value.target_id), state, membership, revocation };
}
export function parseDrivingRevocationReceipt(
  raw: unknown, access: DrivingMembershipAccess, requestId: string,
): DrivingRevocationReceipt {
  const value = record(raw), member = access.membership;
  exact(value, ['contract_version', 'actor_id', 'organization_id', 'membership_id', 'user_id', 'role', 'target_id', 'request_id', 'revoked_at']);
  if (!member || access.state !== 'linked' || value.contract_version !== 'driving_membership_revocation_v1'
      || uuid(value.actor_id) !== access.actorId || uuid(value.organization_id) !== access.organizationId
      || uuid(value.membership_id) !== member.id || uuid(value.user_id) !== member.userId
      || role(value.role) !== access.role || uuid(value.target_id) !== access.targetId
      || uuid(value.request_id) !== uuid(requestId)) unavailable();
  return { actorId: access.actorId, organizationId: access.organizationId, membershipId: member.id,
    userId: member.userId, role: access.role, targetId: access.targetId, requestId: uuid(requestId),
    revokedAt: timestamp(value.revoked_at) };
}

/** Revalidate the UI DTO at the generic mutation boundary; actor is never an RPC argument. */
export function drivingRevocationArguments(raw: unknown, organizationId: string, reason: unknown, requestId: unknown) {
  const value = record(raw);
  exact(value, ['actorId', 'organizationId', 'role', 'targetId', 'state', 'membership', 'revocation']);
  const member = record(value.membership);
  exact(member, ['id', 'userId', 'updatedAt']);
  if (value.state !== 'linked' || value.revocation !== null || typeof reason !== 'string'
      || reason.trim().length < 1 || reason.trim().length > 2000) unavailable();
  const access = parseDrivingMembershipAccess({ contract_version: 'driving_membership_access_v1',
    actor_id: value.actorId, organization_id: value.organizationId, role: value.role,
    target_id: value.targetId, state: value.state, revocation: null,
    membership: { id: member.id, user_id: member.userId, updated_at: member.updatedAt },
  }, organizationId, role(value.role), uuid(value.targetId));
  if (!access.membership) unavailable();
  return { access, args: { _membership_id: access.membership.id, _expected_user_id: access.membership.userId,
    _role: access.role, _target_id: access.targetId, _expected_updated_at: access.membership.updatedAt,
    _request_id: uuid(requestId), _reason: reason.trim() } };
}
