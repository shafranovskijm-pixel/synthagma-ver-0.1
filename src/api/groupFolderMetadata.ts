import { z } from "zod";
import { fetchEffectiveGroupProfiles } from "@/api/studentGroupMemberships";

const uuid = z.string().uuid();
const text = z.string().nullable();
const profile = z.object({
  user_id: uuid, full_name: text, email: text, login: text, phone: text, archived_at: text, department: text,
}).strict();
const roster = z.object({
  version: z.literal(1), organization_id: uuid, group_id: uuid, profiles: z.array(profile),
}).strict();
const participant = z.object({
  version: z.literal(1), organization_id: uuid, group_id: uuid, user_ids: z.array(uuid), linked_course_id: uuid.nullable(),
  identity_rows: z.array(z.object({ user_id: uuid, type: z.string(), organization_id: uuid.nullable() }).strict()),
  contract_rows: z.array(z.object({ id: uuid, student_user_id: uuid }).strict()),
  attempt_rows: z.array(z.object({ id: uuid, user_id: uuid }).strict()),
  frdo_rows: z.array(z.object({ user_id: uuid, last_name: text, first_name: text, middle_name: text,
    birth_date: text, gender: text, snils: text, citizenship_code: text, education_level: text,
    passport_series: text, passport_number: text }).strict()),
  enrollment_rows: z.array(z.object({ course_id: uuid.nullable(), user_id: uuid, status: text,
    progress: z.number().finite().nullable(), completed_at: text }).strict()).nullable(),
  enrollment_error: z.boolean(),
}).strict();

// Explicit required keys preserve the validated wire contract when this app's
// strictNullChecks=false makes Zod's inferred object properties optional.
export interface GroupRosterProfile {
  user_id: string;
  full_name: string | null;
  email: string | null;
  login: string | null;
  phone: string | null;
  archived_at: string | null;
  department: string | null;
}
interface GroupRosterMetadata {
  version: 1;
  organization_id: string;
  group_id: string;
  profiles: GroupRosterProfile[];
}
export interface GroupParticipantMetadata {
  version: 1;
  organization_id: string;
  group_id: string;
  user_ids: string[];
  linked_course_id: string | null;
  identity_rows: Array<{ user_id: string; type: string; organization_id: string | null }>;
  contract_rows: Array<{ id: string; student_user_id: string }>;
  attempt_rows: Array<{ id: string; user_id: string }>;
  frdo_rows: Array<{
    user_id: string;
    last_name: string | null;
    first_name: string | null;
    middle_name: string | null;
    birth_date: string | null;
    gender: string | null;
    snils: string | null;
    citizenship_code: string | null;
    education_level: string | null;
    passport_series: string | null;
    passport_number: string | null;
  }>;
  enrollment_rows: Array<{
    course_id: string | null;
    user_id: string;
    status: string | null;
    progress: number | null;
    completed_at: string | null;
  }> | null;
  enrollment_error: boolean;
}
export type GroupMetadataSource = "rpc" | "legacy";

function invalidResponse(): never {
  throw Object.assign(new Error("group_metadata_invalid_response"), { code: "GROUP_METADATA_INVALID" });
}

/** Only an exact missing target RPC permits the existing RLS loader during rollout. */
export function isMissingGroupMetadataRpc(error: unknown, name: "get_group_roster_metadata" | "get_group_participant_metadata_batch"): boolean {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  return candidate?.code === "PGRST202" && typeof candidate.message === "string"
    && new RegExp(`^Could not find the function public\\.${name}\\([^\\r\\n]*\\) in the schema cache$`).test(candidate.message);
}

export async function fetchGroupRosterMetadata(client: any, organizationId: string, groupId: string): Promise<{ profiles: GroupRosterProfile[]; source: GroupMetadataSource }> {
  const { data, error } = await client.rpc("get_group_roster_metadata", { p_organization_id: organizationId, p_group_id: groupId });
  if (error) {
    if (!isMissingGroupMetadataRpc(error, "get_group_roster_metadata")) throw error;
    const profiles = await fetchEffectiveGroupProfiles<GroupRosterProfile>(client, organizationId, groupId,
      { select: "user_id, full_name, email, login, phone, archived_at, department" });
    return { profiles, source: "legacy" };
  }
  const parsed = roster.safeParse(data);
  if (!parsed.success) invalidResponse();
  const value = parsed.data as GroupRosterMetadata;
  if (value.organization_id !== organizationId || value.group_id !== groupId
    || new Set(value.profiles.map(row => row.user_id)).size !== value.profiles.length) invalidResponse();
  return { profiles: value.profiles, source: "rpc" };
}

