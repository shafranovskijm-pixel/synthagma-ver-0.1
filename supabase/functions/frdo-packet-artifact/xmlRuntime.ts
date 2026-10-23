import { DOMParser } from 'npm:@xmldom/xmldom@0.9.12';
import type { XmlRuntime } from '../../../src/lib/frdoFoundation/xmlRuntime.ts';

/** Exactly pinned pure JS parser, selected per operation; no global DOM mutation.
 * Every diagnostic severity aborts, including recoverable warnings. No resource IO. */
export const trustedFrdoXmlRuntime: XmlRuntime = Object.freeze({
  parse(text: string) {
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('FRDO_XML_REJECTED');
    return new DOMParser({ onError: () => { throw new Error('FRDO_XML_REJECTED'); } }).parseFromString(text, 'application/xml');
  },
});
