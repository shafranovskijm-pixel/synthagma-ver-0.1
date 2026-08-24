import { describe, expect, it, vi } from "vitest";
import {
  runWithRegistrationCleanup,
  type RegistrationCleanupAdapter,
  type RegistrationCreationTracker,
} from "./registrationFlow";

type FailureStage = "create-user" | "organization" | "free-plan" | "profile" | "role" | "after-role";

function createAdapter(order: string[] = []): RegistrationCleanupAdapter & {
  deleteRole: ReturnType<typeof vi.fn>;
  deleteProfile: ReturnType<typeof vi.fn>;
  deleteOrganization: ReturnType<typeof vi.fn>;
  deleteAuthUser: ReturnType<typeof vi.fn>;
} {
  return {
    deleteRole: vi.fn(async () => { order.push("role"); }),
    deleteProfile: vi.fn(async () => { order.push("profile"); }),
    deleteOrganization: vi.fn(async () => { order.push("organization"); }),
    deleteAuthUser: vi.fn(async () => { order.push("auth-user"); }),
  };
}

async function simulateProvisioning(
  tracker: RegistrationCreationTracker,
  failureStage: FailureStage | null,
  originalError: Error,
): Promise<string> {
  if (failureStage === "create-user") throw originalError;
  tracker.markUserCreated("new-user");

  if (failureStage === "organization") throw originalError;
  tracker.markOrganizationCreated("new-organization");

  if (failureStage === "free-plan") throw originalError;

  if (failureStage === "profile") throw originalError;
  tracker.markProfileCreated();

  if (failureStage === "role") throw originalError;
  tracker.markRoleCreated();

  if (failureStage === "after-role") throw originalError;
  return "success";
}

async function captureFailure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("Expected provisioning to fail");
  } catch (error) {
    return error;
  }
}

