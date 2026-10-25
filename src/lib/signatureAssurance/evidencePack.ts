import {z} from 'zod';
import * as contract from './contract.ts';
import type {FrozenManifest, FrozenManifestBody} from './types.ts';
import {evidenceSha256, SignatureEvidenceError, verifyManifest} from './validation.ts';

/** Server/client projection boundary only. A source commitment is not proof that the
 * undisclosed private manifest has been read or that any legal signature is valid. */
export const evidencePackScope= z.object({organization_id:contract.uuid,signature_id:contract.uuid,
  actor_user_id:contract.uuid,party_role:contract.signingParty,source_manifest_id:contract.uuid,
  source_manifest_sha256:contract.hash,through_revision:contract.revision}).strict();
export type EvidencePackScope=z.infer<typeof evidencePackScope>;
const escape=(value:unknown):string=>String(value??'—').replace(/[&<>"']/g,char=>(({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}as Record<string,string>)[char]!));
const methodNames:Record<string,string>={graphic_asset:'Подготовка графического макета',scan_received:'Получение скана',bearer_invitation_confirmation:'Подтверждение по ссылке приглашения',authenticated_account_confirmation:'Действие учётной записи',legacy_unknown:'Исторический способ не подтверждён'};
const conclusions:Record<string,string>={not_confirmed:'Подтверждение не зафиксировано',factual_confirmation:'Зафиксировано фактическое действие',policy_eligible_account_confirmation:'Зафиксировано действие учётной записи по сохранённым правилам',scan_received:'Получен скан',graphic_prepared:'Подготовлен макет',legacy_unknown:'Исторические сведения без подтверждённого происхождения'};
function receiptHtml(body:FrozenManifestBody,bodyHash:string):string{
  const rows=(values:unknown[][])=>values.map(row=>'<tr>'+row.map(value=>'<td>'+escape(value)+'</td>').join('')+'</tr>').join('');
  const parties=(['sender','recipient']as const).map(role=>{
    const value=body.context.parties[role];
    return [role==='sender'?'Отправитель':'Получатель',methodNames[value.policy?.body.method??'legacy_unknown'],conclusions[value.conclusion],
      value.binding?.document_html_sha256??body.context.current_document_html_sha256,
      value.policy?value.policy.id+' / '+value.policy.body_sha256:'Правила не выбраны',value.latest_party_event_revision];
  });
  const events=body.events.map(event=>[event.revision,event.server_at,event.party_role==='sender'?'Отправитель':'Получатель',methodNames[event.method]??'Способ не поддерживается',
    conclusions[event.conclusion],event.actor.observed_mode==='account'?'Учётная запись: '+event.actor.user_id:'Наблюдение: '+event.actor.observed_mode,event.explanation]);
  const policies=body.referenced_policies.map(policy=>[policy.id,policy.version,policy.body_sha256,policy.decision.state,
    policy.body.agreement?.version??'—',policy.body.agreement?.sha256??'—',policy.body.limitations]);
  const decisions=body.referenced_policies.flatMap(policy=>policy.decision_history?.map(decision=>[policy.id,decision.revision,decision.state,decision.server_at,decision.actor_user_id,decision.reason])??[[policy.id,'—','История решений не была сохранена в этом историческом снимке','—','—','—']]);
  const documents=body.document_snapshots.map(document=>[document.id,document.party_role,document.document_revision_id,document.html_sha256,
    document.original_file?.visibility==='available'?document.original_file.value.sha256:'—',document.content_visibility,document.source_file_state]);
  return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;; style-src &#39;unsafe-inline&#39;"><title>Пакет фактов подтверждения</title>'+
    '<style>body{font:14px/1.5 system-ui,sans-serif;max-width:1200px;margin:32px auto;padding:0 20px;color:#17212b}table{border-collapse:collapse;width:100%;margin:16px 0}td,th{border:1px solid #cbd5e1;text-align:left;padding:8px;vertical-align:top;overflow-wrap:anywhere}code{overflow-wrap:anywhere}h1{font-size:24px}h2{font-size:18px}p,li{overflow-wrap:anywhere}</style></head><body>'+
    '<h1>Пакет фактов подтверждения</h1><p>Это проекция сохранённых фактов с учётом текущих прав доступа. Криптографическая проверка подписи и автоматический вывод о юридической действительности не выполнялись. Хеш скрытого исходного пакета является ссылкой на сохранённый источник; его содержимое этим экспортом не подтверждается.</p>'+
    '<p>Организация: <code>'+escape(body.organization_id)+'</code><br>Документ: <code>'+escape(body.signature_id)+'</code><br>Снимок: '+escape(body.captured_at)+'<br>События: 1–'+escape(body.through_revision)+'</p>'+
    '<p>SHA-256 JSON этой проекции: <code>'+escape(bodyHash)+'</code><br>Исходный пакет: <code>'+escape(body.source_manifest_id)+'</code><br>Сохранённый хеш исходного пакета: <code>'+escape(body.source_manifest_sha256)+'</code></p>'+
    '<h2>Стороны</h2><table><thead><tr><th>Сторона</th><th>Фактический способ</th><th>Сохранённый факт</th><th>Хеш HTML</th><th>Правила / хеш</th><th>Ревизия</th></tr></thead><tbody>'+rows(parties)+'</tbody></table>'+
    '<h2>События</h2><table><thead><tr><th>Ревизия</th><th>Время сервера</th><th>Сторона</th><th>Способ</th><th>Факт</th><th>Наблюдение</th><th>Пояснение</th></tr></thead><tbody>'+rows(events)+'</tbody></table>'+
    '<h2>Редакции правил и соглашений</h2><table><thead><tr><th>ID</th><th>Версия</th><th>Хеш правил</th><th>Записанное решение</th><th>Версия соглашения</th><th>Хеш соглашения</th><th>Ограничения</th></tr></thead><tbody>'+rows(policies)+'</tbody></table>'+
    '<h2>История решений по правилам</h2><p>Это сохранённые решения ответственных лиц. Они не заменяют правовую проверку и не означают автоматического утверждения текста.</p><table><thead><tr><th>Правила</th><th>Ревизия</th><th>Решение</th><th>Время сервера</th><th>Учётная запись</th><th>Основание записи</th></tr></thead><tbody>'+rows(decisions)+'</tbody></table>'+
    '<h2>Снимки документов</h2><table><thead><tr><th>ID</th><th>Сторона</th><th>Версия</th><th>Хеш HTML</th><th>Хеш байтов файла</th><th>Доступ к содержимому</th><th>Источник файла</th></tr></thead><tbody>'+rows(documents)+'</tbody></table>'+
    '<h2>Ограничения</h2><ul>'+body.limitations.map(value=>'<li>'+escape(value)+'</li>').join('')+'</ul></body></html>';
}
/** Build only after the server has captured an immutable source and projected each
 * reference under current authority. This function itself grants no access and
 * accepts no caller filename, URL, HTML receipt, legal conclusion or byte proof. */
export async function buildSignatureEvidencePack(input:unknown,expected:EvidencePackScope,current:()=>boolean):Promise<FrozenManifest>{
  if(!current())throw new SignatureEvidenceError('ACCESS_DENIED');
  const scope=evidencePackScope.safeParse(structuredClone(expected));
  const parsed=contract.frozenManifestBody.safeParse(structuredClone(input));
  if(!scope.success||!parsed.success)throw new SignatureEvidenceError('INVALID_INPUT');
  const body=parsed.data as FrozenManifestBody;
  if(body.organization_id!==scope.data.organization_id||body.signature_id!==scope.data.signature_id||body.captured_by!==scope.data.actor_user_id
    ||body.context.chosen_party!==scope.data.party_role||body.source_manifest_id!==scope.data.source_manifest_id
    ||body.source_manifest_sha256!==scope.data.source_manifest_sha256||body.through_revision!==scope.data.through_revision)throw new SignatureEvidenceError('SOURCE_CHANGED');
  // Never upgrade a caller/server boolean into proof of undisclosed private bytes.
  body.disclosure.complete_private_evidence_verified=false;
  const body_json=JSON.stringify(body);
  if(new TextEncoder().encode(body_json).length>2000000)throw new SignatureEvidenceError('LIMIT_EXCEEDED');
  const body_json_sha256=await evidenceSha256(body_json);
  if(!current())throw new SignatureEvidenceError('ACCESS_DENIED');
  const receipt_html=receiptHtml(body,body_json_sha256);
  if(new TextEncoder().encode(body_json).length+new TextEncoder().encode(receipt_html).length>2000000)throw new SignatureEvidenceError('LIMIT_EXCEEDED');
  const receipt_html_sha256=await evidenceSha256(receipt_html);
  const pack={body,body_json,body_json_sha256,receipt_html,receipt_html_sha256};
  await verifyManifest(pack,scope.data.organization_id,scope.data.signature_id,scope.data.source_manifest_id,current);
  if(!current())throw new SignatureEvidenceError('ACCESS_DENIED');
  return pack;
}
