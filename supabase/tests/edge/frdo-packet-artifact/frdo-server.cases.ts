import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import JSZip from 'jszip';
import {trustedFrdoXmlRuntime} from '../../../functions/frdo-packet-artifact/xmlRuntime';
import {captureFrozenPacket} from '../../../../src/lib/frdoPackets/canonicalCapture';
import {generateMappedOfficialWorkbook,generateOfficialWorkbook,verifyMappedOfficialWorkbook} from '../../../../src/lib/frdoFoundation/template';
import {cellValue,elements,parseXml,sharedStrings} from '../../../../src/lib/frdoFoundation/ooxml';
import {canonicalJson,sha256} from '../../../../src/lib/frdoFoundation/hash';
import {OFFICIAL_TEMPLATES} from '../../../../src/lib/frdoFoundation/officialMetadata';
import {expectedDpo,expectedPo,guard,input} from '../../../../src/lib/frdoFoundation/__tests__/fixtures';
import type {Stream} from '../../../../src/lib/frdoFoundation/types';

beforeAll(()=>vi.stubGlobal('crypto',webcrypto));
afterAll(()=>vi.unstubAllGlobals());
const encoder=new TextEncoder();
async function donor(stream:Stream){return new Uint8Array(await readFile(new URL('../../../../src/lib/frdoFoundation/__fixtures__/'+(stream==='dpo'?'dpo20230116.xlsx':'po16102026.xlsx'),import.meta.url)));}
async function parts(raw:Uint8Array){const zip=await JSZip.loadAsync(raw),result=new Map<string,Uint8Array>(),paths=Object.keys(zip.files);expect(paths).toHaveLength(14);for(const path of paths){const file=zip.file(path);expect(file).not.toBeNull();result.set(path,await file!.async('uint8array'));}return result;}

