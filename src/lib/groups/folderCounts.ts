/**
 * Счётчики папок группы.
 *
 * ВАЖНО: счётчики читают ТЕ ЖЕ источники, что и содержимое папок:
 *  - «Договоры»          → public.org_contracts (student_group_id = группа ИЛИ student_user_id ∈ ученики группы)
 *  - «Документы группы»  → public.group_documents (group_id = группа, status = 'active')
 *  - «Паспорта»/«СНИЛС»  → public.student_identity_documents по ученикам группы
 *  - «Экзамены»          → public.test_attempts по ученикам группы
 */

import { fetchEffectiveGroupProfiles } from "@/api/studentGroupMemberships";
import { fetchAllRows } from "@/utils/retryFetch";
import { fetchRowsByIdBatches } from "./batchedReads";

export interface GroupFolderCounts {
  contracts: number;
  passports: number;
  snils: number;
  exams: number;
  docs: number;
}

/** Completed detail reads from this mounted group load; never a persistent cache. */
export interface GroupFolderCountSeed {
  organizationId: string;
  groupId: string;
  studentContractIds: string[];
  passports: number;
  snils: number;
  exams: number;
}

export const EMPTY_GROUP_FOLDER_COUNTS: GroupFolderCounts = {
  contracts: 0,
  passports: 0,
  snils: 0,
  exams: 0,
  docs: 0,
};

/** Уникальные договоры (одна строка может попасть и по группе, и по ученику). */
export function countUniqueContracts(rows: Array<{ id: string }> | null | undefined): number {
  return new Set((rows || []).map(r => r.id)).size;
}

export function countIdentityDocs(
  rows: Array<{ type: string }> | null | undefined,
): { passports: number; snils: number } {
  let passports = 0;
  let snils = 0;
  for (const r of rows || []) {
    if (r.type === "passport") passports += 1;
    if (r.type === "snils") snils += 1;
  }
  return { passports, snils };
}

/**
 * Загружает счётчики папок группы. Клиент передаётся параметром,
 * чтобы логику можно было покрыть тестами без сети.
 */
export async function fetchGroupFolderCounts(
  client: any,
  organizationId: string,
  groupId: string,
  initialRead?: GroupFolderCountSeed | null,
): Promise<GroupFolderCounts> {
  if (!organizationId || !groupId) return { ...EMPTY_GROUP_FOLDER_COUNTS };

  const seed = initialRead?.organizationId === organizationId && initialRead.groupId === groupId ? initialRead : null;
  const profiles = seed ? [] : await fetchEffectiveGroupProfiles<{ user_id: string }>(client, organizationId, groupId, { activeOnly: true, select: "user_id" });
  const userIds: string[] = ((profiles as any[]) || []).map(p => p.user_id).filter(Boolean);

  // Separate the two sides of the old OR: putting every group member in one
  // URL fails for large groups. Both sides retain caller RLS and tenant scope.
  const [groupContracts, studentContracts, documents, identityRows, attempts] = await Promise.all([
    fetchAllRows<{ id: string }>(({ from, to }) => client
      .from("org_contracts").select("id")
      .eq("organization_id", organizationId).eq("student_group_id", groupId)
      .order("id").range(from, to)),
    seed ? Promise.resolve(seed.studentContractIds.map(id => ({ id }))) : fetchRowsByIdBatches<{ id: string }>(userIds, (batch, { from, to }) => client
      .from("org_contracts").select("id")
      .eq("organization_id", organizationId).in("student_user_id", batch)
      .order("id").range(from, to)),
    fetchAllRows<{ id: string }>(({ from, to }) => client
      .from("group_documents").select("id")
      .eq("organization_id", organizationId).eq("group_id", groupId).eq("status", "active")
      .order("id").range(from, to)),
    seed ? Promise.resolve([]) : fetchRowsByIdBatches<{ type: string }>(userIds, (batch, { from, to }) => client
      .from("student_identity_documents").select("type")
      .eq("organization_id", organizationId).in("user_id", batch).order("id").range(from, to)),
    seed ? Promise.resolve([]) : fetchRowsByIdBatches<{ id: string }>(userIds, (batch, { from, to }) => client
      .from("test_attempts").select("id")
      .in("user_id", batch).order("id").range(from, to)),
  ]);

  const identity = countIdentityDocs(identityRows);

  return {
    contracts: countUniqueContracts([...groupContracts, ...studentContracts]),
    docs: documents.length,
    passports: seed?.passports ?? identity.passports,
    snils: seed?.snils ?? identity.snils,
    exams: seed?.exams ?? attempts.length,
  };
}
