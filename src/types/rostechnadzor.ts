export type RtnKeyStatus = "unreviewed" | "reviewed" | "released";
export type RtnCheckStatus = "queued" | "running" | "unchanged" | "changed" | "error" | "success";

export interface RtnBank {
  id: string;
  code: string;
  title: string;
  domain: string;
  source_id: string;
  source_revision_id: string | null;
  bank_revision_id?: string | null;
  source_url: string | null;
  document_url?: string | null;
  approved_on: string | null;
  effective_from: string | null;
  question_count: number;
  release_id: string | null;
  key_status: RtnKeyStatus;
  available_for_training: boolean;
  can_manual_check: boolean;
  last_checked_at: string | null;
  last_success_at: string | null;
  check_status: RtnCheckStatus | null;
  pending_source_revision_id?: string | null;
  pending_bank_revision_id?: string | null;
  pending_key_status?: "normalization_required" | "unreviewed" | "reviewed" | null;
  active_release?: {
    release_id: string;
    source_revision_id: string;
    bank_revision_id: string;
    question_count: number;
    effective_from: string;
    approved_on: string | null;
  } | null;
}

export interface RtnSettings {
  notify_updates: boolean;
  show_archived_releases: boolean;
}

export interface RtnSourceCheck {
  id: string;
  run_id?: string;
  source_id: string;
  status: RtnCheckStatus;
  queued_at?: string | null;
  completed_at?: string | null;
  last_success_at?: string | null;
  error?: string | null;
}

export interface RtnAssignment {
  id: string;
  bank_id: string;
  student_id: string;
  status?: string;
  assigned_at?: string | null;
  student_name?: string | null;
}

export interface RtnResult {
  attempt_id: string;
  assignment_id?: string;
  student_id: string;
  bank_id: string;
  release_id: string;
  title?: string;
  score?: number | null;
  correct?: number | null;
  total?: number | null;
  passed?: boolean | null;
  submitted_at?: string | null;
  student_name?: string | null;
}

export interface RtnWorkspace {
  access: { allowed: boolean; reason: string | null; can_manage: boolean; can_assign: boolean; can_view_results: boolean; pilot: boolean; pilot_kind?: 'technoservice' | 'technical_qa' | null };
  banks: RtnBank[];
  settings: RtnSettings;
  checks: RtnSourceCheck[];
  assignments: RtnAssignment[];
  results: RtnResult[];
  students: { id: string; user_id: string; full_name: string; group_id?: string | null; group_ids?: string[] }[];
  groups: { id: string; name: string }[];
  archived_releases?: RtnReleaseMetadata[];
}

export interface RtnReleaseMetadata {
  title?: string;
  bank_id: string;
  bank_code: string;
  release_id: string;
  key_set_id: string;
  bank_revision_id: string;
  source_revision_id: string;
  question_count: number;
  effective_from: string;
  published_at: string;
  is_current: boolean;
  state: "current" | "archived" | "scheduled";
  source_url: string;
  document_url: string;
}

export interface RtnCheckResult {
  run_id: string;
  status: RtnCheckStatus;
  queued_at?: string | null;
  last_success_at?: string | null;
  error?: string | null;
  replayed?: boolean;
}

export function canAssignRtnBank(bank: RtnBank): boolean {
  return bank.available_for_training === true && bank.key_status === "released" && !!bank.release_id;
}

export interface RtnStudentAssignment {
  id: string;
  assignment_id: string;
  organization_id: string;
  bank_id: string;
  code: string;
  title: string;
  status: string;
  assigned_at: string;
  access_allowed: boolean;
  last_attempt_id: string | null;
  last_score: number | null;
  last_passed: boolean | null;
}

export interface RtnStudentWorkspace {
  assignments: RtnStudentAssignment[];
  access: { allowed: boolean };
}

export interface RtnPublicQuestion {
  id: string;
  number: number;
  text: string;
  options: { id: string; text: string }[];
  options_origin?: "authorial_training" | "official";
  expected_correct_count?: number;
}

export type RtnAnswers = Record<string, string[]>;

export interface RtnAttemptDraft {
  attempt_id: string;
  status: "active" | "submitted";
  revision: number;
  answers: RtnAnswers;
  saved_at: string | null;
}

export interface RtnAttempt {
  attempt_id: string;
  assignment_id?: string;
  release_id: string;
  title?: string;
  code?: string;
  status: "active" | "submitted";
  questions: RtnPublicQuestion[];
  materials?: RtnMaterial[];
  feedback?: { id: string; explanation?: string | null; evidence: { url: string; citation: string }[] }[] | null;
  answers?: RtnAnswers;
  draft_revision?: number;
  started_at: string;
  score?: number | null;
  total?: number;
  correct?: number | null;
  passed?: boolean | null;
  submitted_at?: string | null;
}

export interface RtnSubmission {
  attempt_id: string;
  release_id: string;
  status: "submitted";
  score: number;
  total: number;
  correct: number;
  passed: boolean;
  submitted_at: string;
}

export interface RtnMaterial {
  id: string;
  title: string;
  body: string;
  source_refs: { url: string; citation: string }[];
}

export interface RtnAssignmentDetail {
  assignment: { id: string; organization_id: string; bank_id: string; code: string; title: string; status: string };
  release: { id: string; effective_from: string; question_count: number };
  source: { page_url: string; document_url: string; approved_on: string | null };
  materials: RtnMaterial[];
}
