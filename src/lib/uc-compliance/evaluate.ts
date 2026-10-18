import { REQUIREMENTS, CATALOG_VERSION } from "./catalog";
import { parseEducationProfile, type EducationProfileV1, type Applicability, type RuleCondition,
  type ApplicabilityDecision, type ComplianceDocumentEvidence, type ComplianceEvaluation, type EvaluatedRequirement } from "./model";

export interface EvaluationOptions {
  profileRevision?: number | null; asOf?: string; documents?: readonly ComplianceDocumentEvidence[];
  decisions?: readonly ApplicabilityDecision[];
}
interface ConditionResult { value: Applicability; missing: string[] }
const result = (v: boolean): ConditionResult => ({ value: v ? "applicable" : "not_applicable", missing: [] });
/** Three-valued logic: false AND unknown is false; true OR unknown is true. */
export function evaluateCondition(condition: RuleCondition, profile: EducationProfileV1): ConditionResult {
  if (condition.op === "always") return result(true);
  if (condition.op === "boolean" || condition.op === "equals") {
    const value = profile[condition.field];
    return value === null ? { value: "needs_information", missing: [condition.field] } : result(value === condition.value);
  }
  if (condition.op === "program") return profile.programTypes === null
    ? { value: "needs_information", missing: ["programTypes"] }
    : result(condition.anyOf.some(type => profile.programTypes!.includes(type)));
  const children = condition.conditions.map(c => evaluateCondition(c, profile));
  if (condition.op === "all" && children.some(c => c.value === "not_applicable")) return result(false);
  if (condition.op === "any" && children.some(c => c.value === "applicable")) return result(true);
  if (children.some(c => c.value === "needs_information")) return { value: "needs_information", missing: [...new Set(children.flatMap(c => c.missing))] };
  return result(condition.op === "all");
}
function refersToEducation(condition: RuleCondition): boolean {
  return condition.op === "program" || condition.op === "boolean" && condition.field === "educationalActivity"
    || (condition.op === "all" || condition.op === "any") && condition.conditions.some(refersToEducation);
}
function profileIssues(p: EducationProfileV1) {
  const warnings: string[] = [];
  const hasFormal = p.programTypes?.some(type => type !== "internal_nonformal") === true;
  const hasDpo = p.programTypes?.some(type => type === "dpo_upskilling" || type === "dpo_retraining") === true;
  if (hasFormal && p.educationalActivity === false) warnings.push("Выбраны образовательные программы, но образовательная деятельность отрицается. Уточните фактическую деятельность.");
  if (p.educationalActivity === true && p.programTypes?.length === 1 && p.programTypes[0] === "internal_nonformal") warnings.push("Образовательная деятельность и только внутренний неформальный курс требуют уточнения вида программы и результата.");
  if (p.legalForm === "individual_entrepreneur" && ["educational_organization", "training_unit"].includes(p.providerKind || "")) warnings.push("Правовая форма ИП не согласована с выбранной ролью организации/подразделения.");
  if (p.legalForm === "legal_entity" && p.providerKind?.startsWith("entrepreneur_")) warnings.push("Юридическое лицо не согласовано с выбранной ролью ИП.");
  if (p.providerKind === "entrepreneur_direct" && p.hiresTeachers === true) warnings.push("Непосредственное обучение ИП и привлечение преподавателей требуют уточнения основания деятельности и лицензирования.");
  if (p.legalForm === "individual_entrepreneur" && hasDpo) warnings.push("Право ИП реализовывать выбранные ДПП требует отдельной правовой проверки; исключение из лицензирования не означает право на любой вид программ.");
  if (p.providerKind === "internal_nonformal" && hasFormal) warnings.push("Неформальная роль провайдера не согласована с квалификационными образовательными программами.");
  return warnings;
}
function validDateOnly(value: string) {
  const d = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith("0000-") && Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function dateOnly(value: string) {
  if (!validDateOnly(value)) throw new Error("Некорректная дата оценки применимости");
  return value;
}
function documentEvidence(documents: readonly ComplianceDocumentEvidence[], types: readonly string[], asOf: string) {
  const candidates = documents.filter(doc => types.includes(doc.type));
  const active = candidates.find(doc => !doc.deleted_at && !!doc.file_url?.trim()
    && (!doc.status || doc.status === "active") && (!doc.expires_at || validDateOnly(doc.expires_at) && doc.expires_at >= asOf));
  return active ? { evidence: "file_present" as const, documentId: active.id }
    : { evidence: candidates.length ? "inactive" as const : "missing" as const, documentId: null };
}

/** An explainable work plan, never a legal certification or a write operation. */
export function evaluateRequirements(input: EducationProfileV1, options: EvaluationOptions = {}): ComplianceEvaluation {
  const profile = parseEducationProfile(input);
  const asOf = dateOnly(options.asOf ?? new Date().toISOString().slice(0, 10));
  const profileRevision = options.profileRevision ?? null;
  if (profileRevision !== null && (!Number.isSafeInteger(profileRevision) || profileRevision < 0)) throw new Error("Некорректная редакция профиля");
  const profileWarnings = profileIssues(profile);
  const hasProfileContradictions = profileWarnings.length > 0;
  if (profile.license.status === "suspended" || profile.license.status === "terminated") profileWarnings.push("Центр заявил приостановленное или прекращённое лицензионное основание. Проверьте актуальный статус и допустимость выбранной деятельности; платформа не проверяла реестр и не изменяет доступ автоматически.");
  const decisions = options.decisions ?? [];
  const validIds = new Set(REQUIREMENTS.map(r => r.id));
  const matching = (d: ApplicabilityDecision) => d.catalogVersion === CATALOG_VERSION && d.profileRevision === profileRevision && profileRevision !== null && profileRevision > 0;
  const staleDecisions = decisions.filter(d => validIds.has(d.requirementId) && !matching(d)).map(d => ({ ...d }));
  const requirements: EvaluatedRequirement[] = REQUIREMENTS.map(requirement => {
    const resolved = evaluateCondition(requirement.condition, profile);
    let ruleApplicability = resolved.value;
    let explanation = `${requirement.conditionDescription}. ${ruleApplicability === "applicable" ? "Условие выполнено по сохранённым ответам центра." : ruleApplicability === "not_applicable" ? "Условие не выполнено по текущему профилю." : "Для оценки недостаточно ответов профиля."}`;
    const missingFields = [...resolved.missing];
    const educational = refersToEducation(requirement.condition);
    const sourceOutsideReviewedDates = requirement.legalSources.some(s => s.effectiveFrom && asOf < s.effectiveFrom || s.effectiveUntil && asOf >= s.effectiveUntil);
    const outsideRuleDates = !!(requirement.validFrom && asOf < requirement.validFrom || requirement.validUntil && asOf >= requirement.validUntil);
    let reviewStatus = requirement.reviewStatus;
    if (educational && hasProfileContradictions && (ruleApplicability !== "not_applicable" || profile.programTypes?.some(p => p !== "internal_nonformal"))) {
      ruleApplicability = "needs_information";
      explanation += " В профиле есть противоречие правовой роли/программы; сначала устраните его.";
      reviewStatus = "needs_legal_review";
    }
    if (educational && profile.specialAreas?.length) {
      reviewStatus = "needs_legal_review";
      explanation += " Выбрано специальное направление: общий каталог не подтверждает отраслевой допуск и комплект.";
    }
    if (outsideRuleDates || sourceOutsideReviewedDates && ruleApplicability !== "not_applicable") {
      ruleApplicability = "needs_information"; reviewStatus = "needs_legal_review";
      explanation += " Дата оценки выходит за период этой версии правила или проверенного правового источника; нужна соответствующая дате редакция.";
    }
    if (["testimonial_profession", "testimonial_position"].includes(requirement.id) && ruleApplicability === "applicable") {
      ruleApplicability = "needs_information";
      explanation += " Требуется выбрать вид свидетельства по конкретной профессии или должности и программе; оба вида не требуются каждому выпускнику.";
    }
    if (requirement.id === "license" && ruleApplicability !== "not_applicable") {
      if (!profile.license.status) missingFields.push("license.status");
      if (profile.license.status === "declared_active") {
        for (const key of ["registryNumber", "authority", "checkedOn", "sourceUrl"] as const) if (!profile.license[key]) missingFields.push(`license.${key}`);
        if (profile.license.licensedActivities === null) missingFields.push("license.licensedActivities");
      }
      if (profile.license.status === "declared_exempt" && !profile.license.exemptionReason) missingFields.push("license.exemptionReason");
      if (missingFields.length || profile.license.status === "declared_exempt") ruleApplicability = "needs_information";
      explanation += " Лицензионные реквизиты и исключение являются заявлением центра, а не проверкой реестра платформой.";
    }
    let applicability = ruleApplicability;
    const candidate = decisions.find(d => d.requirementId === requirement.id);
    const decision = candidate ? { ...candidate } : null;
    const decisionState = !candidate ? "none" : !matching(candidate) ? "stale" : candidate.decision === null ? "withdrawn" : "current";
    if (decisionState === "stale") explanation += " Сохранённое решение относится к другой редакции профиля или каталога и не применяется к этой оценке.";
    if (decisionState === "withdrawn") explanation += " Ранее заявленное решение отозвано; используется оценка правила.";
    if (decisionState === "current" && candidate) {
      if (!candidate.reason.trim()) {
        applicability = "needs_information"; explanation += " У заявления центра отсутствует мотивированное основание.";
      } else if (candidate.decision === "not_applicable" && ruleApplicability !== "not_applicable") {
        applicability = "needs_information"; reviewStatus = "needs_legal_review";
        explanation += ` Центр заявил неприменение: ${candidate.reason}. Оно не отменяет выполняющееся либо неуточнённое условие без проверки.`;
      } else {
        applicability = candidate.decision!;
        explanation += ` Заявление центра: ${candidate.reason}. Это не официальная юридическая верификация.`;
        if (candidate.decision === "applicable" && ruleApplicability === "not_applicable") reviewStatus = "needs_legal_review";
      }
    }
    const evidence = documentEvidence(options.documents ?? [], requirement.existingDocTypes, asOf);
    const nextAction = applicability === "needs_information" ? "Уточнить профиль или основание и пересмотреть задачу"
      : applicability === "not_applicable" ? "Сохранить основание и пересмотреть при изменении деятельности"
      : evidence.evidence === "file_present" ? "Проверить утверждение точной версии, период и полномочия; наличие файла не подтверждает готовность"
      : requirement.creationGuidance;
    return { requirement, applicability, ruleApplicability, explanation, missingFields: [...new Set(missingFields)], reviewStatus,
      ...evidence, decision, decisionState, nextAction };
  });
  return { snapshot: { catalogVersion: CATALOG_VERSION, profileRevision, asOf, profile: structuredClone(profile) }, requirements, profileWarnings, staleDecisions,
    summary: { applicable: requirements.filter(r => r.applicability === "applicable").length,
      notApplicable: requirements.filter(r => r.applicability === "not_applicable").length,
      needsInformation: requirements.filter(r => r.applicability === "needs_information").length,
      needsLegalReview: requirements.filter(r => r.applicability !== "not_applicable" && r.reviewStatus === "needs_legal_review").length,
      filesPresent: requirements.filter(r => r.applicability === "applicable" && r.evidence === "file_present").length,
      missingEvidence: requirements.filter(r => r.applicability === "applicable" && r.evidence !== "file_present").length,
      legalReadinessConfirmed: false } };
}