function decodeParticipantMetadata(data: unknown, organizationId: string, groupId: string,
  userIds: string[], linkedCourseId: string | null): GroupParticipantMetadata {
  const parsed = participant.safeParse(data);
  if (!parsed.success) invalidResponse();
  const value = parsed.data as GroupParticipantMetadata;
  const active = new Set(userIds);
  if (active.size !== userIds.length || value.organization_id !== organizationId || value.group_id !== groupId
    || value.linked_course_id !== linkedCourseId || value.user_ids.length !== active.size
    || new Set(value.user_ids).size !== active.size || value.user_ids.some(id => !active.has(id))
    || [...value.identity_rows, ...value.attempt_rows, ...value.frdo_rows, ...(value.enrollment_rows || [])].some(row => !active.has(row.user_id))
    || value.contract_rows.some(row => !active.has(row.student_user_id))
    || new Set(value.contract_rows.map(row => row.id)).size !== value.contract_rows.length
    || new Set(value.attempt_rows.map(row => row.id)).size !== value.attempt_rows.length
    || new Set(value.frdo_rows.map(row => row.user_id)).size !== value.frdo_rows.length
    || (value.enrollment_error ? linkedCourseId === null || value.enrollment_rows !== null : value.enrollment_rows === null)
    || (linkedCourseId !== null && value.enrollment_rows?.some(row => row.course_id !== linkedCourseId))) invalidResponse();
  return value;
}

async function readParticipantBatch(client: any, organizationId: string, groupId: string,
  userIds: string[], linkedCourseId: string | null): Promise<GroupParticipantMetadata> {
  const { data, error } = await client.rpc("get_group_participant_metadata_batch", {
    p_organization_id: organizationId, p_group_id: groupId, p_user_ids: userIds, p_linked_course_id: linkedCourseId,
  });
  if (error) throw error;
  return decodeParticipantMetadata(data, organizationId, groupId, userIds, linkedCourseId);
}

/**
 * One small probe checks rollout availability before the bounded worker queue.
 * No partial metadata is returned: every batch and the aggregate must validate.
 * Null permits the old loader only for the exact missing RPC, never an error.
 */
export async function readGroupParticipantMetadata(client: any, organizationId: string, groupId: string,
  userIds: string[], linkedCourseId: string | null, options: { isCurrent?: () => boolean } = {}): Promise<GroupParticipantMetadata | null> {
  const ids = [...userIds];
  if (new Set(ids).size !== ids.length) invalidResponse();
  const assertCurrent = () => {
    if (options.isCurrent && !options.isCurrent()) {
      throw Object.assign(new Error("group_metadata_cancelled"), { code: "GROUP_METADATA_CANCELLED" });
    }
  };
  const batches: string[][] = [];
  for (let offset = 0; offset < ids.length; offset += 100) batches.push(ids.slice(offset, offset + 100));
  if (!batches.length) batches.push([]);
  assertCurrent();
  let first: GroupParticipantMetadata;
  try {
    first = await readParticipantBatch(client, organizationId, groupId, batches[0], linkedCourseId);
  } catch (error) {
    assertCurrent();
    if (isMissingGroupMetadataRpc(error, "get_group_participant_metadata_batch")) return null;
    throw error;
  }
  assertCurrent();
  const results: GroupParticipantMetadata[] = [first];
  let cursor = 1;
  let stopped = false;
  let failure: { error: unknown } | null = null;
  const worker = async () => {
    while (!stopped && cursor < batches.length) {
      const index = cursor++;
      try {
        assertCurrent();
        const result = await readParticipantBatch(client, organizationId, groupId, batches[index], linkedCourseId);
        assertCurrent();
        results[index] = result;
      } catch (error) {
        if (!failure || (isMissingGroupMetadataRpc(failure.error, "get_group_participant_metadata_batch")
          && !isMissingGroupMetadataRpc(error, "get_group_participant_metadata_batch"))) failure = { error };
        stopped = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, batches.length - 1) }, worker));
  assertCurrent();
  if (failure) throw failure.error;
  // After a successful probe every failure is fatal, including later schema
  // changes. Never mix partial RPC results with a second legacy read.
  if (results.filter(Boolean).length !== batches.length) invalidResponse();
  const enrollmentError = results.some(result => result.enrollment_error);
  return decodeParticipantMetadata({
    version: 1, organization_id: organizationId, group_id: groupId,
    user_ids: [...ids].sort(), linked_course_id: linkedCourseId,
    identity_rows: results.flatMap(result => result.identity_rows),
    contract_rows: results.flatMap(result => result.contract_rows),
    attempt_rows: results.flatMap(result => result.attempt_rows),
    frdo_rows: results.flatMap(result => result.frdo_rows),
    enrollment_rows: enrollmentError ? null : results.flatMap(result => result.enrollment_rows || []),
    enrollment_error: enrollmentError,
  }, organizationId, groupId, ids, linkedCourseId);
}
