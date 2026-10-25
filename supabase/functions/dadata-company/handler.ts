import { AccessError, type AccessDb } from '../_shared/privileged-access.ts';
import { readProviderOperationObject, requireProviderOperationActor, requireOrganizationLookup, providerOperationError, providerOperationJSON, requireProviderRate, type ProviderRateResult } from '../_shared/provider-operation-access.ts';
export interface DadataDependencies {
 admin: AccessDb; caller: (header: string) => AccessDb; apiKey: () => string | undefined;
 network: typeof fetch; rate: (key: string) => ProviderRateResult; log: (event: 'company_lookup_failed') => void;
}
export const dadataCors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'};
export function createDadataCompanyHandler(deps: DadataDependencies) {
 return async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, {headers: dadataCors});
  try {
   const actor = await requireProviderOperationActor(req, deps.admin, deps.caller);
   const body = await readProviderOperationObject(req);
   if (Object.keys(body).some(key => !['inn', 'organizationId'].includes(key)) || typeof body.inn !== 'string' || !/^(?:[0-9]{10}|[0-9]{12})$/.test(body.inn)) throw new AccessError(400, 'Введите ИНН: 10 или 12 цифр.');
   await requireOrganizationLookup(deps.admin, actor, body.organizationId);
   requireProviderRate(deps.rate('company-lookup:' + actor.userId));
   const key = deps.apiKey(); if (!key) throw new AccessError(503, 'Поиск реквизитов временно недоступен. Введите сведения вручную.');
   const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
   let data: Record<string, unknown>;
   try {
    const response = await deps.network('https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party', {method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Token ' + key}, body: JSON.stringify({query: body.inn, branch_type: 'MAIN', count: 1}), signal: controller.signal});
    if (!response.ok) { try { void response.body?.cancel().catch(() => undefined); } catch { /* no raw provider error */ } throw new AccessError(502, 'Источник реквизитов временно недоступен. Введите сведения вручную.'); }
    data = await readProviderOperationObject(response, 1048576, 502);
   } finally { clearTimeout(timer); }
   const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
   if (!suggestions.length) return providerOperationJSON({success: false, message: 'Компания не найдена'}, dadataCors);
   const company = suggestions[0] as any, d = company.data;
   if (!d || typeof d !== 'object') throw new AccessError(502, 'Источник реквизитов временно недоступен.');
   const founders = d.founders?.map((f: any) => f.type === 'LEGAL' ? (f.name?.full || f.name?.short || 'Юридическое лицо') : (f.fio?.surname ? [f.fio.surname, f.fio.name || '', f.fio.patronymic || ''].join(' ').trim() : f.name || 'Физическое лицо')) || [];
   const licenses = d.licenses?.filter((l: any) => l.activities?.some((a: string) => a.toLowerCase().includes('образовательн') || a.toLowerCase().includes('обучени')) || l.number?.includes('Л035')) || [];
   const license = licenses[0] || d.licenses?.[0];
   return providerOperationJSON({success: true, company: {name: company.value, fullName: d.name?.full_with_opf || company.value, shortName: d.name?.short_with_opf || company.value, inn: d.inn, kpp: d.kpp, ogrn: d.ogrn, address: d.address?.unrestricted_value || null, management: d.management?.name || null, managementPosition: d.management?.post || null, status: d.state?.status || null, type: d.type, opf: d.opf?.short || null, founders, license: license ? {number: license.number || null, issueDate: license.issue_date || null, issueAuthority: license.issue_authority || null, activities: license.activities || [], validFrom: license.valid_from || null, validTo: license.valid_to || null} : null, allLicenses: d.licenses?.map((l: any) => ({number: l.number, issueDate: l.issue_date, activities: l.activities})) || []}}, dadataCors);
  } catch (error: unknown) { try { deps.log('company_lookup_failed'); } catch { /* logging cannot replace the closed response */ } return providerOperationError(error, dadataCors); }
 };
}
