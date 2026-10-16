import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),invoke:vi.fn(),invalidate:vi.fn(),success:vi.fn(),error:vi.fn(),info:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:m.rpc,from:m.from,functions:{invoke:m.invoke}}}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:{invoices:[],billingDocs:[],contracts:[],orgs:[]},isLoading:false}),useQueryClient:()=>({invalidateQueries:m.invalidate})}));
vi.mock('sonner',()=>({toast:{success:m.success,error:m.error,info:m.info}}));
vi.mock('@/utils/generateAct',()=>({generateActHtml:vi.fn(),saveActDocument:vi.fn()}));
vi.mock('@/constants/invoiceTemplate',()=>({generateInvoiceHtml:vi.fn()}));
import { useAdminBilling, type Invoice } from '../useAdminBilling';
const invoice:Invoice={id:'invoice',organization_id:'org',invoice_number:'number',amount:4490,status:'pending',plan:'start',period_months:1,invoice_date:'2026-11-01'};
beforeEach(()=>vi.clearAllMocks());
describe('manual invoice confirmation uses the server settlement',()=>{
  it('settles postpaid debt without browser entitlement writes or duplicate referral calls',async()=>{
    m.rpc.mockResolvedValue({data:{applied:true,outcome:'confirmed',billing_kind:'postpaid',paid_until:null},error:null});
    const {result}=renderHook(()=>useAdminBilling());
    await act(async()=>result.current.handleMarkPaid({...invoice,billing_kind:'postpaid'}));
    expect(m.rpc).toHaveBeenCalledWith('confirm_manual_subscription_invoice',{p_invoice_id:'invoice'});
    expect(m.from).not.toHaveBeenCalled();expect(m.invoke).not.toHaveBeenCalled();
    expect(m.success).toHaveBeenCalledWith('Оплата подтверждена',{description:'Задолженность за прошедший период погашена'});
  });
  it('does not present a replay as a new payment',async()=>{
    m.rpc.mockResolvedValue({data:{applied:false,outcome:'already_confirmed',billing_kind:'prepaid',paid_until:'2026-12-01'},error:null});
    const {result}=renderHook(()=>useAdminBilling());await act(async()=>result.current.handleMarkPaid(invoice));
    expect(m.success).not.toHaveBeenCalled();expect(m.info).toHaveBeenCalledWith('Оплата уже подтверждена');
  });
  it('does not report success when settlement fails',async()=>{
    m.rpc.mockResolvedValue({data:null,error:{message:'rollback'}});
    const {result}=renderHook(()=>useAdminBilling());await act(async()=>result.current.handleMarkPaid(invoice));
    expect(m.error).toHaveBeenCalled();expect(m.success).not.toHaveBeenCalled();expect(m.invalidate).not.toHaveBeenCalled();
  });
});
