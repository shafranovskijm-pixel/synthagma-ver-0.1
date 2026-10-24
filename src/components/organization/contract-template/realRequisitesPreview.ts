import { supabase } from "@/integrations/supabase/client";
import { CONTRACT_PLACEHOLDERS } from "./contractTemplateHelpers";
import { resolveContractFacts } from "@/lib/contracts/contractFacts";

export interface RealRequisites {
  org_name?: string;
  org_inn?: string;
  org_kpp?: string;
  org_ogrn?: string;
  org_address?: string;
  org_director_name?: string;
  org_director_name_genitive?: string;
  org_director_position?: string;
  org_director_acting?: string;
  org_bank_name?: string;
  org_bank_bik?: string;
  org_bank_account?: string;
  org_bank_corr_account?: string;
  org_license_number?: string;
  org_license_date?: string;
  org_license_issuer?: string;
}

function toGenitiveFio(name: string): string {
  // Очень простое приближение: ФИО → родительный падеж не реализуем точно,
  // возвращаем как есть. Для полноценной морфологии нужна отдельная либа.
  return name;
}

export async function loadRealRequisites(organizationId: string): Promise<RealRequisites> {
  const { data } = await supabase
    .from("organizations")
    .select(
      "name, inn, kpp, ogrn, legal_address, actual_address, director_name, director_position, director_gender, bank_name, bank_bik, bank_account, bank_corr_account, branding"
    )
    .eq("id", organizationId)
    .maybeSingle();

  if (!data) return {};

  const branding = (data.branding as Record<string, unknown> | null) || {};
  const customName = (branding.customName as string | undefined) || "";
  const orgName = customName || data.name || "";
  const directorName = data.director_name || "";
  const gender = (data as any).director_gender === "female" ? "female" : "male";

  const license = await resolveContractFacts(supabase as unknown as Parameters<typeof resolveContractFacts>[0],
    organizationId, [], "{{org_license_number}} {{org_license_issuer}}").catch(() => null);
  return {
    org_license_number: license?.org_license_number ?? "",
    org_license_issuer: license?.org_license_issuer ?? "",
    org_name: orgName,
    org_inn: data.inn || "",
    org_kpp: data.kpp || "",
    org_ogrn: data.ogrn || "",
    org_address: data.legal_address || data.actual_address || "",
    org_director_name: directorName,
    org_director_name_genitive: toGenitiveFio(directorName),
    org_director_position: data.director_position || "",
    org_director_acting: gender === "female" ? "действующей" : "действующего",
    org_bank_name: data.bank_name || "",
    org_bank_bik: data.bank_bik || "",
    org_bank_account: data.bank_account || "",
    org_bank_corr_account: data.bank_corr_account || "",
  };
}

export function getPreviewWithRealRequisites(
  template: string,
  realData: RealRequisites
): { text: string; missing: string[] } {
  const missing: string[] = [];
  const labels = new Map(CONTRACT_PLACEHOLDERS.map(p => [p.key.replace(/[{}]/g, ""), p.label]));
  const text = template.replace(/\{\{([^{}]*)\}\}/g, (_token, raw: string) => {
    const key = raw.trim(), label = labels.get(key);
    const real = realData[key as keyof RealRequisites];
    if (label && typeof real === "string" && real.trim() && !real.includes("{{") && !real.includes("}}")) return real;
    const missingLabel = label || "Неизвестная переменная";
    if (!missing.includes(missingLabel)) missing.push(missingLabel);
    return label ? `[Не подтверждено: ${label}]` : "[Неизвестная переменная]";
  });
  if ((text.includes("{{") || text.includes("}}")) && !missing.includes("Некорректная переменная")) missing.push("Некорректная переменная");
  return { text, missing };
}
