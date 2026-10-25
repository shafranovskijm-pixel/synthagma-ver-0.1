import {describe,expect,it} from 'vitest';
import {handoverStatus} from '../presentation.ts';
import {issuanceOfficialSchema} from '../contract.ts';
import {buildExportData,mapDbRecord} from '@/hooks/educationDocumentsHelpers';
import {issuedRecord,uid,stamp} from './fixtures.ts';
describe('issuance and actual handover are separate facts',()=>{
 it('accepts not_recorded and never presents a newly issued unhanded document as personal delivery',()=>{const record=issuedRecord();expect(issuanceOfficialSchema.parse(record.official).delivery_method).toBe('not_recorded');expect(record.latest_handover).toBeNull();expect(handoverStatus(record)).toBe('Передача не зафиксирована');expect(buildExportData([mapDbRecord(record.official)])[0]['Способ получения']).toBe('Передача не зафиксирована');});
 it('preserves an old personal legacy mark without manufacturing a controlled handover event',()=>{const record=issuedRecord();record.provenance='legacy_unverified';record.official.delivery_method='personal';expect(mapDbRecord(record.official).delivery_method).toBe('personal');expect(handoverStatus(record)).toBe('Передача не зафиксирована');});
 it('reports an actual postal dispatch separately from delivered receipt',()=>{const record=issuedRecord();record.latest_handover={event_id:uid(90),recorded_at:stamp,recorded_by:null,fact:{kind:'postal_dispatched',occurred_at:stamp,carrier:'Почта',tracking_number:'123',recipient:{kind:'learner',postal_address:'Фактический адрес'},evidence:{source:null,availability:'currently_unavailable'}}};expect(handoverStatus(record)).toBe('Передан почтовому перевозчику');});
});
