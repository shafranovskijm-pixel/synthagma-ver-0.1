import { describe,it,expect } from 'vitest';
import { parseLegacyDefinitions } from '../legacy';
const definition={id:'custom_123',title:'Синтетический локальный журнал',description:'d',fields:['doc_number','signature'],createdAt:'2026-01-01'};
describe('explicit legacy definition preview',()=>{
 it('preserves input bytes and accepts only the observed current definition, not historical schema claims',()=>{const raw=JSON.stringify([definition]);const before=raw;const parsed=parseLegacyDefinitions(raw);expect(parsed[0].definition).toEqual(definition);expect(raw).toBe(before);});
 it('reports corrupt JSON, unknown field IDs and duplicate legacy identities without partial reinterpretation',()=>{expect(parseLegacyDefinitions('{')[0].problem).toBeTruthy();expect(parseLegacyDefinitions(JSON.stringify([{...definition,fields:['unknown_field']}]))[0].definition).toBeNull();const rows=parseLegacyDefinitions(JSON.stringify([definition,{...definition,title:'Другой'}]));expect(rows[1].definition).toBeNull();expect(rows[1].problem).toContain('Повторный');});
 it('does not accept extra ownership/version properties or silent coercion',()=>{expect(parseLegacyDefinitions(JSON.stringify([{...definition,organization_id:'foreign'}]))[0].definition).toBeNull();expect(parseLegacyDefinitions(JSON.stringify([{...definition,fields:'doc_number'}]))[0].definition).toBeNull();});
 it('bounds unsupported local payloads and leaves an absent browser source empty',()=>{expect(parseLegacyDefinitions(null)).toEqual([]);expect(parseLegacyDefinitions('x'.repeat(500001))[0].problem).toContain('не изменены');});
});
