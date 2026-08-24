/**
 * Счётчики папок группы.
 *
 * ВАЖНО: счётчики читают ТЕ ЖЕ источники, что и содержимое папок:
 *  - «Договоры»          → public.org_contracts (student_group_id = группа ИЛИ student_user_id ∈ ученики группы)
 *  - «Документы группы»  → public.group_documents (group_id = группа, status = 'active')
 *  - «Паспорта»/«СНИЛС»  → public.student_identity_documents по ученикам группы
 *  - «Экзамены»          → public.test_attempts по ученикам группы
 */

export interface GroupFolderCounts {
  contracts: number;
  passports: number;
  snils: number;
  exams: number;
  docs: number;
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
): Promise<GroupFolderCounts> {
  if (!organizationId || !groupId) return { ...EMPTY_GROUP_FOLDER_COUNTS };

  const { data: profiles } = await client
    .from("profiles")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("student_group_id", groupId);
  const userIds: string[] = ((profiles as any[]) || []).map(p => p.user_id).filter(Boolean);

  let contractsQuery = client
    .from("org_contracts")
    .select("id")
    .eq("organization_id", organizationId);
  contractsQuery = userIds.length > 0
    ? contractsQuery.or(`student_group_id.eq.${groupId},student_user_id.in.(${userIds.join(",")})`)
    : contractsQuery.eq("student_group_id", groupId);

  const docsQuery = client
    .from("group_documents")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("group_id", groupId)
    .eq("status", "active");

  const identityQuery = userIds.length > 0
    ? client.from("student_identity_documents").select("user_id, type").in("user_id", userIds)
    : Promise.resolve({ data: [] });

  const attemptsQuery = userIds.length > 0
    ? client.from("test_attempts").select("id").in("user_id", userIds)
    : Promise.resolve({ data: [] });

  const [contractsRes, docsRes, identityRes, attemptsRes] = await Promise.all([
    contractsQuery,
    docsQuery,
    identityQuery,
    attemptsQuery,
  ]);

  const identity = countIdentityDocs(identityRes?.data as any[]);

  return {
    contracts: countUniqueContracts(contractsRes?.data as any[]),
    docs: ((docsRes?.data as any[]) || []).length,
    passports: identity.passports,
    snils: identity.snils,
    exams: ((attemptsRes?.data as any[]) || []).length,
  };
}
