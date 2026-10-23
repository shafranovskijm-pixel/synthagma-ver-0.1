import { refuse } from './hash';

/** Readonly subset actually used by the shared OOXML validator. No browser globals,
 * serializer, DOM mutation or resource loading are required by this port. */
export interface XmlElement {
  readonly namespaceURI: string | null;
  readonly localName: string | null;
  readonly textContent: string | null;
  readonly children: ArrayLike<XmlElement>;
  getAttribute(name: string): string | null;
  getElementsByTagNameNS(namespace: string, localName: string): ArrayLike<XmlElement>;
}
export interface XmlDocument {
  readonly documentElement: XmlElement | null;
  getElementsByTagName(name: string): ArrayLike<XmlElement>;
  getElementsByTagNameNS(namespace: string, localName: string): ArrayLike<XmlElement>;
}
export interface XmlRuntime { parse(text: string): XmlDocument }

/** Selected explicitly by each operation. Never reassign globalThis.DOMParser. */
export const browserXmlRuntime: XmlRuntime = Object.freeze({
  parse(text: string): XmlDocument {
    if (typeof DOMParser === 'undefined') return refuse('DEPENDENCY_UNAVAILABLE');
    return new DOMParser().parseFromString(text, 'application/xml');
  },
});
