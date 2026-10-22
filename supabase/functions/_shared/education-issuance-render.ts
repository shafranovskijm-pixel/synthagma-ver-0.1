import {parse, serialize, type DefaultTreeAdapterMap} from 'parse5';
import postcss, {type Declaration} from 'postcss';
import valueParser from 'postcss-value-parser';
import {educationRenderVariablesSchema, type EducationRenderVariables} from './education-issuance-artifact-contract.ts';
import {educationFonts} from './education-issuance-fonts.ts';
import {validateAdmissionBytes} from './admission-case-access.ts';
import {EDUCATION_RENDER_HTML_MAX_BYTES} from './faithful-pdf.ts';

export class EducationTemplateError extends Error {
  constructor(readonly reason: 'unsupported' | 'required_fields' = 'unsupported') {super('SOURCE_UNAVAILABLE');}
}
type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];
const encoder = new TextEncoder();
const fail = (): never => {throw new EducationTemplateError();};
const OPTIONAL = new Set(['document_series', 'qualification_name', 'profession']);
export const EDUCATION_REQUIRED_BODY_FIELDS = ['organization_name', 'full_name', 'program_title', 'document_number', 'reg_number', 'issue_date'] as const;
const KEYS = new Set(Object.keys(educationRenderVariablesSchema.shape));
const TAGS = new Set(('html head body meta title style div span p br strong b em i u s small sub sup section article header footer main h1 h2 h3 h4 h5 h6 table thead tbody tfoot tr td th colgroup col caption ul ol li dl dt dd img hr blockquote a').split(' '));
const ATTRS = new Set(('class id title lang dir role aria-label alt width height colspan rowspan align valign border cellpadding cellspacing style src href charset name content type media').split(' '));
const SAFE_FUNCTIONS = new Set(('calc min max clamp rgb rgba hsl hsla hwb lab lch oklab oklch color color-mix counter counters var linear-gradient repeating-linear-gradient radial-gradient repeating-radial-gradient conic-gradient repeating-conic-gradient rotate rotatex rotatey rotatez rotate3d translate translatex translatey translatez translate3d scale scalex scaley scalez scale3d skew skewx skewy matrix matrix3d perspective blur brightness contrast drop-shadow grayscale hue-rotate invert opacity saturate sepia cubic-bezier steps').split(' '));
const GENERICS = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded']);
const FONT_FAMILY = '"UC019 PTSans"';

function cssIdentifier(value: string): string {
  return value.replace(/\\([0-9a-f]{1,6})(?:\r\n|[ \t\r\n\f])?/gi, (_all, hex: string) => {
    const code = Number.parseInt(hex, 16);
    if (!code || code > 0x10ffff || code >= 0xd800 && code <= 0xdfff) return fail();
    return String.fromCodePoint(code);
  }).replace(/\\([^\r\n\f])/g, '$1').toLowerCase();
}

