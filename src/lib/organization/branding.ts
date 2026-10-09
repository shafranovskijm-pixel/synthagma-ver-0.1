/** The same saved cover positioning is used by organization and learner headers. */
export function getOrganizationCoverPresentation(position: unknown) {
  return {
    fit: position === "contain" ? "contain" as const : "cover" as const,
    position: position === "top"
      ? "center top"
      : position === "bottom"
        ? "center bottom"
        : "center center",
  };
}
