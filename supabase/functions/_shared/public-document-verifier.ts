const headers = {
  'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'X-Sintagma-Function-Revision': 'uc-foundation-20261018-v1', 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
export async function publicVerificationRequest(req: Request, database: () => any): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'GET') return response({ valid: false, error: 'Используйте GET' }, 405);
  try {
    const params = new URL(req.url).searchParams;
    const id = params.get('document_id')?.trim();
    const org = params.get('organization_id')?.trim();
    const number = params.get('reg_number')?.trim();
    if ((id && !uuid.test(id)) || (org && !uuid.test(org)) || (!id && (!number || number.length < 1 || number.length > 100))
      || (number && /[%\\]/.test(number))) return response({ valid: false, error: 'Укажите точный номер или ссылку документа' }, 400);
    const db = database();
    let query = db.from('education_document_records')
      .select('id,reg_number,full_name,document_type,document_number,document_series,issue_date,specialty_name,qualification_name,document_status,organization_id,protocol_number,protocol_date')
      .is('deleted_at', null);
    if (id) query = query.eq('id', id);
    else query = query.eq('reg_number', number);
    if (org) query = query.eq('organization_id', org);
    const { data: rows, error } = await query.limit(2);
    if (error) return response({ valid: false, error: 'Реестр временно недоступен' }, 503);
    if (!rows?.length) return response({ valid: false, error: 'Документ не найден в реестре' });
    if (rows.length !== 1) return response({ valid: false, code: 'AMBIGUOUS_REG_NUMBER', error: 'Номер встречается в нескольких организациях. Используйте QR-код или персональную ссылку документа.' }, 409);
    const doc = rows[0];
    const organization = await db.from('organizations').select('name').eq('id', doc.organization_id).maybeSingle();
    if (organization.error) return response({ valid: false, error: 'Реестр временно недоступен' }, 503);
    const parts = String(doc.full_name ?? '').trim().split(/\s+/);
    const masked = [parts[0], ...parts.slice(1).filter(Boolean).map((part) => `${part[0]}.`)].join(' ');
    return response({
      valid: ['original', 'duplicate', 'copy'].includes(doc.document_status),
      document: {
        id: doc.id, organization_id: doc.organization_id, reg_number: doc.reg_number, full_name_masked: masked,
        document_type: doc.document_type, document_number: doc.document_number, document_series: doc.document_series,
        issue_date: doc.issue_date, specialty_name: doc.specialty_name, qualification_name: doc.qualification_name,
        status: doc.document_status, organization_name: organization.data?.name ?? null,
        protocol_number: doc.protocol_number, protocol_date: doc.protocol_date,
      },
    });
  } catch { return response({ valid: false, error: 'Реестр временно недоступен' }, 500); }
}