describe("register-organization compensating cleanup", () => {
  it("never deletes an existing user when provisioning fails before this request creates one", async () => {
    const adapter = createAdapter();
    const originalError = new Error("Пользователь уже существует");

    const caught = await captureFailure(runWithRegistrationCleanup(
      adapter,
      async () => { throw originalError; },
    ));

    expect(caught).toBe(originalError);
    expect(adapter.deleteRole).not.toHaveBeenCalled();
    expect(adapter.deleteProfile).not.toHaveBeenCalled();
    expect(adapter.deleteOrganization).not.toHaveBeenCalled();
    expect(adapter.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("does not run cleanup when createUser itself fails", async () => {
    const adapter = createAdapter();
    const originalError = new Error("create-user failed");

    const caught = await captureFailure(runWithRegistrationCleanup(
      adapter,
      (tracker) => simulateProvisioning(tracker, "create-user", originalError),
    ));

    expect(caught).toBe(originalError);
    expect(adapter.deleteAuthUser).not.toHaveBeenCalled();
    expect(adapter.deleteOrganization).not.toHaveBeenCalled();
  });

  it("removes only the newly-created auth user when organization creation fails", async () => {
    const adapter = createAdapter();
    const originalError = new Error("organization failed");

    const caught = await captureFailure(runWithRegistrationCleanup(
      adapter,
      (tracker) => simulateProvisioning(tracker, "organization", originalError),
    ));

    expect(caught).toBe(originalError);
    expect(adapter.deleteAuthUser).toHaveBeenCalledOnce();
    expect(adapter.deleteAuthUser).toHaveBeenCalledWith("new-user");
    expect(adapter.deleteOrganization).not.toHaveBeenCalled();
    expect(adapter.deleteProfile).not.toHaveBeenCalled();
    expect(adapter.deleteRole).not.toHaveBeenCalled();
  });

  it("removes the new organization and auth user when free-plan setup fails", async () => {
    const adapter = createAdapter();
    const originalError = new Error("free-plan failed");

    const caught = await captureFailure(runWithRegistrationCleanup(
      adapter,
      (tracker) => simulateProvisioning(tracker, "free-plan", originalError),
    ));

    expect(caught).toBe(originalError);
    expect(adapter.deleteOrganization).toHaveBeenCalledWith("new-organization");
    expect(adapter.deleteAuthUser).toHaveBeenCalledWith("new-user");
    expect(adapter.deleteProfile).not.toHaveBeenCalled();
    expect(adapter.deleteRole).not.toHaveBeenCalled();
  });

  it("does not claim a failed profile write was created, but removes its new parents", async () => {
    const adapter = createAdapter();
    const originalError = new Error("profile failed");

    const caught = await captureFailure(runWithRegistrationCleanup(
      adapter,
      (tracker) => simulateProvisioning(tracker, "profile", originalError),
    ));

    expect(caught).toBe(originalError);
    expect(adapter.deleteProfile).not.toHaveBeenCalled();
    expect(adapter.deleteRole).not.toHaveBeenCalled();
    expect(adapter.deleteOrganization).toHaveBeenCalledWith("new-organization");
    expect(adapter.deleteAuthUser).toHaveBeenCalledWith("new-user");
  });

  it("removes the created profile, organization and auth user when role creation fails", async () => {
    const adapter = createAdapter();
    const originalError = new Error("role failed");

    const caught = await captureFailure(runWithRegistrationCleanup(
      adapter,
      (tracker) => simulateProvisioning(tracker, "role", originalError),
    ));

    expect(caught).toBe(originalError);
    expect(adapter.deleteRole).not.toHaveBeenCalled();
    expect(adapter.deleteProfile).toHaveBeenCalledWith("new-user");
    expect(adapter.deleteOrganization).toHaveBeenCalledWith("new-organization");
    expect(adapter.deleteAuthUser).toHaveBeenCalledWith("new-user");
  });

  it("cleans every created entity in reverse order after a later failure", async () => {
    const cleanupOrder: string[] = [];
    const adapter = createAdapter(cleanupOrder);
    const originalError = new Error("late failure");

    const caught = await captureFailure(runWithRegistrationCleanup(
      adapter,
      (tracker) => simulateProvisioning(tracker, "after-role", originalError),
    ));

    expect(caught).toBe(originalError);
    expect(cleanupOrder).toEqual(["role", "profile", "organization", "auth-user"]);
  });

  it("does not run cleanup on successful provisioning", async () => {
    const adapter = createAdapter();

    const result = await runWithRegistrationCleanup(
      adapter,
      (tracker) => simulateProvisioning(tracker, null, new Error("unused")),
    );

    expect(result).toBe("success");
    expect(adapter.deleteRole).not.toHaveBeenCalled();
    expect(adapter.deleteProfile).not.toHaveBeenCalled();
    expect(adapter.deleteOrganization).not.toHaveBeenCalled();
    expect(adapter.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("continues cleanup and rethrows the original error when a cleanup step fails", async () => {
    const cleanupOrder: string[] = [];
    const adapter = createAdapter(cleanupOrder);
    const cleanupError = new Error("organization cleanup failed");
    adapter.deleteOrganization.mockImplementationOnce(async () => {
      cleanupOrder.push("organization");
      throw cleanupError;
    });
    const reportCleanupError = vi.fn();
    const originalError = new Error("original provisioning failure");

    const caught = await captureFailure(runWithRegistrationCleanup(
      adapter,
      (tracker) => simulateProvisioning(tracker, "after-role", originalError),
      reportCleanupError,
    ));

    expect(caught).toBe(originalError);
    expect(reportCleanupError).toHaveBeenCalledWith("organization", cleanupError);
    expect(adapter.deleteAuthUser).toHaveBeenCalledWith("new-user");
    expect(cleanupOrder).toEqual(["role", "profile", "organization", "auth-user"]);
  });

  it("does not let a failing cleanup reporter mask the original error", async () => {
    const adapter = createAdapter();
    adapter.deleteOrganization.mockRejectedValueOnce(new Error("cleanup failed"));
    const originalError = new Error("original provisioning failure");

    const caught = await captureFailure(runWithRegistrationCleanup(
      adapter,
      (tracker) => simulateProvisioning(tracker, "after-role", originalError),
      () => { throw new Error("logger failed"); },
    ));

    expect(caught).toBe(originalError);
    expect(adapter.deleteAuthUser).toHaveBeenCalledWith("new-user");
  });
});
