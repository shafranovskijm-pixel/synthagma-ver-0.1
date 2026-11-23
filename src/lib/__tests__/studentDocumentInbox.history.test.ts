import {describe,expect,it,vi} from 'vitest';

vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:vi.fn()}}));
vi.mock('@/utils/courseCache',()=>({isOfflineActorCurrent:vi.fn()}));
import {inboxStateLabel,parseDocumentInboxPage} from '../studentDocumentInbox';

const org='10000000-0000-4000-8000-000000000001';
const recipient='20000000-0000-4000-8000-000000000001';
const request='30000000-0000-4000-8000-000000000001';
const binding='40000000-0000-4000-8000-000000000001';
const event='50000000-0000-4000-8000-000000000001';
const documentRevision='60000000-0000-4000-8000-000000000001';
const confirmedAt='2026-11-23T13:35:10.900376Z';

function historyPage(state:'source_changed'|'source_unavailable'|'confirmed') {
  return {version:1,ok:true,organization_id:org,recipient_user_id:recipient,
    observed_at:'2026-11-23T14:00:00.000001Z',pending_count:0,total_count:1,next_cursor:null,
    items:[{id:request,organization_id:org,document_title:'Получение электронной копии свидетельства',
      document_type:'education_document',legacy_status:'sent',sender_name:null,expires_at:null,
      signature_token:'synthetic-own-request-token',created_at:'2026-11-23T13:00:00Z',
      signed_at:null,viewed_at:null,signed_document_path:null,state,pending:false,
      assurance:{binding_id:binding,binding_revision:1,document_revision_id:documentRevision,
        document_html_sha256:'a'.repeat(64),conclusion:'policy_eligible_account_confirmation',
        event_id:event,event_revision:2,confirmed_at:confirmedAt,source_current:false}}]};
}

describe('own inbox historical confirmation after source drift',()=>{
  it.each(['source_changed','source_unavailable'] as const)('preserves the actual confirmation while showing %s',state=>{
    const result=parseDocumentInboxPage(historyPage(state),org,recipient);
    const item=result.items[0];
    expect(result.pending_count).toBe(0);
    expect(item.pending).toBe(false);
    expect(item.state).toBe(state);
    expect(item.assurance).toEqual({binding_id:binding,binding_revision:1,
      document_revision_id:documentRevision,document_html_sha256:'a'.repeat(64),
      conclusion:'policy_eligible_account_confirmation',event_id:event,event_revision:2,
      confirmed_at:confirmedAt,source_current:false});
    expect(item.legacy_status).toBe('sent');
    expect(item.signed_at).toBeNull();
    expect(inboxStateLabel(item)).not.toContain('Подтверждено');
    expect(inboxStateLabel(item)).not.toContain('Требуется ваше подтверждение');
  });

  it('does not label complete historical PEP evidence as a current confirmed source',()=>{
    expect(()=>parseDocumentInboxPage(historyPage('confirmed'),org,recipient)).toThrow('Missing exact confirmation evidence');
  });
});
