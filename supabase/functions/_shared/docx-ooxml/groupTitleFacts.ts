/** Title-page fields come from the stored group/address and an explicit draft date. */
export interface GroupTitleFactsSnapshot {
  organization: { id: string; legal_address: string | null };
  group: {
    id: string; organization_id: string;
    start_date: string | null; end_date: string | null;
  };
}

export interface GroupTitleFactsResult {
  docType: "title_page";
  rows: Array<Record<string, string>>;
  rowSources: Array<{ userId: string }>;
  scalars: Record<"START_DATE" | "END_DATE" | "ORG_CITY" | "YEAR", string>;
  issues: Array<{
    docType: "title_page"; code: string; field: string; message: string;
    severity: "warning" | "error";
  }>;
}

function date(value: string | null | undefined): { iso: string; short: string; year: string } | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) return null;
  return { iso: raw, short: `${raw.slice(8)}.${raw.slice(5, 7)}.${raw.slice(0, 4)}`, year: raw.slice(0, 4) };
}

/** Do not treat "городской округ" or a city hidden in a street name as the city. */
function city(address: string | null): string {
  const normalized = (address || "").replace(/\s+/g, " ").trim();
  const matches = [...normalized.matchAll(/(?:^|,\s*)(?:г\.\s*|г\s+|город\s+)([^,]+)/gi)]
    .map((match) => match[1].trim()).filter(Boolean);
  if (matches.length !== 1) return "";
  const candidate = matches[0];
  // An address lacking a comma must not turn its street/house into the city.
  return /(?:^|\s)(?:ул(?:ица)?|проспект|пр-т|пер(?:еулок)?|бульвар|б-р|шоссе|ш|наб(?:ережная)?|дом|д|кв|корпус|корп|строение|стр)\.?(?:\s|$)/i.test(candidate)
    ? "" : candidate;
}

export function buildGroupTitleFacts(input: {
  snapshot: GroupTitleFactsSnapshot;
  /** Selected document metadata, not a browser scalar YEAR or the server clock. */
  documentDate: string | null | undefined;
}): GroupTitleFactsResult {
  const { organization, group } = input.snapshot;
  const result: GroupTitleFactsResult = {
    docType: "title_page", rows: [], rowSources: [],
    scalars: { START_DATE: "", END_DATE: "", ORG_CITY: "", YEAR: "" }, issues: [],
  };
  const issue = (code: string, field: string, message: string, severity: "warning" | "error" = "warning") => {
    result.issues.push({ docType: "title_page", code, field, message, severity });
  };
  if (!organization.id || !group.id || group.organization_id !== organization.id) {
    issue("group_scope_mismatch", "group.organization_id", "Группа титульного листа не подтверждена в выбранной организации.", "error");
    return result;
  }
  const start = date(group.start_date);
  const end = date(group.end_date);
  if (!start) issue("missing_or_invalid_date", "group.start_date", "Дата начала обучения не сохранена или некорректна; поле титула оставлено пустым.");
  if (!end) issue("missing_or_invalid_date", "group.end_date", "Дата окончания обучения не сохранена или некорректна; поле титула оставлено пустым.");
  if (start && end && end.iso < start.iso) {
    issue("invalid_group_period", "group.end_date", "Дата окончания предшествует началу; период на титуле оставлен пустым.");
  } else {
    result.scalars.START_DATE = start?.short || "";
    result.scalars.END_DATE = end?.short || "";
  }
  result.scalars.ORG_CITY = city(organization.legal_address);
  if (!result.scalars.ORG_CITY) {
    issue("city_not_confirmed", "organization.legal_address", "Город не удалось однозначно определить из юридического адреса; заполните его на титульном листе вручную.");
  }
  const documentDate = date(input.documentDate);
  result.scalars.YEAR = documentDate?.year || "";
  if (!documentDate) {
    issue("document_year_not_confirmed", "document_date", "Выберите дату оформления титульного листа: из неё заполняется год. Текущий год автоматически не подставляется.");
  }
  return result;
}
