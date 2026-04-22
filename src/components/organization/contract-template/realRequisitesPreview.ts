import { supabase } from "@/integrations/supabase/client";
import { CONTRACT_PLACEHOLDERS } from "./contractTemplateHelpers";

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

  return {
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
  let preview = template;
  const missing: string[] = [];

  CONTRACT_PLACEHOLDERS.forEach((p) => {
    const cleanKey = p.key.replace(/[{}]/g, "");
    const real = (realData as Record<string, string | undefined>)[cleanKey];
    if (real && real.trim()) {
      preview = preview.split(p.key).join(real);
    } else if (preview.includes(p.key)) {
      // Используем example как мягкий fallback и подсветку
      preview = preview.split(p.key).join(p.example || "_______________");
      // Только реквизиты организации считаем «обязательными к заполнению»
      if (cleanKey.startsWith("org_") && !missing.includes(p.label)) {
        missing.push(p.label);
      }
    }
  });

  return { text: preview, missing };
}
