export type BulkRegistryTable = 'company_documents' | 'document_issuance_log';
export interface BulkRegistryRequest { readonly table: BulkRegistryTable; readonly row: Readonly<Record<string, string | number | null>> }
export class BulkRegistryError extends Error {
  constructor(message: string, readonly uncertain: boolean) { super(message); this.name = 'BulkRegistryError'; }
}
const fields: Record<BulkRegistryTable, readonly string[]> = {
  company_documents: ['id','company_id','name','type','contract_number','contract_date','amount','students_count','file_path'],
  document_issuance_log: ['id','organization_id','user_id','user_name','document_type','document_name','reg_number','file_url','send_method'],
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function bulkRegistryRequest(table: BulkRegistryTable, row: Record<string, string | number | null>): BulkRegistryRequest {
  if (!fields[table] || typeof row.id !== 'string' || !uuid.test(row.id) || Object.keys(row).sort().join('|') !== [...fields[table]].sort().join('|')
    || Object.values(row).some(value => value !== null && typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value)))) {
    throw new BulkRegistryError('Не удалось подтвердить состав сохраняемого документа.', false);
  }
  return Object.freeze({ table, row: Object.freeze({ ...row }) });
}
function sameValue(actual: unknown, expected: string | number | null): boolean {
  if (typeof expected !== 'number') return actual === expected;
  return (typeof actual === 'number' || typeof actual === 'string' && /^-?\d+(?:\.\d+)?$/.test(actual)) && Number(actual) === expected;
}
/** Original caller/RLS only. A hidden row is never returned or treated as proof. */
export async function confirmBulkRegistryRequest(client: { from(table: string): any }, request: BulkRegistryRequest, current: () => void): Promise<boolean> {
  current();
  let response: { data: unknown; error: unknown };
  try {
    response = await client.from(request.table).select([...fields[request.table], 'deleted_at'].join(',')).eq('id', request.row.id).maybeSingle();
  } catch { current(); throw new BulkRegistryError('Не удалось сверить сохранённый документ. Повторите тот же запрос.', true); }
  current();
  if (response.error) throw new BulkRegistryError('Не удалось сверить сохранённый документ. Повторите тот же запрос.', true);
  if (response.data === null) return false;
  const row = response.data as Record<string, unknown>;
  if (!row || typeof row !== 'object' || row.deleted_at !== null || !fields[request.table].every(key => sameValue(row[key], request.row[key]))) {
    throw new BulkRegistryError('Сохранённая запись отличается от подготовленного документа. Новый документ не создан.', true);
  }
  return true;
}
/** Stable existing PK is the server race barrier; exact readback is the success proof. */
export async function persistBulkRegistryRequest(client: { from(table: string): any }, request: BulkRegistryRequest, current: () => void, beforeInsert: () => void = () => {}): Promise<void> {
  if (await confirmBulkRegistryRequest(client, request, current)) return;
  current();
  beforeInsert();
  let insertError: unknown = null;
  try { const response = await client.from(request.table).insert(request.row); insertError = response.error; }
  catch (error) { insertError = error; }
  current();
  if (await confirmBulkRegistryRequest(client, request, current)) return;
  const code = insertError && typeof insertError === 'object' ? (insertError as { code?: unknown }).code : null;
  const definite = typeof code === 'string' && (code === '42501' || code.startsWith('22') || ['23502','23503','23514'].includes(code));
  throw new BulkRegistryError(definite ? 'Документ не зарегистрирован. Проверьте текущий доступ и данные; успех не подтверждён.'
    : 'Результат записи пока не подтверждён. Повторите тот же запрос; новый документ не создаётся.', !definite);
}
