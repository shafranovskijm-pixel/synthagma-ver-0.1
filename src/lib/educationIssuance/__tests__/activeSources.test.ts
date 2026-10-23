import {beforeEach,describe,expect,it,vi} from 'vitest';
import {org,actor,enrollment,course,pupil,uid,issuedRecord} from './fixtures';
const mock=vi.hoisted(()=>({current:true,load:vi.fn()}));
vi.mock('@/utils/courseCache',()=>({captureOfflineContext:()=>({actorId:'00000000-0000-4000-8000-000000000001',revision:1}),isOfflineActorCurrent:()=>mock.current}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
vi.mock('../export',()=>({loadIssuanceExport:mock.load}));
import {captureIssuanceScope} from '../client';
import {selectActiveIssuanceSources,readActiveIssuanceSources} from '../activeSources';
const assignment={enrollmentId:enrollment,courseId:course,userId:pupil};
beforeEach(()=>{vi.clearAllMocks();mock.current=true;});
describe('read-only official-source selection',()=>{
 it('does not choose newest when an original and duplicate are both active',()=>{const original=issuedRecord(),duplicate=structuredClone(original);duplicate.official.id=uid(99);duplicate.official.document_status='duplicate';duplicate.original_record_id=original.official.id;duplicate.official.created_at='2026-10-23T00:00:00Z';expect(selectActiveIssuanceSources([duplicate,original],[assignment]).get(enrollment)).toEqual({kind:'unavailable',reason:'AMBIGUOUS'});});
 it('never treats an annulled controlled row or an unverified legacy row as an active official source',()=>{const annulled=issuedRecord();annulled.lifecycle='annulled';expect(selectActiveIssuanceSources([annulled],[assignment]).get(enrollment)).toEqual({kind:'unavailable',reason:'ANNULLED_ONLY'});const legacy=issuedRecord();legacy.provenance='legacy_unverified';expect(selectActiveIssuanceSources([legacy],[assignment]).get(enrollment)).toEqual({kind:'unavailable',reason:'LEGACY_UNVERIFIED'});});
 it('keeps explicit missing state and does not replace frozen facts from a live registration',()=>{const record=issuedRecord();expect(selectActiveIssuanceSources([record],[assignment]).get(enrollment)).toEqual({kind:'confirmed',record});expect(selectActiveIssuanceSources([],[assignment],[{enrollment_id:enrollment,code:'ANNULLED_ONLY'}]).get(enrollment)).toEqual({kind:'unavailable',reason:'ANNULLED_ONLY'});});
 it('uses exact selected assignment export under the current scope and rejects a foreign subject',async()=>{mock.load.mockResolvedValue({snapshot:{records:[issuedRecord()],missing:[]}});const scope=captureIssuanceScope(org,{kind:'group',group_id:issuedRecord().official.group_id!},()=>true);await readActiveIssuanceSources(scope,[assignment]);expect(mock.load).toHaveBeenCalledWith(scope,{kind:'export',selection:{kind:'enrollments',course_id:course,enrollment_ids:[enrollment]},format:'canonical_snapshot'});const record=issuedRecord();record.official.user_id=uid(99);expect(()=>selectActiveIssuanceSources([record],[assignment])).toThrow();});
});
