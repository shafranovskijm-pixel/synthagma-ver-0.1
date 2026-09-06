import { describe, it, expect } from 'vitest';
import { schoolDateTime, schoolTimeToUtc, rublesToKopecks, safeCsvCell } from './time';
describe('school time and export boundary',()=>{
 it('uses the school zone for input, including a different calendar day',()=>{expect(schoolDateTime(Date.parse('2026-09-06T18:30:00Z'),'Asia/Vladivostok')).toBe('2026-09-07T04:30');expect(schoolTimeToUtc('2026-09-07T04:30','Asia/Vladivostok')).toBe('2026-09-06T18:30:00.000Z');});
 it('rejects impossible and DST ambiguous wall times',()=>{expect(()=>schoolTimeToUtc('2026-02-30T12:00','Europe/Moscow')).toThrow();expect(()=>schoolTimeToUtc('2026-03-29T02:30','Europe/Berlin')).toThrow();expect(()=>schoolTimeToUtc('2026-10-25T02:30','Europe/Berlin')).toThrow();});
 it('preserves exact kopecks and rejects rounding invalid amounts',()=>{expect(rublesToKopecks('1999,99')).toBe(199999);expect(rublesToKopecks('0.01')).toBe(1);for(const amount of ['1.005','-5','0','1e4','Infinity','1000000.01'])expect(()=>rublesToKopecks(amount)).toThrow();});
 it('neutralizes spreadsheet formulas even after whitespace',()=>{expect(safeCsvCell(' =HYPERLINK("x")')).toBe('"\' =HYPERLINK(""x"")"');expect(safeCsvCell('\t=1')).toBe('"\'\t=1"');expect(safeCsvCell('Анна')).toBe('"Анна"');});
});
