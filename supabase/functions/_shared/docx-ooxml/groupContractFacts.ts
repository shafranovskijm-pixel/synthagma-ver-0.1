import { FactReadError, readExactFactPages, type FactPage } from "./groupDocumentFactsSource.ts";

export interface GroupContractFactRow {
  id: string;
  organization_id: string;
  student_group_id: string | null;
  student_user_id: string | null;
  company_id: string | null;
  counterparty_type: string | null;
  contract_number: string | null;
  contract_date: string | null;
  status: string;
  generation_status: string;
  students: unknown;
}
export interface GroupContractCompanyFactRow { id: string; organization_id: string }
interface PageRequest { organizationId: string; from: number; to: number }
/** Implement both methods with the caller's RLS client, exact count and stable ID order. */
export interface GroupContractFactsReader {
  contracts: (request: PageRequest & { groupId: string; contractIds: string[] }) => PromiseLike<FactPage<GroupContractFactRow>>;
  companies: (request: PageRequest & { companyIds: string[] }) => PromiseLike<FactPage<GroupContractCompanyFactRow>>;
}
export interface GroupContractSource {
  id: string;
  organization_id: string;
  student_group_id: string;
  contract_number: string;
  contract_date: string | null;
  status: string;
  generation_status: string;
  counterparty_type: "individual" | "legal";
  company_id: string | null;
  student_user_ids: string[];
}
export interface GroupContractFactsResult {
  line: string;
  sources: GroupContractSource[];
  issues: Array<{ code: string; field: string; message: string; severity: "error" | "warning" }>;
  coveredStudentUserIds: string[];
  missingStudentUserIds: string[];
}

const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const canonical = (value: string) => value.toLowerCase();
const CHUNK_SIZE = 100;
// draft/active are written by the DOCX/HTML generators. approved/signed are
// explicitly supported by org_contracts_enforce_immutability (20260804182823).
const SUPPORTED_STATUSES = new Set(["draft", "active", "approved", "signed"]);
const SUPPORTED_GENERATION_STATUSES = new Set(["draft", "generated"]);

class ContractFactError extends Error {
  constructor(readonly code: string) { super(code); }
}
function validDate(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function uniqueUuids(values: readonly unknown[], code: string): string[] {
  if (!Array.isArray(values) || values.some(value => !uuid(value))) throw new ContractFactError(code);
  const ids = values.map(value => canonical(value as string));
  if (new Set(ids).size !== ids.length) throw new ContractFactError(code);
  return ids.sort();
}
function savedStudentIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.some(row => !record(row) || !uuid(row.user_id))) {
    throw new ContractFactError("contract_students_invalid");
  }
  return uniqueUuids(value.map(row => row.user_id), "contract_students_invalid");
}

