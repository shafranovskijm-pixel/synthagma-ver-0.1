/** Called only after registration authorization and the exact profile claim. */
interface JobPositionClient {
  from(table: "profiles"): {
    update(values: { job_position: string }): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          is(column: string, value: null): {
            select(columns: string): {
              maybeSingle(): PromiseLike<{
                data: { user_id: string; organization_id: string | null; job_position: string | null } | null;
                error: unknown;
              }>;
            };
          };
        };
      };
    };
  };
}

export async function persistStudentJobPosition(
  client: JobPositionClient,
  input: {
    userId: string;
    organizationId: string;
    jobPosition?: string;
    staffAuthorized: boolean;
    publicRegistration: boolean;
  },
): Promise<boolean | undefined> {
  // Blank imports leave a previously recorded position intact.
  if (!input.jobPosition) return undefined;
  if (input.publicRegistration || !input.staffAuthorized || !input.userId || !input.organizationId) {
    return false;
  }
  try {
    const { data, error } = await client.from("profiles")
      .update({ job_position: input.jobPosition })
      .eq("user_id", input.userId)
      .eq("organization_id", input.organizationId)
      .is("archived_at", null)
      .select("user_id, organization_id, job_position")
      .maybeSingle();
    return !error && data?.user_id === input.userId
      && data.organization_id === input.organizationId
      && data.job_position === input.jobPosition;
  } catch {
    // The profile remains usable; callers return a retryable partial result.
    return false;
  }
}
