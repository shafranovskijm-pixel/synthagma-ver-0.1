import { FactReadError, readExactFactPages, type FactPage } from "./groupDocumentFactsSource.ts";

export interface PassContactFactRow {
  id: string; user_id: string; organization_id: string | null;
  student_group_id: string | null; archived_at: string | null;
  phone: string | null; company_id: string | null;
}
export interface PassCompanyFactRow { id: string; organization_id: string; name: string | null }
interface PageRequest { organizationId: string; from: number; to: number }
export interface GroupPassFactsReader {
  contacts: (request: PageRequest & { groupId: string; studentUserIds: string[] }) => PromiseLike<FactPage<PassContactFactRow>>;
  companies: (request: PageRequest & { companyIds: string[] }) => PromiseLike<FactPage<PassCompanyFactRow>>;
}
export interface PassSourceIssue {
  source: "pass_contacts" | "companies";
  code: "read_failed" | "incomplete_page" | "source_changed" | "scope_mismatch";
  message: string;
}

/** Read contacts and companies with the caller's RLS; never fall back to service role. */
export async function loadGroupPassFacts(input: {
  organizationId: string; groupId: string; studentUserIds: readonly string[];
}, reader: GroupPassFactsReader) {
  const sourceIssues: PassSourceIssue[] = [];
  const fail = (source: PassSourceIssue["source"], error: unknown) => {
    sourceIssues.push({
      source, code: error instanceof FactReadError ? error.code : "read_failed",
      message: source === "pass_contacts"
        ? "Не удалось полностью подтвердить телефоны и связи с компаниями учеников. Эти поля пропуска не заполнены; обновите данные перед повторной проверкой."
        : "Не удалось полностью подтвердить компании учеников. Названия компаний в пропуске не заполнены; обновите данные перед повторной проверкой.",
    });
  };
  let contacts: PassContactFactRow[] = [];
  try {
    const users = [...new Set(input.studentUserIds)].sort();
    const seen = new Set<string>();
    for (let i = 0; i < users.length; i += 100) {
      const studentUserIds = users.slice(i, i + 100);
      const allowed = new Set(studentUserIds);
      const rows = await readExactFactPages((from, to) => reader.contacts({
        organizationId: input.organizationId, groupId: input.groupId, studentUserIds, from, to,
      }), (row) => row.organization_id === input.organizationId
        && row.student_group_id === input.groupId && !row.archived_at && allowed.has(row.user_id));
      for (const row of rows) {
        // profiles.user_id is unique. A duplicate cannot safely pick a company.
        if (seen.has(row.user_id)) throw new FactReadError("source_changed");
        seen.add(row.user_id);
        contacts.push(row);
      }
    }
  } catch (error) {
    fail("pass_contacts", error);
    contacts = [];
  }
  let companies: PassCompanyFactRow[] = [];
  try {
    const ids = [...new Set(contacts.map((row) => row.company_id).filter((id): id is string => Boolean(id)))].sort();
    for (let i = 0; i < ids.length; i += 100) {
      const companyIds = ids.slice(i, i + 100);
      const allowed = new Set(companyIds);
      companies.push(...await readExactFactPages((from, to) => reader.companies({
        organizationId: input.organizationId, companyIds, from, to,
      }), (row) => row.organization_id === input.organizationId && allowed.has(row.id)));
    }
  } catch (error) {
    fail("companies", error);
    companies = [];
  }
  return { contacts, companies, sourceIssues };
}
