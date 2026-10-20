import { supabase } from "@/integrations/supabase/client";
import { MARKETPLACE_ORG_ID } from "@/constants/marketplace";
import { safeInvoke } from "@/utils/safeInvoke";
import { blocksToJson, htmlToBlocks } from "@/components/course-builder/block-editor/parsers";
import { sanitizeHtml } from "@/components/course-builder/block-editor/utils";
import { knownPrograms, normalizeTitle, type ProgramEntry } from "@/data/knownPrograms";

export class AdminMarketplaceImportError extends Error {
  constructor(readonly kind: "scope" | "stale" | "response", message: string) {
    super(message);
    this.name = "AdminMarketplaceImportError";
  }
}

export interface AdminMarketplaceImportScope { organizationId: string }
export interface AdminMarketplaceImportOperation {
  assertCurrent: () => void;
  isCurrent: () => boolean;
  verify: () => Promise<AdminMarketplaceImportScope>;
  finish: () => void;
}

/** This is a platform marketplace operation, never a customer's view-as tenant. */
export async function resolveAdminMarketplaceImportScope(
  actorId: string,
  assertCurrent: () => void,
): Promise<AdminMarketplaceImportScope> {
  assertCurrent();
  if (!actorId.trim()) throw new AdminMarketplaceImportError("scope", "Не удалось подтвердить пользователя администратора");
  try {
    const role = await supabase.rpc("get_user_role", { _user_id: actorId });
    assertCurrent();
    if (role.error || role.data !== "admin") {
      throw new AdminMarketplaceImportError("scope", "Не удалось подтвердить права администратора. Повторите попытку");
    }
    const organization = await supabase.from("organizations").select("id").eq("id", MARKETPLACE_ORG_ID).single();
    assertCurrent();
    if (organization.error || organization.data?.id !== MARKETPLACE_ORG_ID) {
      throw new AdminMarketplaceImportError("scope", "Не удалось подтвердить организацию каталога. Повторите попытку");
    }
    const permission = await supabase.rpc("can_access_organization", {
      _organization_id: MARKETPLACE_ORG_ID, _permission: "courses.write",
    });
    assertCurrent();
    if (permission.error || permission.data !== true) {
      throw new AdminMarketplaceImportError("scope", "Не удалось подтвердить право импорта в каталог. Повторите попытку");
    }
    return { organizationId: MARKETPLACE_ORG_ID };
  } catch (error) {
    if (error instanceof AdminMarketplaceImportError) throw error;
    assertCurrent();
    throw new AdminMarketplaceImportError("scope", "Не удалось подтвердить права на импорт. Проверьте соединение и повторите попытку");
  }
}

export interface AdminImportedDocument {
  content: string;
  text: string;
}

/** Validate the current Edge contract; legacy text/content responses are errors. */
export function readAdminImportedDocument(value: unknown): AdminImportedDocument {
  const invalid = () => new AdminMarketplaceImportError("response", "Не удалось получить содержимое файла. Повторите импорт");
  if (!value || typeof value !== "object" || !("success" in value) || value.success !== true
    || !("lessons" in value) || !Array.isArray(value.lessons) || value.lessons.length === 0) throw invalid();

  const blocks: ReturnType<typeof htmlToBlocks> = [];
  const texts: string[] = [];
  for (const lesson of value.lessons) {
    if (!lesson || typeof lesson !== "object" || typeof lesson.title !== "string" || !lesson.title.trim()
      || typeof lesson.content !== "string" || !lesson.content.trim()) throw invalid();
    const clean = sanitizeHtml(lesson.content);
    const document = new DOMParser().parseFromString(clean, "text/html");
    // Keep block/cell boundaries as spaces when matching a program title.
    document.querySelectorAll("br,p,div,li,tr,td,th,h1,h2,h3,h4,h5,h6").forEach(node => node.append(" "));
    const text = (document.body.textContent || "").replace(/\s+/g, " ").trim();
    const lessonBlocks = htmlToBlocks(clean, { preserveTextStructure: true });
    if (!text || lessonBlocks.length === 0) throw invalid();
    const heading = document.createElement("span");
    heading.textContent = lesson.title.trim();
    blocks.push({ id: crypto.randomUUID(), type: "heading2", content: heading.innerHTML }, ...lessonBlocks);
    texts.push(text);
  }
  return { content: blocksToJson(blocks), text: texts.join("\n\n") };
}

export async function importAdminMarketplaceFile(
  file: File,
  operation: AdminMarketplaceImportOperation,
): Promise<AdminImportedDocument> {
  const scope = await operation.verify();
  operation.assertCurrent();
  if (scope.organizationId !== MARKETPLACE_ORG_ID) {
    throw new AdminMarketplaceImportError("scope", "Организация каталога не подтверждена");
  }
  const body = new FormData();
  body.append("organization_id", scope.organizationId);
  body.append("file", file);
  const { data, error } = await safeInvoke<unknown>("import-course", { body });
  operation.assertCurrent();
  if (error) throw error;
  return readAdminImportedDocument(data);
}

/** An unmatched document is never an instruction to import the entire catalog. */
export function findProgramsInImportedText(text: string): ProgramEntry[] {
  const normalized = normalizeTitle(text);
  if (!normalized) return [];
  const matches = knownPrograms.flatMap(program => {
    const title = normalizeTitle(program.title);
    const positions: { program: ProgramEntry; start: number; end: number }[] = [];
    let start = normalized.indexOf(title);
    while (title && start !== -1) {
      const end = start + title.length;
      if (!/[\p{L}\p{N}]/u.test(normalized[start - 1] || " ") && !/[\p{L}\p{N}]/u.test(normalized[end] || " ")) positions.push({ program, start, end });
      start = normalized.indexOf(title, start + 1);
    }
    return positions;
  });
  // A longer program name must not also select its shorter prefix program.
  return knownPrograms.filter(program => matches.some(match => match.program === program
    && !matches.some(other => other.start <= match.start && other.end >= match.end
      && (other.start < match.start || other.end > match.end))));
}
