import {readFileSync} from 'node:fs';
import {createUcDocumentScopeFixture} from './uc-document-scope.fixture';
const read=(p:string)=>readFileSync(p,'utf8').replace(/^\uFEFF/,'');
export async function createUcGorelDraftFixture(applyCaller=true,applyScope=true){
 if(applyCaller&&!applyScope)throw new Error('Caller migration requires scope/action migrations');
 const db=await createUcDocumentScopeFixture(applyScope);
 const actions=JSON.parse(read('supabase/tests/fixtures/uc-document-action-baseline-20261018.json'));
 for(const f of actions.functions.filter((f:any)=>['next_reg_number','auto_create_education_document','auto_log_document_issuance'].includes(f.name)))await db.exec(f.definition);
 await db.exec(`ALTER TABLE courses ADD COLUMN frdo_program_type text,ADD COLUMN frdo_qualification_name text;
 ALTER TABLE org_staff ADD COLUMN visibility text DEFAULT 'all',ADD COLUMN can_receive_crm_tasks boolean DEFAULT false;`);
 if(applyScope){await db.exec('BEGIN');await db.exec(read('supabase/migrations/20261018105000_uc_document_action_permissions.sql'));await db.exec('COMMIT');}
 const b=JSON.parse(read('supabase/tests/fixtures/uc-gorel-draft-baseline.json'));
 const existing=new Set((await db.query<any>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='group_documents'")).rows.map(x=>x.column_name));
 for(const c of b.tables)if(!existing.has(c.column))await db.exec(`ALTER TABLE group_documents ADD COLUMN ${c.column} ${c.type}${c.default?` DEFAULT ${c.default}`:''}${c.nullable==='NO'?' NOT NULL':''}`);
 await db.exec(`CREATE TABLE goreltech_document_operations(organization_id uuid NOT NULL,group_id uuid NOT NULL,operation_id uuid NOT NULL,actor_id uuid NOT NULL,receipt jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(organization_id,group_id,operation_id));
 ALTER TABLE goreltech_document_operations ENABLE ROW LEVEL SECURITY;REVOKE ALL ON goreltech_document_operations FROM PUBLIC,anon,authenticated;`);
 for(const f of b.functions)await db.exec(f.definition);
 for(const f of b.dependencies.functions)await db.exec(f.definition);
 for(const t of b.triggers.filter((t:any)=>t.name.startsWith('enforce_goreltech')))await db.exec(t.definition);
 if(applyCaller)await db.exec(read('supabase/migrations/20261018106000_uc_gorel_draft_caller.sql'));
 return db;
}
