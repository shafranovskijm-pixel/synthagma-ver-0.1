import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

let canReadFrdo = false;
let permissionLoading = false;
const readinessHook = vi.fn();

vi.mock("@/hooks/useStaffPermissions", () => ({
  useStaffPermissions: () => ({
    loading: permissionLoading,
    can: (permission: string) => permission === "frdo.read" && canReadFrdo,
  }),
}));

vi.mock("@/hooks/useFrdoReadiness", () => ({
  useFrdoReadiness: (...args: unknown[]) => readinessHook(...args),
}));

import { FrdoReadinessBanner } from "@/components/organization/FrdoReadinessBanner";

beforeEach(() => {
  canReadFrdo = false;
  permissionLoading = false;
  readinessHook.mockReset();
  readinessHook.mockReturnValue({
    stats: { total_documents: 0 },
    loading: false,
    readinessPercent: 0,
    refresh: vi.fn(),
  });
});

describe("FrdoReadinessBanner permission boundary", () => {
  it("does not start FRDO data hooks without frdo.read", () => {
    const { container } = render(<FrdoReadinessBanner organizationId="org-1" />);

    expect(container).toBeEmptyDOMElement();
    expect(readinessHook).not.toHaveBeenCalled();
  });

  it("mounts the readiness data only after frdo.read is granted", () => {
    canReadFrdo = true;
    render(<FrdoReadinessBanner organizationId="org-1" />);

    expect(readinessHook).toHaveBeenCalledWith("org-1");
  });
});
