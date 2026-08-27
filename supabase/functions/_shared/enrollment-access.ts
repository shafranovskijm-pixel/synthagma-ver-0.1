export interface EnrollmentAccessSnapshot {
  status: string | null;
  expires_at: string | null;
}

/** Mirrors the learner gate: completed courses remain readable after expiry. */
export function isEnrollmentAccessExpired(
  enrollment: EnrollmentAccessSnapshot,
  now: Date = new Date(),
): boolean {
  if (!enrollment.expires_at || enrollment.status === "completed") return false;

  const expiresAt = new Date(enrollment.expires_at);
  return Number.isFinite(expiresAt.getTime()) && expiresAt < now;
}
