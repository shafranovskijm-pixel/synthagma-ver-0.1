import { validSelfExaminationAnswers } from './self-examination-answers.ts';
import { DPO_SELF_EXAMINATION_INDICATORS, SELF_EXAMINATION_SECTIONS, type SelfExaminationUnit } from './self-examination-catalog.ts';

export type SelfExaminationProvider = 'undetermined' | 'dpo_organization' | 'other_educational_organization' | 'other_training_provider';
export interface SelfExaminationSource {
  kind: 'org_document_version'; document_id: string; version_id: string; content_hash: string;
}
export type SelfExaminationNumber = number | { count: number; share: number | null; undefined_share_reason: string | null };
export interface SelfExaminationIndicatorInput {
  code: string; label: string; unit: SelfExaminationUnit; value: SelfExaminationNumber | null;
}
export interface SelfExaminationDraftInput {
  reporting_year: number;
  provider_kind: SelfExaminationProvider;
  indicator_profile: 'undetermined' | 'dpo_annex6' | 'centre_selected';
  legal_basis_note: string;
  answers: Record<string, unknown>;
  sections: Record<string, string | null>;
  indicators: SelfExaminationIndicatorInput[];
}
export interface SelfExaminationFactConfirmation {
  fact_key: string; expected_value_hash: string; source: SelfExaminationSource;
  location: string; review_note: string;
}
export type SelfExaminationFactState = 'unknown' | 'entered' | 'confirmed' | 'not_applicable';
export interface SelfExaminationFactReview {
  fact_key: string; state: SelfExaminationFactState; value_hash: string;
  source: SelfExaminationSource | null; location: string | null; review_note: string | null;
  confirmed_by: string | null; confirmed_at: string | null;
}

