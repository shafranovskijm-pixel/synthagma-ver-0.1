export type EducationDocumentRecordType = "certificate" | "diploma" | "qualification";

const DEFAULT_LABELS: Record<EducationDocumentRecordType, string> = {
  certificate: "Удостоверение о повышении квалификации",
  diploma: "Диплом о профессиональной переподготовке",
  qualification: "Свидетельство о профессии рабочего, должности служащего",
};

export function resolveEducationDocumentType({
  rawType,
  exportType,
  programType,
}: {
  rawType?: string | null;
  exportType: "dpo" | "po";
  programType?: string | null;
}): { recordType: EducationDocumentRecordType; frdoLabel: string } {
  const value = (rawType || "").trim();
  const normalized = value.toLowerCase();

  let recordType: EducationDocumentRecordType;
  if (normalized === "certificate" || normalized === "diploma" || normalized === "qualification") {
    recordType = normalized;
  } else if (/диплом|переподготов/.test(normalized)) {
    recordType = "diploma";
  } else if (/удостовер|повышени.+квалификац/.test(normalized)) {
    recordType = "certificate";
  } else if (exportType === "po" || programType === "professional_training" || /свидетел|квалификац|професси/.test(normalized)) {
    recordType = "qualification";
  } else if (programType === "professional_retraining") {
    recordType = "diploma";
  } else {
    recordType = "certificate";
  }

  return {
    recordType,
    frdoLabel: value && !["certificate", "diploma", "qualification"].includes(normalized)
      ? value
      : DEFAULT_LABELS[recordType],
  };
}
