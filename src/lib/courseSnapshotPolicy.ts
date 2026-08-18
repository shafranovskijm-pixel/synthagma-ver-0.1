export function resolveSnapshotOrganizationId(
  courseOrganizationId: string | null | undefined,
): string | null {
  // The persisted course row is the only authoritative tenant source. Falling
  // back to UI/session context could stamp a snapshot with another open tab's
  // organization id and must therefore fail closed.
  return courseOrganizationId?.trim() || null;
}
