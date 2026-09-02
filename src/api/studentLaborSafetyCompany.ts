import { supabase } from "@/integrations/supabase/client";
import { isValidInnChecksum } from "@/lib/laborSafetyXml";

export interface StudentLaborSafetyCompany {
  id: string;
  name: string;
  inn: string | null;
}

interface StudentCompanyScope {
  organizationId: string;
  userId: string;
}

type StudentLaborSafetyCompanyClient = Pick<typeof supabase, "from">;

const requireId = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Не указан ${label}`);
  return normalized;
};

const normalizeCompanyInput = (input: { name: string; inn: string }): { name: string; inn: string } => {
  const name = input.name.trim();
  const inn = input.inn.replace(/\D/g, "");
  if (!name) throw new Error("Введите наименование компании");
  if (!isValidInnChecksum(inn)) throw new Error("Проверьте ИНН: неверная длина или контрольная сумма");
  return { name, inn };
};

export async function fetchStudentLaborSafetyCompanies(
  organizationId: string,
  client: StudentLaborSafetyCompanyClient = supabase,
): Promise<StudentLaborSafetyCompany[]> {
  const scopedOrganizationId = requireId(organizationId, "контекст организации");
  const { data, error } = await client
    .from("companies")
    .select("id, name, inn")
    .eq("organization_id", scopedOrganizationId)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((company) => ({
    id: company.id,
    name: company.name,
    inn: company.inn ?? null,
  }));
}

async function fetchScopedCompany(
  organizationId: string,
  companyId: string,
  client: StudentLaborSafetyCompanyClient,
): Promise<StudentLaborSafetyCompany> {
  const { data, error } = await client
    .from("companies")
    .select("id, name, inn")
    .eq("organization_id", organizationId)
    .eq("id", companyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Компания не найдена в текущей организации");
  return { id: data.id, name: data.name, inn: data.inn ?? null };
}

export async function assignStudentLaborSafetyCompany(
  input: StudentCompanyScope & { companyId: string },
  client: StudentLaborSafetyCompanyClient = supabase,
): Promise<StudentLaborSafetyCompany> {
  const organizationId = requireId(input.organizationId, "контекст организации");
  const userId = requireId(input.userId, "ученик");
  const companyId = requireId(input.companyId, "компания");
  const company = await fetchScopedCompany(organizationId, companyId, client);

  const { data, error } = await client
    .from("profiles")
    .update({ company_id: companyId })
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .select("user_id, company_id")
    .maybeSingle();
  if (error) throw error;
  if (!data || data.user_id !== userId || data.company_id !== companyId) {
    throw new Error("Не удалось подтвердить назначение компании ученику");
  }
  return company;
}

export async function createStudentLaborSafetyCompany(
  input: { organizationId: string; name: string; inn: string },
  client: StudentLaborSafetyCompanyClient = supabase,
): Promise<StudentLaborSafetyCompany> {
  const organizationId = requireId(input.organizationId, "контекст организации");
  const values = normalizeCompanyInput(input);
  const { data, error } = await client
    .from("companies")
    .insert({ organization_id: organizationId, ...values })
    .select("id, name, inn")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Компания не была создана");
  return { id: data.id, name: data.name, inn: data.inn ?? null };
}

export async function updateStudentLaborSafetyCompany(
  input: { organizationId: string; companyId: string; name: string; inn: string },
  client: StudentLaborSafetyCompanyClient = supabase,
): Promise<StudentLaborSafetyCompany> {
  const organizationId = requireId(input.organizationId, "контекст организации");
  const companyId = requireId(input.companyId, "компания");
  const values = normalizeCompanyInput(input);
  const { data, error } = await client
    .from("companies")
    .update(values)
    .eq("organization_id", organizationId)
    .eq("id", companyId)
    .select("id, name, inn")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Не удалось подтвердить сохранение реквизитов компании");
  return { id: data.id, name: data.name, inn: data.inn ?? null };
}
