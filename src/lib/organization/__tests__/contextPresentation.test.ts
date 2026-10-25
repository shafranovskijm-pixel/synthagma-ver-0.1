import { describe, expect, it } from "vitest";
import { getOrganizationContextPresentation } from '../contextPresentation.ts';

describe("organization context presentation", () => {
  it.each([
    { organizationId: null, organizationLoading: true, access: { accessReady: false, loading: false }, state: "organization-loading" },
    { organizationId: null, organizationLoading: false, access: { accessReady: false, loading: false }, state: "organization-unconfirmed" },
    { organizationId: null, organizationLoading: true, access: { accessReady: true, loading: false }, state: "organization-loading" },
    { organizationId: "org", organizationLoading: false, access: undefined, state: "billing-loading" },
    { organizationId: "org", organizationLoading: false, access: { accessReady: false, loading: true }, state: "billing-loading" },
    { organizationId: "org", organizationLoading: false, access: { accessReady: false, loading: false }, state: "billing-unconfirmed" },
    { organizationId: "org", organizationLoading: false, access: { accessReady: false, loading: false, error: "unconfirmed" }, state: "billing-unconfirmed" },
    { organizationId: "org", organizationLoading: true, access: { accessReady: true, loading: false }, state: "ready" },
  ])("shows $state without inventing a tariff", ({ state, ...input }) => {
    const display = getOrganizationContextPresentation(input);
    expect(display.state).toBe(state);
    expect(display.ready).toBe(state === "ready");
    expect(display.billingPlaceholder).toBe(state === "ready" ? null
      : state.endsWith("unconfirmed") ? "Условия не подтверждены" : "Проверяем условия…");
  });
  it("does not derive confirmation from loading false or plan-like fallback fields", () => {
    const display = getOrganizationContextPresentation({ organizationId: "org", access: { loading: false } });
    expect(display.ready).toBe(false);
    expect(display.billingPlaceholder).toBe("Условия не подтверждены");
  });
  it("drops the organization placeholder immediately after the tenant is confirmed", () => {
    expect(getOrganizationContextPresentation({ organizationId: null, organizationLoading: true }).organizationPlaceholder).toBe("Кабинет загружается…");
    expect(getOrganizationContextPresentation({ organizationId: "org", access: { accessReady: false, loading: true } }).organizationPlaceholder).toBeNull();
  });
});
