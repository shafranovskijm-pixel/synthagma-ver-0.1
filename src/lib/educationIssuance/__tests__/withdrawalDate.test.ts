import {describe,expect,it} from 'vitest';
import {withdrawalDateBounds} from '../withdrawalDate';
class LocalNextDay extends Date{getFullYear(){return 2026;}getMonth(){return 9;}getDate(){return 23;}}
class LocalPreviousDay extends Date{getFullYear(){return 2026;}getMonth(){return 9;}getDate(){return 21;}}
describe('withdrawal explicit effective date bounds',()=>{
 it('uses the established local calendar convention but never suggests a day beyond the provider UTC maximum',()=>{expect(withdrawalDateBounds(new LocalNextDay('2026-10-22T23:30:00Z'))).toEqual({localDate:'2026-10-23',maximumDate:'2026-10-22',suggestedDate:'2026-10-22'});});
 it('does not move a local previous day forward or change the billing calendar',()=>{expect(withdrawalDateBounds(new LocalPreviousDay('2026-10-22T01:00:00Z'))).toEqual({localDate:'2026-10-21',maximumDate:'2026-10-22',suggestedDate:'2026-10-21'});});
});