describe('UC020 persisted mapped capture with explicit pinned server XML runtime',()=>{
 it.each([['dpo',expectedDpo],['po',expectedPo]] as const)('reuses the single writer for %s, verifies every byte/part and never reads global DOMParser',async(stream,expected)=>{
  const originalDOMParser=globalThis.DOMParser,globalParser=vi.fn(()=>{throw Error('Global DOM forbidden for server operation');});vi.stubGlobal('DOMParser',globalParser);
  try{
   const source=await input(stream),capture=await captureFrozenPacket(source,guard),sealedBefore=canonicalJson(capture),raw=await donor(stream),before=raw.slice(),options={xml:trustedFrdoXmlRuntime};
   const out=await generateMappedOfficialWorkbook(capture.mapped_batch,raw,guard,options),fromGenuine=await generateOfficialWorkbook(source,raw,guard,options),native=await parts(raw),written=await parts(out.bytes),meta=OFFICIAL_TEMPLATES[stream];
   expect(fromGenuine.bytes).toEqual(out.bytes);expect(fromGenuine.byte_sha256).toBe(out.byte_sha256);expect(raw).toEqual(before);expect(canonicalJson(capture)).toBe(sealedBefore);expect(out.signing).toEqual({status:'not_verified'});expect(await sha256(raw)).toBe(meta.donor_sha256);expect(await sha256(out.bytes)).toBe(out.byte_sha256);expect(out.byte_size).toBe(out.bytes.length);expect(out.root_sha256).toBe(capture.mapped_batch.root_sha256);expect([...written.keys()].sort()).toEqual([...native.keys()].sort());
   for(const [path,bytes]of native)if(path!==meta.sheet_path)expect(written.get(path)).toEqual(bytes);
   const oldText=new TextDecoder().decode(native.get(meta.sheet_path)),newText=new TextDecoder().decode(written.get(meta.sheet_path)),outside=(text:string)=>text.replace(/<row\b[^>]*\br="2"[^>]*>[^]*?<\/row>/,'<!--bounded-target-row-->');expect(outside(newText)).toBe(outside(oldText));
   const doc=parseXml(written.get(meta.sheet_path)!,trustedFrdoXmlRuntime),strings=sharedStrings(written,trustedFrdoXmlRuntime),row=elements(doc,'row').find(value=>value.getAttribute('r')==='2');expect(row).toBeDefined();const cells=Array.from(row!.children);expect(cells).toHaveLength(meta.column_count);expect(cells.map(cell=>cell.getAttribute('r'))).toEqual(meta.columns.map(column=>column.letter+'2'));expect(cells.map(cell=>cellValue(cell,strings))).toEqual(expected);expect(elements(doc,'f')).toEqual([]);expect(elements(doc,'hyperlink')).toEqual([]);expect(cellValue(cells[cells.length-1],strings)).toBeNull();
   const verified=await verifyMappedOfficialWorkbook(capture.mapped_batch,raw,out.bytes,guard,options);expect(verified.parts).toEqual(out.parts);expect(verified.byte_sha256).toBe(out.byte_sha256);expect(verified.signing).toEqual({status:'not_verified'});expect(globalParser).not.toHaveBeenCalled();
  }finally{vi.stubGlobal('DOMParser',originalDOMParser);}
 },30000);
 it.each(['<r><a></r>','<r a=unquoted/>','<r a="1" a="2"/>','<r>&undefinedEntity;</r>'])('rejects malformed/recoverable XML without accepting a recovered DOM: %s',text=>{
  expect(()=>parseXml(encoder.encode(text),trustedFrdoXmlRuntime)).toThrowError(expect.objectContaining({code:'INVALID_WORKBOOK'}));
 });
 it('rejects declarations/entities before invoking any parser, without resource fetching',()=>{
  const parse=vi.fn(()=>{throw Error('must not run');});for(const text of ['<!DOCTYPE r SYSTEM "https://invalid.test/private"><r/>','<!ENTITY secret SYSTEM "file:///unreadable"><r/>'])expect(()=>parseXml(encoder.encode(text),{parse})).toThrowError(expect.objectContaining({code:'INVALID_WORKBOOK'}));expect(parse).not.toHaveBeenCalled();
 });
 it('does not silently fall back to browser DOM after an injected dependency fails',()=>{
  const browser=vi.fn(()=>{throw Error('must not fall back');}),old=globalThis.DOMParser;vi.stubGlobal('DOMParser',browser);try{expect(()=>parseXml(encoder.encode('<r/>'),{parse:()=>{throw Error('adapter failed');}})).toThrowError(expect.objectContaining({code:'INVALID_WORKBOOK'}));expect(browser).not.toHaveBeenCalled();}finally{vi.stubGlobal('DOMParser',old);}
 });
 it('rejects changed literal cells even if an outer mapped root has been resealed',async()=>{
  const capture=await captureFrozenPacket(await input(),guard),changed=structuredClone(capture.mapped_batch);changed.rows[0].cells[10]='Подменённое название';const {root_sha256:ignored,...body}=changed;void ignored;changed.root_sha256=await sha256(canonicalJson(body));const parse=vi.fn(text=>trustedFrdoXmlRuntime.parse(text));await expect(generateMappedOfficialWorkbook(changed,await donor('dpo'),guard,{xml:{parse}})).rejects.toMatchObject({code:'SOURCE_CHANGED'});expect(parse).not.toHaveBeenCalled();
 });
 it('keeps one whole 45s deadline including sealed-capture hashing, before reading XML',async()=>{
  const capture=await captureFrozenPacket(await input(),guard),raw=await donor('dpo'),nativeDigest=webcrypto.subtle.digest.bind(webcrypto.subtle);let clock=0;
  const now=vi.spyOn(performance,'now').mockImplementation(()=>clock),digest=vi.spyOn(webcrypto.subtle,'digest').mockImplementation(async(...args:Parameters<typeof webcrypto.subtle.digest>)=>{const result=await nativeDigest(...args);clock=45001;return result;}),parse=vi.fn(text=>trustedFrdoXmlRuntime.parse(text));
  try{await expect(generateMappedOfficialWorkbook(capture.mapped_batch,raw,guard,{xml:{parse}})).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});expect(digest).toHaveBeenCalledTimes(1);expect(parse).not.toHaveBeenCalled();}finally{digest.mockRestore();now.mockRestore();}
 });
 it('refuses changed official donor bytes before invoking the injected parser',async()=>{
  const capture=await captureFrozenPacket(await input(),guard),raw=await donor('dpo');raw[55]^=1;const parse=vi.fn(text=>trustedFrdoXmlRuntime.parse(text));await expect(generateMappedOfficialWorkbook(capture.mapped_batch,raw,guard,{xml:{parse}})).rejects.toMatchObject({code:'TEMPLATE_CHANGED'});expect(parse).not.toHaveBeenCalled();
 });
});
