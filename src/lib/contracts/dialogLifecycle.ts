/**
 * Contract generation can persist a document before the surrounding package
 * finishes. While that request is in flight the dialog must not be dismissed,
 * otherwise the same form can be reopened and submitted a second time.
 */
export function shouldDismissContractDialog(nextOpen: boolean, busy: boolean): boolean {
  return !nextOpen && !busy;
}

export interface ContractSubmissionLock {
  current: boolean;
}

/** Atomically claims a synchronous ref before React can render `busy=true`. */
export function acquireContractSubmission(lock: ContractSubmissionLock): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releaseContractSubmission(lock: ContractSubmissionLock): void {
  lock.current = false;
}