function safeCssValue(value: string): void {
  if (value.length > 32_768 || value.includes('{{') || value.includes('}}') || /[\x00-\x08\x0b\x0e-\x1f]/.test(value)) fail();
  const parsed = valueParser(value);
  parsed.walk(node => {
    if (node.type === 'function' && !SAFE_FUNCTIONS.has(cssIdentifier(node.value))) fail();
  });
  // Catch escaped/comment-separated spellings as well as ordinary url().
  const normalized = cssIdentifier(value.replace(/\/\*[\s\S]*?\*\//g, ''));
  if (/(?:url|expression|image-set|image|src|element|paint)\s*\(/i.test(normalized)
    || /(?:https?:|file:|ftp:|javascript:|vbscript:|data:)/i.test(normalized)) fail();
}

function fontFallback(value: string): string {
  if (/^(?:inherit|initial|unset|revert|revert-layer)$/i.test(value.trim())) return value;
  const parsed = valueParser(value);
  const nodes = parsed.nodes;
  let inserted = false;
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (node.type === 'word' && GENERICS.has(cssIdentifier(node.value))) {
      nodes.splice(index, 0, ...valueParser(`${FONT_FAMILY}, `).nodes); inserted = true; break;
    }
  }
  return parsed.toString() + (inserted ? '' : `, ${FONT_FAMILY}`);
}

function declaration(decl: Declaration): void {
  const property = cssIdentifier(decl.prop);
  if (property === 'behavior' || property === '-moz-binding' || property.startsWith('on')) fail();
  safeCssValue(decl.value);
  if (property === 'font-family' || property === 'font') decl.value = fontFallback(decl.value);
}

function safeCss(value: string, inline: boolean): string {
  if (encoder.encode(value).length > 131_072) fail();
  try {
    const root = postcss.parse(inline ? `uc019{${value}}` : value);
    root.walkAtRules(rule => {
      const name = cssIdentifier(rule.name);
      if (inline || !['media', 'page'].includes(name)) fail();
      safeCssValue(rule.params);
    });
    root.walkDecls(declaration);
    root.walkRules(rule => {if (rule.selector.length > 8192 || /[{}<\x00]/.test(rule.selector) || rule.selector.includes('{{')) fail();});
    if (!inline) return root.toString();
    const rule = root.first;
    if (!rule || rule.type !== 'rule' || root.nodes.length !== 1) fail();
    return rule.nodes!.map(node => node.toString()).join(';');
  } catch {return fail();}
}

function imageData(value: string): void {
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || value.length > 1_048_576) fail();
  try {
    const raw = atob(match[2]);
    const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
    validateAdmissionBytes(bytes, match[1] as 'image/png' | 'image/jpeg');
  } catch {fail();}
}

function replaceText(value: string, variables: EducationRenderVariables): string {
  return value.replace(/\{\{([a-z_]+)\}\}/g, (_all, key: string) => {
    if (!KEYS.has(key)) return fail();
    const scalar = variables[key as keyof EducationRenderVariables];
    if (typeof scalar !== 'string' || !OPTIONAL.has(key) && !scalar.trim()) return fail();
    return scalar;
  });
}

/** Strict approved-template subset. Unsupported content is refused, never silently dropped. */
export function prepareEducationHtml(templateBytes: Uint8Array, rawVariables: EducationRenderVariables): string {
  if (templateBytes.byteLength < 1 || templateBytes.byteLength > 1_048_576) fail();
  const parsedVariables = educationRenderVariablesSchema.safeParse(rawVariables);
  if (!parsedVariables.success) fail();
  const variables = parsedVariables.data;
  let source: string;
  try {source = new TextDecoder('utf-8', {fatal: true}).decode(templateBytes);} catch {return fail();}
  if (/[\x00-\x08\x0b\x0e-\x1f]/.test(source) || /\{%|%\}|<%|%>/.test(source)) fail();
  // Validate the exact grammar before parsing, including comments/attributes/CSS.
  const rest = source.replace(/\{\{([a-z_]+)\}\}/g, (_all, key: string) => KEYS.has(key) ? '' : fail());
  if (rest.includes('{{') || rest.includes('}}')) fail();
  const errors: string[] = [];
  const document = parse(source, {onParseError: error => {if (error.code !== 'missing-doctype') errors.push(error.code);}});
  if (errors.length) fail();
  let count = 0; const usedBodyFields = new Set<string>();
  const visit = (node: Node, depth: number, parentTag = '', inBody = false): void => {
    if (++count > 20_000 || depth > 128) fail();
    if (node.nodeName === '#text') {
      const text = node as DefaultTreeAdapterMap['textNode'];
      if (parentTag === 'style') {if (text.value.includes('{{')) fail(); text.value = safeCss(text.value, false);}
      else {
        if (inBody && parentTag !== 'title') for (const match of text.value.matchAll(/\{\{([a-z_]+)\}\}/g)) usedBodyFields.add(match[1]);
        text.value = replaceText(text.value, variables);
      }
      return;
    }
    if (node.nodeName === '#comment') {if ((node as DefaultTreeAdapterMap['commentNode']).data.includes('{{')) fail(); return;}
    if ('tagName' in node) {
      const element = node as Element;
      if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !TAGS.has(element.tagName) || element.attrs.length > 100) fail();
      for (const attr of element.attrs) {
        if (attr.namespace || attr.prefix || !ATTRS.has(attr.name) || attr.value.includes('{{') || attr.value.includes('}}') || /[\x00-\x1f\x7f]/.test(attr.value)) fail();
        if (attr.name === 'style') attr.value = safeCss(attr.value, true);
        if (attr.name === 'src') {if (element.tagName !== 'img') fail(); imageData(attr.value);}
        if (attr.name === 'href' && (element.tagName !== 'a' || !/^#[a-zA-Z0-9_-]+$/.test(attr.value))) fail();
      }
      if (element.tagName === 'img' && !element.attrs.some(attr => attr.name === 'src')) fail();
      if (element.tagName === 'meta') {
        const attrs = Object.fromEntries(element.attrs.map(attr => [attr.name, attr.value]));
        if (!(Object.keys(attrs).length === 1 && /^utf-?8$/i.test(attrs.charset || ''))
          && !(Object.keys(attrs).length === 2 && attrs.name === 'viewport' && /^[\w\s.,=+-]{1,300}$/.test(attrs.content || ''))) fail();
      }
      parentTag = element.tagName;
      if (parentTag === 'body') inBody = true;
    }
    if ('childNodes' in node) for (const child of node.childNodes) visit(child, depth + 1, parentTag, inBody);
  };
  visit(document, 0);
  if (EDUCATION_REQUIRED_BODY_FIELDS.some(key => !usedBodyFields.has(key))) throw new EducationTemplateError('required_fields');
  const html = document.childNodes.find(node => 'tagName' in node && node.tagName === 'html') as Element | undefined;
  const head = html?.childNodes.find(node => 'tagName' in node && node.tagName === 'head') as Element | undefined;
  if (!head) fail();
  const csp = "default-src 'none'; script-src 'none'; connect-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'";
  const fonts = educationFonts.map(font => `@font-face{font-family:${FONT_FAMILY};font-style:normal;font-weight:${font.weight};src:url('${font.dataUrl}') format('truetype');font-display:block}`).join('');
  // Worker-owned assets are added after template validation; customer CSS remains later.
  const trusted = parse(`<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>${fonts}html{font-family:${FONT_FAMILY},sans-serif}</style></head></html>`);
  const trustedHtml = trusted.childNodes.find(node => 'tagName' in node && node.tagName === 'html') as Element;
  const trustedHead = trustedHtml.childNodes.find(node => 'tagName' in node && node.tagName === 'head') as Element;
  for (const node of [...trustedHead.childNodes].reverse()) {node.parentNode = head; head.childNodes.unshift(node);}
  const output = serialize(document);
  if (encoder.encode(output).byteLength > EDUCATION_RENDER_HTML_MAX_BYTES) fail();
  return output;
}