const providers = new Set<SelfExaminationProvider>(['undetermined', 'dpo_organization', 'other_educational_organization', 'other_training_provider']);
const units = new Set<SelfExaminationUnit>(['people', 'people_percent', 'percent', 'units', 'years', 'thousand_rubles', 'square_metres']);
const sectionKeys = SELF_EXAMINATION_SECTIONS.map(([key]) => key);
const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype']);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hash = /^[a-f0-9]{64}$/;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && !/[\u0000\u000b\u000c\u000e-\u001f]/.test(value);
const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => !unsafeKeys.has(key) && allowed.includes(key));
function validDraftJson(value: unknown, depth = 0, budget = { remaining: 6000 }): boolean {
  if (--budget.remaining < 0 || depth > 12) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'string') return text(value, 12000);
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
  if (Array.isArray(value)) return value.length <= 250 && value.every(item => validDraftJson(item, depth + 1, budget));
  if (!object(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  return Object.entries(value).every(([key, item]) => key.length <= 100 && !unsafeKeys.has(key) && validDraftJson(item, depth + 1, budget));
}
export class SelfExaminationInputError extends Error {
  constructor(readonly code = 'INVALID_INPUT') { super(code); }
}

export function validateSelfExaminationSource(value: unknown): SelfExaminationSource {
  if (!object(value) || !keys(value, ['kind', 'document_id', 'version_id', 'content_hash']) || Object.keys(value).length !== 4
    || value.kind !== 'org_document_version' || typeof value.document_id !== 'string' || !uuid.test(value.document_id)
    || typeof value.version_id !== 'string' || !uuid.test(value.version_id) || typeof value.content_hash !== 'string' || !hash.test(value.content_hash)) throw new SelfExaminationInputError('SOURCE_UNAVAILABLE');
  return value as unknown as SelfExaminationSource;
}

export function validateSelfExaminationIndicatorValue(unit: SelfExaminationUnit, value: unknown, code: string): SelfExaminationNumber | null {
  if (value === null) return null; // Unknown is never silently converted to zero.
  if (unit === 'people_percent') {
    if (!object(value) || !keys(value, ['count', 'share', 'undefined_share_reason']) || Object.keys(value).length !== 3
      || !numeric(value.count) || !Number.isInteger(value.count)
      || !(value.share === null || numeric(value.share) && value.share <= 100)
      || !(value.undefined_share_reason === null || text(value.undefined_share_reason, 1000) && value.undefined_share_reason.trim().length > 0)
      || (value.share === null) !== (value.undefined_share_reason !== null)) throw new SelfExaminationInputError();
    return value as unknown as SelfExaminationNumber;
  }
  if (!numeric(value) || unit === 'people' && !Number.isInteger(value)
    || unit === 'percent' && code !== '1.12' && value > 100) throw new SelfExaminationInputError();
  return value;
}

export function validateSelfExaminationDraft(value: unknown, currentYear = new Date().getUTCFullYear()): SelfExaminationDraftInput {
  if (!object(value) || !keys(value, ['reporting_year', 'provider_kind', 'indicator_profile', 'legal_basis_note', 'answers', 'sections', 'indicators']) || Object.keys(value).length !== 7
    || !Number.isInteger(value.reporting_year) || Number(value.reporting_year) < 2000 || Number(value.reporting_year) > currentYear
    || !providers.has(value.provider_kind as SelfExaminationProvider)
    || !['undetermined', 'dpo_annex6', 'centre_selected'].includes(value.indicator_profile as string)
    || !text(value.legal_basis_note, 4000) || !validSelfExaminationAnswers(value.answers) || !validDraftJson(value.answers) || JSON.stringify(value.answers).length > 100000
    || Object.keys(value.answers).some(key => unsafeKeys.has(key)) || !object(value.sections) || !keys(value.sections, sectionKeys)
    || !Array.isArray(value.indicators) || value.indicators.length > 250) throw new SelfExaminationInputError();
  const sections = value.sections as Record<string, unknown>;
  if (sectionKeys.some(key => !(sections[key] === null || text(sections[key], 12000)))) throw new SelfExaminationInputError();
  if (value.indicator_profile === 'dpo_annex6' && Number(value.reporting_year) < 2025) throw new SelfExaminationInputError('HISTORICAL_CATALOG_REVIEW_REQUIRED');
  if (value.indicator_profile === 'dpo_annex6' && value.provider_kind !== 'dpo_organization') throw new SelfExaminationInputError('APPLICABILITY_REVIEW_REQUIRED');
  const seen = new Set<string>();
  for (const item of value.indicators) {
    if (!object(item) || !keys(item, ['code', 'label', 'unit', 'value']) || Object.keys(item).length !== 4 || !text(item.code, 40)
      || !/^[a-zA-Z0-9_.-]+$/.test(item.code) || unsafeKeys.has(item.code) || seen.has(item.code)
      || !text(item.label, 1000) || !item.label.trim() || !units.has(item.unit as SelfExaminationUnit)) throw new SelfExaminationInputError();
    seen.add(item.code);
    validateSelfExaminationIndicatorValue(item.unit as SelfExaminationUnit, item.value, item.code);
    if (value.indicator_profile === 'dpo_annex6') {
      const current = DPO_SELF_EXAMINATION_INDICATORS.find(row => row.code === item.code);
      if (!current || current.label !== item.label || current.unit !== item.unit) throw new SelfExaminationInputError('CATALOG_CHANGED');
    }
  }
  if (value.indicator_profile === 'dpo_annex6' && (value.indicators.length !== DPO_SELF_EXAMINATION_INDICATORS.length
    || DPO_SELF_EXAMINATION_INDICATORS.some(row => !seen.has(row.code)))) throw new SelfExaminationInputError('CATALOG_CHANGED');
  return value as unknown as SelfExaminationDraftInput;
}

export function emptySelfExaminationDraft(reportingYear: number): SelfExaminationDraftInput {
  return { reporting_year: reportingYear, provider_kind: 'undetermined', indicator_profile: 'undetermined', legal_basis_note: '',
    answers: {}, sections: Object.fromEntries(sectionKeys.map(key => [key, null])), indicators: [] };
}
