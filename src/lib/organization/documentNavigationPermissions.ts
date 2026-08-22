import type { Permission } from "@/constants/rolePermissions";

/**
 * Nested Journals and FRDO are independent workspaces in the permission
 * matrix. Every other DocumentsTab subsection belongs to documents.read.
 */
export function getDocumentSubTabPermission(tab: string): Permission {
  if (tab === "journals") return "journals.read";
  if (tab === "frdo") return "frdo.read";
  return "documents.read";
}

export function canAccessDocumentSubTab(
  tab: string,
  can: (permission: Permission) => boolean,
): boolean {
  return can(getDocumentSubTabPermission(tab));
}

const DIRECT_DOCUMENT_WORKSPACE_PERMISSIONS: Partial<Record<string, Permission>> = {
  documents: "documents.read",
  journals: "journals.read",
  frdo: "frdo.read",
  "org-documents": "documents.read",
  // Contract templates are persisted in organizations.branding. Organization
  // updates are protected by the existing settings.write permission.
  "contract-editor": "settings.write",
};

/** Restricts only the document workspaces that are directly routable. */
export function getDirectDocumentWorkspacePermission(
  tab: string,
): Permission | null {
  return DIRECT_DOCUMENT_WORKSPACE_PERMISSIONS[tab] ?? null;
}
