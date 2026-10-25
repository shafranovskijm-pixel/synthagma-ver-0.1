import {describe,expect,it} from 'vitest';
import {issuanceOfficialSchema,issuanceFrdoFactsSchema} from '../contract.ts';
import {issuedRecord} from './fixtures.ts';
describe('V6E actual approved programme bounds',()=>{
 it('accepts exact approved 4000-character titles/qualification/profession and integer 999999 hours',()=>{const record=issuedRecord(),text='П'.repeat(4000);expect(issuanceOfficialSchema.safeParse({...record.official,specialty_name:text,qualification_name:text}).success).toBe(true);expect(issuanceFrdoFactsSchema.safeParse({...record.frdo_facts,program_title:text,qualification_name:text,profession:text,academic_hours:999999}).success).toBe(true);});
 it('rejects beyond-source text bounds and noninteger or oversized academic hours',()=>{const facts=issuedRecord().frdo_facts!;for(const field of ['program_title','qualification_name','profession'])expect(issuanceFrdoFactsSchema.safeParse({...facts,[field]:'П'.repeat(4001)}).success).toBe(false);for(const academic_hours of [0,1.5,1000000])expect(issuanceFrdoFactsSchema.safeParse({...facts,academic_hours}).success).toBe(false);expect(issuanceOfficialSchema.safeParse({...issuedRecord().official,specialty_name:'П'.repeat(4001)}).success).toBe(false);});
});
