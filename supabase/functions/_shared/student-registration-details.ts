/** Shared validation for staff registration and spreadsheet imports. Empty fields mean no change. */
export interface StudentRegistrationDetails {
  department?: string;
  snils?: string;
  birth_date?: string;
  confirm_identity?: boolean;
}

function optionalText(value: unknown, label: string): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`${label}: ожидается текст`);
  return value.trim() || undefined;
}

export function normalizeBirthDate(value: unknown, today = new Date()): string | undefined {
  const text = optionalText(value, "Дата рождения");
  if (!text) return undefined;
  const russian = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  const iso = russian ? `${russian[3]}-${russian[2]}-${russian[1]}` : text;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!parts) throw new Error("Дата рождения: используйте ДД.ММ.ГГГГ или ГГГГ-ММ-ДД");
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso || Number(parts[1]) < 1) {
    throw new Error("Дата рождения: такой даты не существует");
  }
  if (iso > today.toISOString().slice(0, 10)) throw new Error("Дата рождения не может быть в будущем");
  return iso;
}

export function normalizeStudentRegistrationDetails(input: Record<string, unknown>): StudentRegistrationDetails {
  const department = optionalText(input.department, "Подразделение");
  if (department && (department.length > 200 || /[\u0000-\u001f]/.test(department))) {
    throw new Error("Подразделение: не более 200 символов без переносов строк");
  }
  const rawSnils = optionalText(input.snils, "СНИЛС");
  let snils: string | undefined;
  if (rawSnils) {
    if (!/^[\d\s-]+$/.test(rawSnils) || rawSnils.replace(/[\s-]/g, "").length !== 11) {
      throw new Error("СНИЛС должен содержать 11 цифр; в Excel задайте текстовый формат, чтобы сохранить начальные нули");
    }
    const digits = rawSnils.replace(/[\s-]/g, "");
    snils = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  const birth_date = normalizeBirthDate(input.birth_date);
  if (input.confirm_identity != null && typeof input.confirm_identity !== "boolean") {
    throw new Error("Подтверждение идентификации должно быть явной отметкой");
  }
  return {
    ...(department ? { department } : {}),
    ...(snils ? { snils } : {}),
    ...(birth_date ? { birth_date } : {}),
    ...(input.confirm_identity === true ? { confirm_identity: true } : {}),
  };
}

export function hasStudentRegistrationDetails(details: StudentRegistrationDetails): boolean {
  return Boolean(details.department || details.snils || details.birth_date || details.confirm_identity);
}

export function resolveRegistrationProfile<T extends { user_id: string; login?: string | null; email?: string | null }>(
  candidates: T[], email: string, login?: string,
): T | null {
  const profiles = Array.from(new Map(candidates.map(profile => [profile.user_id, profile])).values());
  if (profiles.length > 1) throw new Error("Email и логин относятся к разным ученикам. Проверьте строку импорта.");
  const profile = profiles[0] || null;
  if (profile && ((login && profile.login !== login) || (email && profile.email && profile.email.toLowerCase() !== email.toLowerCase()))) {
    throw new Error("Email и логин не совпадают с существующим учеником. Проверьте строку импорта.");
  }
  return profile;
}
