export interface GroupDocumentClientProfile {
  key: "goreltech" | "generic";
  shortName: string;
  directorPositionFallback: string;
  responsiblePersonFallback: string;
  expulsionOutcomeFallback: string;
  cityFallback: string;
}

export const GORELTECH_INN = "7806541216";
export const GORELTECH_ORGANIZATION_ID = "7237f9d4-3670-4a19-8946-a43c68fd3473";

export interface GroupDocumentOrganizationIdentity {
  id?: string | null;
  name: string;
  inn?: string | null;
}

export function isGoreltechExactTemplateOrganization(
  organization: GroupDocumentOrganizationIdentity,
): boolean {
  return organization.id?.toLowerCase() === GORELTECH_ORGANIZATION_ID
    && organization.inn?.replace(/\D/g, "") === GORELTECH_INN
    && /ГОРЭЛТЕХ/i.test(organization.name);
}

/**
 * Клиентские формулировки изолированы в одном профиле. Они применяются только
 * к ГОРЭЛТЕХ; документы остальных организаций берут реквизиты из их карточек
 * и не получают чужие ФИО, город или должность.
 */
export function resolveGroupDocumentClientProfile(
  organization: GroupDocumentOrganizationIdentity,
): GroupDocumentClientProfile {
  if (isGoreltechExactTemplateOrganization(organization)) {
    return {
      key: "goreltech",
      shortName: "ООО «ИЦ «ГОРЭЛТЕХ»",
      directorPositionFallback: "Генеральный директор",
      responsiblePersonFallback: "Ляпко Дарья Константиновна",
      expulsionOutcomeFallback: "без выдачи удостоверений о повышении квалификации",
      cityFallback: "Санкт-Петербург",
    };
  }

  return {
    key: "generic",
    shortName: organization.name,
    directorPositionFallback: "",
    responsiblePersonFallback: "",
    expulsionOutcomeFallback: "",
    cityFallback: "",
  };
}
