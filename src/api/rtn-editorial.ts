import { supabase } from '@/integrations/supabase/client';
import type { RtnReviewPolicySummary } from '@/types/rostechnadzor';

export interface RtnReviewPolicyV2 {
  version: 'source-tracked-v2';
  legal_assessment: 'applicable_norms_and_end_dates_reviewed';
  legal_review_note: string;
}

export interface RtnReviewPolicyCapability {
  source_tracked_v2: true;
  version: 'source-tracked-v2';
  legal_assessment: 'applicable_norms_and_end_dates_reviewed';
}

export interface EditorialWorkspace {
  review_policy_capabilities?: RtnReviewPolicyCapability;
  rollout?: { stage: 'pilot' | 'paid'; revision: number; quota_integration_ready: boolean; privacy_integration_ready: boolean };
  sources: { id: string; code: string; title: string }[];
  banks: { id: string; source_id: string; code: string; title: string; parent_bank_id: string | null }[];
  source_revisions: { id: string; source_id: string; sha256: string; captured_at: string; normalization_required: boolean }[];
  bank_revisions: { id: string; bank_id: string; source_revision_id: string; question_count: number; created_at: string; normalization_version?: number }[];
  key_sets: (RtnReviewPolicySummary & { id: string; bank_id: string; bank_revision_id: string; question_count: number; material_count: number; reviewed_at: string; normative_status?: 'current' | 'review_required'; normative_cutoff_at?: string | null; editorial_review_before?: string | null })[];
  releases: { id: string; key_set_id: string; effective_from: string }[];
}

const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
async function call<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(name, args);
  if (error) throw new Error(error.code === '42501' ? 'Нужны права администратора платформы.' : error.message === 'rtn_new_review_required_for_policy_v2' ? 'Прежняя проверка не переоформляется автоматически. Проверьте пакет заново и сохраните новое заключение.' : 'Сервер не сохранил изменения. Обновите данные и повторите действие.');
  return data as T;
}
export async function getRtnEditorial(): Promise<EditorialWorkspace> {
  const data = await call<EditorialWorkspace>('get_rtn_editorial_workspace');
  if (!data || !['sources', 'banks', 'source_revisions', 'bank_revisions', 'key_sets', 'releases'].every(key => Array.isArray(data[key as keyof EditorialWorkspace]))) throw new Error('Получены неполные данные редакций.');
  const capability = data.review_policy_capabilities;
  if (capability !== undefined && (!capability || capability.source_tracked_v2 !== true || capability.version !== 'source-tracked-v2'
    || capability.legal_assessment !== 'applicable_norms_and_end_dates_reviewed')) throw new Error('Не удалось подтвердить правила новой предметной проверки. Обновите данные.');
  return data;
}
export async function rtnEditorialWorker(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('rtn-source-check', { body });
  if (error || !data || data.error) throw new Error('Сервер не выполнил обработку источника. Обновите данные, чтобы проверить результат.');
  return data;
}
export async function reviewRtnModule(bankId: string, bankRevisionId: string, payload: Record<string, unknown>, policy?: RtnReviewPolicyV2) {
  if (!Array.isArray(payload.questions) || !payload.questions.length || typeof payload.review_note !== 'string' || !payload.module || typeof payload.module !== 'object') throw new Error('Нужен пакет модуля с вопросами, материалами и заключением проверки.');
  if (policy && (policy.version !== 'source-tracked-v2' || policy.legal_assessment !== 'applicable_norms_and_end_dates_reviewed'
    || typeof policy.legal_review_note !== 'string' || policy.legal_review_note.trim().length < 20 || policy.legal_review_note.trim().length > 2500)) throw new Error('Опишите проверку применимых норм и сроков: от 20 до 2500 знаков.');
  return call<{ key_set_id: string }>(policy ? 'review_rtn_keys_v2' : 'review_rtn_keys', {
    p_bank_id: bankId, p_bank_revision_id: bankRevisionId, p_questions: payload.questions,
    p_review_note: payload.review_note, p_module: payload.module,
    ...(policy ? { p_policy: { ...policy, legal_review_note: policy.legal_review_note.trim() } } : {}),
  });
}
export function publishRtnModule(keyId: string, effectiveFrom: string, note: string) {
  return call<{ release_id: string }>('publish_rtn_release', { p_key_set_id: keyId, p_effective_from: effectiveFrom, p_release_note: note });
}

export interface RtnRolloutRequest {
  id: string; expectedRevision: number; reason: string;
  evidence: { qa_acceptance_receipt: string; technoservice_acceptance_receipt: string };
}
export function openRtnPaidRollout(request: RtnRolloutRequest) {
  return call<{ stage: 'pilot' | 'paid'; revision: number }>('set_rtn_rollout_stage', {
    p_stage: 'paid', p_expected_revision: request.expectedRevision, p_request_id: request.id,
    p_reason: request.reason, p_evidence: request.evidence,
  });
}