/** Explicit saved contracts only. A failed selection never exposes partial facts. */
export async function loadGroupContractFacts(input: {
  organizationId: string; groupId: string; studentUserIds: readonly string[];
  contractIds: readonly string[]; fillMode: "data" | "blank";
}, reader: GroupContractFactsReader): Promise<GroupContractFactsResult> {
  const result: GroupContractFactsResult = {
    line: "", sources: [], issues: [], coveredStudentUserIds: [], missingStudentUserIds: [],
  };
  if (input.fillMode === "blank") return result;
  const issue = (code: string, message: string, severity: "error" | "warning") => {
    result.issues.push({ code, field: "CONTRACT_BASIS_LINE", message, severity });
  };
  try {
    if (input.fillMode !== "data" || !uuid(input.organizationId) || !uuid(input.groupId)) {
      throw new ContractFactError("contract_scope_invalid");
    }
    const organizationId = canonical(input.organizationId);
    const groupId = canonical(input.groupId);
    const users = uniqueUuids(input.studentUserIds, "contract_roster_invalid");
    const ids = uniqueUuids(input.contractIds, "contract_selection_invalid");
    result.missingStudentUserIds = users;
    if (!ids.length) {
      issue("contract_source_missing", "Договор не выбран; номер договора оставлен пустым.", "warning");
      return result;
    }
    if (!users.length) throw new ContractFactError("contract_roster_invalid");
    const activeUsers = new Set(users);
    const rows: GroupContractFactRow[] = [];
    for (let start = 0; start < ids.length; start += CHUNK_SIZE) {
      const contractIds = ids.slice(start, start + CHUNK_SIZE);
      const allowed = new Set(contractIds);
      const chunk = await readExactFactPages((from, to) => reader.contracts({
        organizationId, groupId, contractIds, from, to,
      }), row => record(row) && uuid(row.id) && allowed.has(canonical(row.id))
        && row.organization_id === organizationId && row.student_group_id === groupId);
      if (chunk.length !== contractIds.length) throw new ContractFactError("contract_selection_inaccessible");
      rows.push(...chunk);
    }
    const seen = new Set<string>();
    const companyIds = new Set<string>();
    const sources: GroupContractSource[] = [];
    for (const row of rows) {
      const id = canonical(row.id);
      if (seen.has(id)) throw new ContractFactError("contract_source_duplicate");
      seen.add(id);
      if (typeof row.contract_number !== "string" || !row.contract_number.trim()
        || [...row.contract_number].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
        throw new ContractFactError("contract_number_invalid");
      }
      if (!validDate(row.contract_date)) throw new ContractFactError("contract_date_invalid");
      if (!SUPPORTED_STATUSES.has(row.status) || !SUPPORTED_GENERATION_STATUSES.has(row.generation_status)) {
        throw new ContractFactError("contract_status_invalid");
      }
      const savedUsers = savedStudentIds(row.students);
      let covered: string[];
      if (row.counterparty_type === "individual") {
        if (!uuid(row.student_user_id) || !activeUsers.has(canonical(row.student_user_id))
          || row.company_id !== null || (savedUsers.length > 0
            && (savedUsers.length !== 1 || savedUsers[0] !== canonical(row.student_user_id)))) {
          throw new ContractFactError("contract_student_scope_mismatch");
        }
        // Older individual contracts have the schema-default empty students
        // array; the dedicated student_user_id remains their authoritative link.
        covered = [canonical(row.student_user_id)];
      } else if (row.counterparty_type === "legal") {
        if (!uuid(row.company_id) || row.student_user_id !== null || !savedUsers.length
          || savedUsers.some(userId => !activeUsers.has(userId))) {
          throw new ContractFactError("contract_legal_scope_mismatch");
        }
        companyIds.add(canonical(row.company_id));
        covered = savedUsers;
      } else {
        throw new ContractFactError("contract_scenario_invalid");
      }
      sources.push({
        id, organization_id: organizationId, student_group_id: groupId,
        contract_number: row.contract_number, contract_date: row.contract_date,
        status: row.status, generation_status: row.generation_status,
        counterparty_type: row.counterparty_type, company_id: row.company_id,
        student_user_ids: covered,
      });
    }
    const companies = [...companyIds].sort();
    for (let start = 0; start < companies.length; start += CHUNK_SIZE) {
      const companyIds = companies.slice(start, start + CHUNK_SIZE);
      const allowed = new Set(companyIds);
      const rows = await readExactFactPages((from, to) => reader.companies({ organizationId, companyIds, from, to }),
        row => record(row) && uuid(row.id) && allowed.has(canonical(row.id)) && row.organization_id === organizationId);
      if (rows.length !== companyIds.length) throw new ContractFactError("contract_company_inaccessible");
      if (new Set(rows.map(row => canonical(row.id))).size !== companyIds.length) {
        throw new ContractFactError("contract_company_duplicate");
      }
    }
    result.sources = sources.sort((a, b) => a.id.localeCompare(b.id));
    const covered = new Set(sources.flatMap(source => source.student_user_ids));
    result.coveredStudentUserIds = users.filter(id => covered.has(id));
    result.missingStudentUserIds = users.filter(id => !covered.has(id));
    if (result.missingStudentUserIds.length) {
      issue("contract_coverage_incomplete", "Выбранные договоры не покрывают весь активный состав группы; общая строка номеров оставлена пустой.", "warning");
      return result;
    }
    const numbers = result.sources.map(source => `№ ${source.contract_number.trim()}`);
    result.line = `${numbers.length === 1 ? "Номер договора" : "Номера договоров"}: ${numbers.join("; ")}`;
    return result;
  } catch (error) {
    result.line = "";
    result.sources = [];
    result.coveredStudentUserIds = [];
    issue(error instanceof ContractFactError ? error.code
      : error instanceof FactReadError ? `contract_${error.code}` : "contract_read_failed",
    "Выбранные договоры или их связи не подтверждены полностью в текущем доступе. Номера не использованы; проверьте выбор и повторите проверку.", "error");
    return result;
  }
}
