/** Issuance SQL validates issue_date against CURRENT_DATE in an explicit UTC session. */
export function issuanceUtcDateIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
