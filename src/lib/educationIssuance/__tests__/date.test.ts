import {describe,expect,it} from 'vitest';
import {issuanceUtcDateIso} from '../date.ts';
describe('issuance date uses the server UTC calendar',()=>{
 it('does not default to tomorrow after midnight in Vladivostok',()=>{expect(issuanceUtcDateIso(new Date('2026-10-24T01:30:00+10:00'))).toBe('2026-10-23');});
 it('uses the next UTC day before local midnight in a negative offset',()=>{expect(issuanceUtcDateIso(new Date('2026-10-23T23:30:00-07:00'))).toBe('2026-10-24');});
 it('changes day at UTC midnight, including the year boundary',()=>{expect(issuanceUtcDateIso(new Date('2026-12-31T23:59:59.999Z'))).toBe('2026-12-31');expect(issuanceUtcDateIso(new Date('2027-01-01T00:00:00.000Z'))).toBe('2027-01-01');});
 it('keeps a valid leap-day date independent of the local calendar',()=>{expect(issuanceUtcDateIso(new Date('2028-03-01T02:00:00+10:00'))).toBe('2028-02-29');});
});
