/**
 * Чистая реляционная валидация связей договора.
 * Все идентификаторы проверяются по данным БД, клиентские UUID сами по себе
 * не могут создать связь с чужой организацией.
 */
export interface RelationalInput {
  organizationId: string;
  companyId: string;
  groupId: string | null;
  studentUserIds: string[];
  studentsMetaIds: string[];
  company: { id: string; organization_id: string } | null;
  group: { id: string; organization_id: string } | null;
  profiles: Array<{ user_id: string; organization_id: string | null; student_group_id: string | null }>;
}

export interface RelationalResult {
  ok: boolean;
  status: 200 | 403 | 422;
  error?: string;
  issues?: string[];
}

const ok: RelationalResult = { ok: true, status: 200 };

export function validateRelations(input: RelationalInput): RelationalResult {
  if (!input.studentUserIds.length) {
    return { ok: false, status: 422, error: "Не выбран ни один слушатель" };
  }
  if (!input.company) return { ok: false, status: 422, error: "Компания не найдена" };
  if (input.company.organization_id !== input.organizationId) {
    return { ok: false, status: 403, error: "Компания принадлежит другой организации" };
  }
  if (input.groupId) {
    if (!input.group) return { ok: false, status: 422, error: "Группа не найдена" };
    if (input.group.organization_id !== input.organizationId) {
      return { ok: false, status: 403, error: "Группа принадлежит другой организации" };
    }
  }

  const unique = Array.from(new Set(input.studentUserIds));
  const extraMeta = input.studentsMetaIds.filter((id) => !unique.includes(id));
  if (extraMeta.length) {
    return { ok: false, status: 422, error: "Список слушателей несогласован", issues: extraMeta };
  }

  const byUser = new Map(input.profiles.map((p) => [p.user_id, p]));
  const invalid = unique.filter((id) => {
    const p = byUser.get(id);
    if (!p || p.organization_id !== input.organizationId) return true;
    if (input.groupId && p.student_group_id !== input.groupId) return true;
    return false;
  });
  if (invalid.length) {
    return {
      ok: false,
      status: 422,
      error: "Слушатели не входят в указанную группу или организацию",
      issues: invalid,
    };
  }
  return ok;
}

/** Согласованность встроенного манифеста и метаданных реестра. */
export function validateTemplateConsistency(params: {
  manifest: Record<string, unknown>;
  registry: { template_key: string; version_label: string; template_sha256: string; manifest?: Record<string, unknown> | null };
  computedSourceSha256: string;
}): string[] {
  const m = params.manifest as Record<string, string>;
  const r = params.registry;
  const eqHash = (a?: string, b?: string) => String(a || "").toLowerCase() === String(b || "").toLowerCase();
  const issues: string[] = [];
  if (!eqHash(params.computedSourceSha256, r.template_sha256)) {
    issues.push("контрольная сумма файла шаблона ≠ реестра");
  }
  if (m.template_id !== r.template_key) issues.push(`template_id ${m.template_id} ≠ ${r.template_key}`);
  if (m.template_version !== r.version_label) issues.push(`template_version ${m.template_version} ≠ ${r.version_label}`);
  if (!eqHash(m.template_sha256, r.template_sha256)) issues.push("template_sha256 манифеста ≠ реестра");
  const rm = (r.manifest || {}) as Record<string, unknown>;
  if (rm.template_id && rm.template_id !== m.template_id) issues.push("template_id реестрового манифеста ≠ встроенного");
  if (rm.template_version && rm.template_version !== m.template_version) issues.push("template_version реестрового манифеста ≠ встроенного");
  return issues;
}
