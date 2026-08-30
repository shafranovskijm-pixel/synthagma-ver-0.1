import { supabase } from "@/integrations/supabase/client";
import { resolveAdminViewOrg } from "@/utils/adminViewOrg";

export type CourseImportScopeErrorCode =
  | "scope_unavailable"
  | "organization_not_found"
  | "organization_mismatch"
  | "permission_denied"
  | "admin_view_required";

export class CourseImportScopeError extends Error {
  readonly code: CourseImportScopeErrorCode;

  constructor(code: CourseImportScopeErrorCode, message: string) {
    super(message);
    this.name = "CourseImportScopeError";
    this.code = code;
  }
}

export interface ResolveCourseWriteScopeInput {
  userId: string;
  userRole: string | null;
  requestedOrganizationId?: string | null;
}

export interface CourseImportScope {
  organizationId: string;
  source: "admin_view" | "current_organization";
}

const SCOPE_MESSAGES: Record<CourseImportScopeErrorCode, string> = {
  scope_unavailable: "Не удалось подтвердить организацию. Проверьте соединение и повторите попытку",
  organization_not_found: "Активная организация не найдена",
  organization_mismatch: "Ссылка открыта для другой организации. Вернитесь в кабинет и запустите импорт снова",
  permission_denied: "Недостаточно прав для создания курсов в этой организации",
  admin_view_required: "Сначала откройте нужную организацию в режиме просмотра администратора",
};

function scopeError(code: CourseImportScopeErrorCode): CourseImportScopeError {
  return new CourseImportScopeError(code, SCOPE_MESSAGES[code]);
}

/**
 * Resolve the organization that owns a course write operation.
 *
 * The organizationId query parameter is deliberately treated only as a
 * consistency check. The active tenant comes from the server-backed admin
 * view resolver or current_organization_id(), and courses.write is verified
 * by the canonical authorization RPC before the caller can read into editor
 * state or persist course content.
 */
export async function resolveCourseWriteScope({
  userId,
  userRole,
  requestedOrganizationId,
}: ResolveCourseWriteScopeInput): Promise<CourseImportScope> {
  if (!userRole) {
    throw scopeError("scope_unavailable");
  }

  const requestedId = requestedOrganizationId?.trim() || null;
  const adminResolution = await resolveAdminViewOrg(userId);

  let organizationId: string;
  let source: CourseImportScope["source"];

  if (adminResolution.status === "unknown") {
    throw scopeError("scope_unavailable");
  }

  if (adminResolution.status === "admin") {
    organizationId = adminResolution.view.id;
    source = "admin_view";
  } else {
    // A platform administrator must explicitly enter view-as-organization
    // mode. A URL parameter alone must not select an arbitrary tenant.
    if (userRole === "admin") {
      throw scopeError("admin_view_required");
    }

    const { data, error } = await supabase.rpc("current_organization_id");
    if (error) throw scopeError("scope_unavailable");
    if (!data) throw scopeError("organization_not_found");

    organizationId = data;
    source = "current_organization";
  }

  if (requestedId && requestedId !== organizationId) {
    throw scopeError("organization_mismatch");
  }

  const { data: canWrite, error: permissionError } = await supabase.rpc(
    "can_access_organization",
    {
      _organization_id: organizationId,
      _permission: "courses.write",
    },
  );

  if (permissionError) throw scopeError("scope_unavailable");
  if (canWrite !== true) throw scopeError("permission_denied");

  return { organizationId, source };
}

export async function resolveCourseImportScope(
  input: ResolveCourseWriteScopeInput,
): Promise<CourseImportScope> {
  return resolveCourseWriteScope(input);
}
