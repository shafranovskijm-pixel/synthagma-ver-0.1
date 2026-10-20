export type OrganizationContextDisplayState =
  | "organization-loading"
  | "organization-unconfirmed"
  | "billing-loading"
  | "billing-unconfirmed"
  | "ready";

interface OrganizationContextDisplayInput {
  organizationId: string | null | undefined;
  organizationLoading?: boolean;
  access?: { accessReady?: boolean; loading?: boolean; error?: unknown } | null;
}

/** Presentation only: a disabled query's free fallback is not a verified plan. */
export function getOrganizationContextPresentation({
  organizationId, organizationLoading, access,
}: OrganizationContextDisplayInput) {
  let state: OrganizationContextDisplayState;
  if (!organizationId) state = organizationLoading ? "organization-loading" : "organization-unconfirmed";
  else if (access?.error) state = "billing-unconfirmed";
  else if (access?.accessReady === true) state = "ready";
  else state = access?.loading === false ? "billing-unconfirmed" : "billing-loading";

  const ready = state === "ready";
  const unconfirmed = state === "organization-unconfirmed" || state === "billing-unconfirmed";
  return {
    state,
    ready,
    loading: !ready && !unconfirmed,
    organizationPlaceholder: organizationId ? null
      : organizationLoading ? "Кабинет загружается…" : "Кабинет организации",
    billingPlaceholder: ready ? null : unconfirmed ? "Условия не подтверждены" : "Проверяем условия…",
  };
}
