// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { calculatePostpaid, featureUseIsBillable } from '../../functions/_shared/postpaid-billing';
const quote = (courses: number, learners: number, extra = {}) => calculatePostpaid({ courses, learners, accessDays: 31, monthDays: 31, ...extra });
describe('signed postpaid monthly terms', () => {
  it.each([[0,0,'start',4490],[15,100,'start',4490],[16,100,'standard',6990],[15,101,'standard',6990],[30,200,'standard',6990],[31,1,'professional',16990],[1,201,'professional',16990]])('uses BOTH course and learner thresholds %s/%s', (courses, learners, plan, amount) => {
    expect(quote(Number(courses), Number(learners))).toMatchObject({plan,amount});
  });
  it('charges one sufficient tier without annual discount or extra thresholds', () => {
    expect(quote(0,0,{confirmedUsedFeatures:['crm']})).toMatchObject({plan:'standard',amount:6990});
    expect(quote(0,0,{confirmedUsedFeatures:['crm','webinar','frdoplus','videoserviceplus']})).toMatchObject({plan:'professional',amount:16990});
  });
  it('prorates actual calendar access days and rounds once to kopecks', () => {
    expect(quote(0,0,{accessDays:15})).toMatchObject({amountKopecks:217258});
    expect(quote(0,0,{accessDays:28,monthDays:28})).toMatchObject({amount:4490});
  });
  it.each([{courses:-1},{learners:NaN},{courses:0.1},{accessDays:0},{accessDays:32},{monthDays:27}])('rejects invalid metrics %j', extra => expect(() => quote(0,0,extra)).toThrow());
  it('requires prior notice and confirmation; video threshold is per upload, not storage', () => {
    const base={feature:'videoserviceplus' as const,occurredAt:'2026-10-10T00:00:00Z',notifiedAt:'2026-10-01T00:00:00Z',confirmedAt:'2026-10-02T00:00:00Z',bytes:2147483649};
    expect(featureUseIsBillable(base)).toBe(true);
    expect(featureUseIsBillable({...base,bytes:2147483648})).toBe(false);
    expect(featureUseIsBillable({...base,confirmedAt:'2026-10-11T00:00:00Z'})).toBe(false);
    expect(featureUseIsBillable({...base,notifiedAt:'2026-10-03T00:00:00Z'})).toBe(false);
    expect(featureUseIsBillable({...base,effectiveTo:base.occurredAt})).toBe(false);
  });
});
