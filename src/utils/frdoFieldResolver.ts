import { detectGenderFromMiddleName } from "@/constants/frdo";
import { isValidSnilsChecksum } from "./formatSnils";

export interface FRDODataLike {
  last_name?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  snils?: string | null;
  citizenship_code?: string | null;
  training_form?: string | null;
  financing_source?: string | null;
  education_form?: string | null;
  professional_area?: string | null;
  specialty_group?: string | null;
  qualification_name?: string | null;
  profession_name?: string | null;
  qualification_rank?: string | null;
}

export interface CourseFRDOLike {
  title?: string | null;
  training_form?: string | null;
  frdo_profession_name?: string | null;
  frdo_qualification_rank?: string | null;
  frdo_professional_area?: string | null;
  frdo_specialty_group?: string | null;
  frdo_qualification_name?: string | null;
  frdo_financing_source?: string | null;
  frdo_education_form?: string | null;
}

export interface ResolvedFRDORow {
  gender: string;
  professionName: string;
  professionalArea: string;
  specialtyGroup: string;
  qualificationName: string;
  qualificationRank: string;
  trainingForm: string;
  financingSource: string;
  educationForm: string;
  /** True when professionName had to be filled from course.title fallback */
  professionFromCourseTitle: boolean;
  /** True when gender was auto-detected from middle name */
  genderAutoDetected: boolean;
}

/**
 * Resolves FRDO export fields with cascading fallbacks:
 *   student_frdo_data → course.frdo_* → safe default.
 * `professionName` falls back further to course.title (with warning flag).
 */
export function resolveFRDOFields(
  frdo: FRDODataLike | null | undefined,
  course: CourseFRDOLike | null | undefined
): ResolvedFRDORow {
  const data = frdo ?? {};
  const c = course ?? {};

  let gender = (data.gender || "").trim();
  let genderAutoDetected = false;
  if (!gender) {
    const detected = detectGenderFromMiddleName(data.middle_name);
    if (detected) {
      gender = detected;
      genderAutoDetected = true;
    }
  }

  const professionFromStudent = (data.profession_name || "").trim();
  const professionFromCourse = (c.frdo_profession_name || "").trim();
  let professionName = professionFromStudent || professionFromCourse;
  let professionFromCourseTitle = false;
  if (!professionName) {
    professionName = (c.title || "").trim();
    professionFromCourseTitle = professionName.length > 0;
  }

  return {
    gender,
    professionName,
    professionalArea:
      (data.professional_area || "").trim() || (c.frdo_professional_area || "").trim(),
    specialtyGroup:
      (data.specialty_group || "").trim() || (c.frdo_specialty_group || "").trim(),
    qualificationName:
      (data.qualification_name || "").trim() ||
      (c.frdo_qualification_name || "").trim() ||
      "нет",
    qualificationRank:
      (data.qualification_rank || "").trim() || (c.frdo_qualification_rank || "").trim(),
    trainingForm:
      (data.training_form || "").trim() || (c.training_form || "").trim() || "Очная",
    financingSource:
      (data.financing_source || "").trim() ||
      (c.frdo_financing_source || "").trim() ||
      "Платное обучение",
    educationForm:
      (data.education_form || "").trim() ||
      (c.frdo_education_form || "").trim() ||
      "в образовательной организации",
    professionFromCourseTitle,
    genderAutoDetected,
  };
}

export interface FRDORowValidationIssue {
  field: "gender" | "snils" | "snils_checksum" | "birth_date" | "profession_name" | "last_name" | "first_name";
  message: string;
}

/**
 * Validates a resolved FRDO row against FRDO validator rules.
 * Returns array of issues (empty = valid).
 */
export function validateFRDORowSync(opts: {
  resolved: ResolvedFRDORow;
  data: FRDODataLike;
  exportType: "dpo" | "po";
}): FRDORowValidationIssue[] {
  const { resolved, data, exportType } = opts;
  const issues: FRDORowValidationIssue[] = [];

  if (!data.last_name || !data.last_name.trim()) {
    issues.push({ field: "last_name", message: "Нет фамилии" });
  }
  if (!data.first_name || !data.first_name.trim()) {
    issues.push({ field: "first_name", message: "Нет имени" });
  }
  if (!data.birth_date) {
    issues.push({ field: "birth_date", message: "Нет даты рождения" });
  }
  if (!resolved.gender) {
    issues.push({ field: "gender", message: "Пол не указан и не определяется по отчеству" });
  }

  const snils = (data.snils || "").trim();
  if (!snils) {
    issues.push({ field: "snils", message: "Нет СНИЛС" });
  } else if (!/^\d{3}-\d{3}-\d{3} \d{2}$/.test(snils)) {
    issues.push({ field: "snils", message: "СНИЛС должен быть в формате XXX-XXX-XXX XX (14 символов)" });
  } else if (!isValidSnilsChecksum(snils)) {
    issues.push({ field: "snils_checksum", message: "СНИЛС: неверная контрольная сумма" });
  }

  // PO requires profession; DPO requires qualification + program areas
  if (exportType === "po" && !resolved.professionName) {
    issues.push({ field: "profession_name", message: "Нет наименования профессии" });
  }

  return issues;
}
