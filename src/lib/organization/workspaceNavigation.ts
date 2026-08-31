import type { TabType } from "@/components/organization/OrgSidebar";

export type StudentsView = "active" | "archive" | "groups";
export type MailingWorkspaceTab =
  | "overview"
  | "campaigns"
  | "contacts"
  | "templates"
  | "senders"
  | "reports"
  | "replies"
  | "deliverability";

/**
 * Organization workspaces that are intentionally hidden from the client UI.
 *
 * `payments` was a demo surface for course payments/T-Bank, while `sales`
 * exposed an unfinished CRM. Keep the legacy tab names in TabType so old
 * links and stored permissions remain reversible, but route them to stable
 * organization workspaces.
 */
export function normalizeOrganizationWorkspaceTab(
  tab: TabType | null | undefined,
): TabType {
  if (tab === "payments") return "subscription";
  if (tab === "sales") return "home";
  return tab ?? "home";
}

/**
 * Canonical link to an organization workspace section.
 *
 * It intentionally starts from an empty query string. Entity-specific state
 * (studentId, companyId, groupId, etc.) must never leak into a sidebar link,
 * otherwise opening that link in another browser tab can restore the wrong
 * record.
 */
export function organizationTabPath(tab: TabType): string {
  const normalizedTab = normalizeOrganizationWorkspaceTab(tab);
  return normalizedTab === "home"
    ? "/organization"
    : `/organization?tab=${encodeURIComponent(normalizedTab)}`;
}

/** Canonical link to a mailing sub-workspace inside the organization shell. */
export function organizationMailingPath(
  tab: MailingWorkspaceTab = "overview",
): string {
  return `/organization?tab=mailing&mailingTab=${encodeURIComponent(tab)}`;
}

/** URL is the only source of truth for the students workspace. */
export function studentsViewFromParams(
  params: URLSearchParams | string,
): StudentsView {
  const value = new URLSearchParams(
    typeof params === "string" ? params : params.toString(),
  ).get("studentsView");

  return value === "active" || value === "archive" || value === "groups"
    ? value
    : "groups";
}

export function resolveStudentsViewParams(
  prev: URLSearchParams | string,
  view: StudentsView,
): URLSearchParams {
  const next = new URLSearchParams(
    typeof prev === "string" ? prev : prev.toString(),
  );
  next.set("tab", "students");
  if (view === "groups") next.delete("studentsView");
  else next.set("studentsView", view);

  // A top-level students view must not inherit an entity opened in this tab.
  next.delete("studentId");
  next.delete("companyId");
  next.delete("courseId");
  next.delete("groupId");
  next.delete("folder");
  next.delete("returnToGroupId");
  next.delete("groupSettings");
  return next;
}
