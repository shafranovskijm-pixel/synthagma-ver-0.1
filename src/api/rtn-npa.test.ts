import { describe, expect, it, vi } from 'vitest';
const transport = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn(), invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: transport.rpc, auth: { getSession: transport.getSession }, functions: { invoke: transport.invoke } } }));
import { parseDeclaredBasis } from './rtn-npa';
import { completeBasis50 } from '@/components/organization/rtn/__fixtures__/rtn-complete-basis50';

const law = { country: 'RU', kind: 'FederalLaw', date: '1997-07-21', number: '116-ФЗ', title: 'О промышленной безопасности опасных производственных объектов' };

describe('declared normative basis: unknown identity remains omitted and unsupported', () => {
  it('parses the actual conservative complete50 without changing any identity or supplying unknown IDs', () => {
    const result = parseDeclaredBasis(JSON.stringify(completeBasis50));
    expect(result).toHaveLength(50); expect(result).toEqual(completeBasis50);
    expect(result.find(b => b.number === '116-ФЗ')).toMatchObject({ docid: 38355 });
    const unknown = result.find(b => b.kind === 'FederalLaw' && b.date === '2026-05-02' && b.number === '126-ФЗ');
    expect(unknown).toBeDefined(); expect(unknown).not.toHaveProperty('docid');
    expect(result.every(b => b.docid === undefined || Number.isSafeInteger(b.docid) && b.docid > 0)).toBe(true);
    expect(transport.rpc).not.toHaveBeenCalled(); expect(transport.invoke).not.toHaveBeenCalled();
  });
  it('accepts an omitted identifier even for exact116 but never supplies38355 itself', () => {
    const result = parseDeclaredBasis(JSON.stringify([law]));
    expect(result).toEqual([law]); expect(result[0]).not.toHaveProperty('docid');
  });
  it.each(['FederalLaw', 'GovernmentResolution'])('keeps the positive13-digit identifier bound for %s', kind => {
    expect(parseDeclaredBasis(JSON.stringify([{ ...law, kind, docid: 1 }]))[0].docid).toBe(1);
    expect(parseDeclaredBasis(JSON.stringify([{ ...law, kind, docid: 9_999_999_999_999 }]))[0].docid).toBe(9_999_999_999_999);
  });
  const malformedIds = [null, '38355', 0, -1, 1.5, true, {}, [], 10_000_000_000_000, Number.MAX_SAFE_INTEGER];
  for (const kind of ['FederalLaw', 'GovernmentResolution']) {
    it.each(malformedIds)(`rejects a present malformed or oversized identifier for ${kind}: %j`, docid => {
      expect(() => parseDeclaredBasis(JSON.stringify([{ ...law, kind, docid }]))).toThrow(/docid/);
    });
  }
});
