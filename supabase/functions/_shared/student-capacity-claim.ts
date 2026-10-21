/** Retry only a confirmed PostgreSQL serialization rollback, never an unknown
 * transport result. The caller closes over one immutable UID/argument set. */
export interface StudentCapacityClaimResponse {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

export async function claimStudentCapacity(
  execute: () => PromiseLike<StudentCapacityClaimResponse>,
): Promise<StudentCapacityClaimResponse> {
  const attempt = async (): Promise<StudentCapacityClaimResponse> => {
    try { return await execute(); }
    catch { return { data: null, error: { code: "CLAIM_TRANSPORT_UNKNOWN", message: "Claim response unavailable" } }; }
  };
  const first = await attempt();
  return first.error?.code === "40001" ? await attempt() : first;
}

/** A failed read, including a rejected transport promise, is never proof of
 * an unclaimed identity. Only the caller's exact positive tenant check wins. */
export async function confirmStudentCapacityClaim(read: () => PromiseLike<boolean>): Promise<boolean> {
  try { return await read() === true; }
  catch { return false; }
}
