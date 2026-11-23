import '@testing-library/jest-dom/vitest';
import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {row,org} from '@/lib/documentChain/__tests__/fixtures';
const seen=vi.hoisted(()=>vi.fn());
vi.mock('@/components/organization/individual-orders/IndividualEducationOrderDialog',()=>({IndividualEducationOrderDialog:()=>null}));
vi.mock('../IndividualEducationIssuanceDialog',()=>({IndividualEducationIssuanceDialog:(p:any)=>{seen(p);return <p>Выбрано конкретное обучение</p>;}}));
import {DocumentChainRows} from '@/components/organization/documents/DocumentChainRows';
describe('shared existing enrollment mount',()=>{
 it('loads the new form only after a staff action for the exact row and preserves existing document slots',async()=>{seen.mockClear();const r=row();r.admission_order={...r.admission_order,state:'registered',number:'УЦ-7/2026'};render(<DocumentChainRows rows={[r]} individualOrders={{organizationId:org,enabled:true,accessKey:'scope',onChanged:vi.fn()}} canOpenJournals onAction={vi.fn()} onOpenJournals={vi.fn()}/>);expect(seen).not.toHaveBeenCalled();expect(screen.getByText(/УЦ-7/)).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Документ об обучении'}));await screen.findByText('Выбрано конкретное обучение');expect(seen.mock.calls[0][0]).toMatchObject({organizationId:org,row:r,accessKey:'scope'});});
 it.each(['own','readonly','disabled'] as const)('does not expose staff issuance actions to %s view',mode=>{seen.mockClear();render(<DocumentChainRows rows={[row()]} ownViewer={mode==='own'} individualOrders={mode==='readonly'?undefined:{organizationId:org,enabled:mode!=='disabled',accessKey:'scope',onChanged:vi.fn()}} canOpenJournals onAction={vi.fn()} onOpenJournals={vi.fn()}/>);expect(screen.queryByRole('button',{name:'Документ об обучении'})).toBeNull();expect(seen).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:mode==='own'?'Мои журналы и выписка':'Журналы ученика и выписка'})).toBeInTheDocument();});
});
