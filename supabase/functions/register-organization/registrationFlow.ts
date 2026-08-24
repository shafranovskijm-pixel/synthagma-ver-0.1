export interface CreatedRegistrationArtifacts {
  userId: string | null;
  organizationId: string | null;
  profileCreated: boolean;
  roleCreated: boolean;
}

export interface RegistrationCreationTracker {
  markUserCreated: (userId: string) => void;
  markOrganizationCreated: (organizationId: string) => void;
  markProfileCreated: () => void;
  markRoleCreated: () => void;
}

export interface RegistrationCleanupAdapter {
  deleteRole: (userId: string) => Promise<void>;
  deleteProfile: (userId: string) => Promise<void>;
  deleteOrganization: (organizationId: string) => Promise<void>;
  deleteAuthUser: (userId: string) => Promise<void>;
}

export type CleanupErrorReporter = (stage: string, error: unknown) => void;

function emptyArtifacts(): CreatedRegistrationArtifacts {
  return {
    userId: null,
    organizationId: null,
    profileCreated: false,
    roleCreated: false,
  };
}

async function attemptCleanup(
  stage: string,
  action: () => Promise<void>,
  reportError: CleanupErrorReporter,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    // Cleanup is deliberately best-effort. The original provisioning error
    // remains the one returned to the caller and must never be masked here.
    try {
      reportError(stage, error);
    } catch {
      // Reporting is also best-effort: even a broken logger must not replace
      // the provisioning error that triggered cleanup.
    }
  }
}

export async function cleanupCreatedRegistration(
  adapter: RegistrationCleanupAdapter,
  created: Readonly<CreatedRegistrationArtifacts>,
  reportError: CleanupErrorReporter = (stage, error) => {
    console.error(`register-organization cleanup failed at ${stage}:`, error);
  },
): Promise<void> {
  // Reverse the provisioning order. Every destructive operation is guarded by
  // evidence that this request created the corresponding entity. In
  // particular, an existing user discovered before provisioning is never
  // recorded here and can therefore never be deleted by this cleanup.
  if (created.roleCreated && created.userId) {
    await attemptCleanup("role", () => adapter.deleteRole(created.userId!), reportError);
  }
  if (created.profileCreated && created.userId) {
    await attemptCleanup("profile", () => adapter.deleteProfile(created.userId!), reportError);
  }
  if (created.organizationId) {
    await attemptCleanup(
      "organization",
      () => adapter.deleteOrganization(created.organizationId!),
      reportError,
    );
  }
  if (created.userId) {
    await attemptCleanup("auth-user", () => adapter.deleteAuthUser(created.userId!), reportError);
  }
}

export async function runWithRegistrationCleanup<T>(
  adapter: RegistrationCleanupAdapter,
  provision: (tracker: RegistrationCreationTracker) => Promise<T>,
  reportError?: CleanupErrorReporter,
): Promise<T> {
  const created = emptyArtifacts();
  const tracker: RegistrationCreationTracker = {
    markUserCreated: (userId) => {
      created.userId = userId;
    },
    markOrganizationCreated: (organizationId) => {
      created.organizationId = organizationId;
    },
    markProfileCreated: () => {
      created.profileCreated = true;
    },
    markRoleCreated: () => {
      created.roleCreated = true;
    },
  };

  try {
    return await provision(tracker);
  } catch (originalError) {
    await cleanupCreatedRegistration(adapter, created, reportError);
    throw originalError;
  }
}
