import type { RtnNewsSourceHealth } from './rtn-updates';

export type RtnNewsRunStatus = 'queued' | 'running' | 'changed' | 'unchanged' | 'error';
export interface RtnNewsRunReceipt {
  run_id: string;
  status: RtnNewsRunStatus;
  queued_at: string;
  completed_at: string | null;
  new_event_count: number;
  correction_count: number;
  unchanged_count: number;
  error_code: string | null;
  replayed: boolean;
  last_success_at: string | null;
  cooldown_until: string | null;
}
// An active lease can belong to another worker. The202 handler intentionally
// returns only these two public fields, never a lease or actor identity.
export type RtnNewsManualReceipt = RtnNewsRunReceipt | {
  run_id: string;
  status: 'queued' | 'running';
};
export interface RtnNewsCheckState {
  check: RtnNewsRunReceipt | null;
  source_health: RtnNewsSourceHealth;
  can_request: boolean;
  next_due_at: string;
}
