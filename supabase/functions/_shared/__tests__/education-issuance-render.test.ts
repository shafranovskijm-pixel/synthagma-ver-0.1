import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {parse} from 'parse5';
import {prepareEducationHtml, EducationTemplateError, EDUCATION_REQUIRED_BODY_FIELDS} from '../education-issuance-render';
import {educationFonts} from '../education-issuance-fonts';
import {educationRenderVariablesSchema} from '../education-issuance-artifact-contract';
import {vars} from './education-issuance-artifact.fixture';

const encode = (text: string) => new TextEncoder().encode(text);
const rawDocument = (body: string, head = '') => `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;
const requiredBody = EDUCATION_REQUIRED_BODY_FIELDS.map(key => `<p>{{${key}}}</p>`).join('');
const document = (body: string, css = '') => rawDocument(body + requiredBody, `<style>${css}</style>`);
function pngData(): string {
  const chunk = (kind: string, data: Uint8Array) => {
    const bytes = new Uint8Array(12 + data.length), view = new DataView(bytes.buffer); view.setUint32(0, data.length);
    bytes.set(encode(kind), 4); bytes.set(data, 8); let crc = -1;
    for (const byte of bytes.subarray(4, -4)) {crc ^= byte; for (let index = 0; index < 8; index++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);}
    view.setUint32(bytes.length - 4, (crc ^ -1) >>> 0); return bytes;
  };
  return 'data:image/png;base64,' + Buffer.concat([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', new Uint8Array([0,0,0,1,0,0,0,1,8,6,0,0,0])), chunk('IDAT', deflateSync(new Uint8Array([0,0,0,0,255]))), chunk('IEND', new Uint8Array())]).toString('base64');
}

describe('UC019 exact approved HTML rendering inputs', () => {
  it('preserves @page, borderless and bordered long Cyrillic tables, nested lists and actual embedded stamp bytes', () => {
    const stamp = pngData(), rows = Array.from({length: 36}, (_, index) => `<tr><td>${index + 1}</td><td>Кириллица: {{program_title}}</td></tr>`).join('');
    const source = document(`<h1>{{full_name}}</h1><table class="details"><tr><td>Заказчик: {{organization_name}}</td></tr></table><table class="grid"><thead><tr><th>№</th><th>Программа</th></tr></thead><tbody>${rows}</tbody></table><ul><li>Первый<ul><li>Второй</li></ul></li></ul><img alt="Синтетический штамп" src="${stamp}">`,
      '@page{size:A4 landscape;margin:12mm}.details td{border:0}.grid > tbody > tr > td{border:1px solid #000}.grid{font-family:"Times New Roman",serif}');
    const output = prepareEducationHtml(encode(source), vars);
    expect(output).toContain('size:A4 landscape'); expect(output).toContain('.details td{border:0}');
    expect(output).toContain('border:1px solid #000'); expect(output).toContain('font-family:"Times New Roman","UC019 PTSans", serif');
    expect(output.match(/Кириллица:/g)).toHaveLength(36); expect(output).toContain('Первый<ul><li>Второй</li></ul>');
    expect(output).toContain(stamp); expect(output).toContain("script-src 'none'"); expect(output).not.toContain('https://');
    expect(output).not.toContain('{{');
  });

  it('scalar injection remains literal text rather than attributes, scripts, styles or HTML', () => {
    const output = prepareEducationHtml(encode(document('<p>{{full_name}}</p>')), {...vars, full_name: '</p><script>alert(1)</script>&" Пример'});
    const ast = parse(output), tags: string[] = [];
    const visit = (node: any) => {if (node.tagName) tags.push(node.tagName); for (const child of node.childNodes || []) visit(child);}; visit(ast);
    expect(tags).not.toContain('script'); expect(output).toContain('&lt;script&gt;alert(1)&lt;/script&gt;&amp;');
  });

  it.each([
    '<p>{{unknown_field}}</p>', '<p>{{ full_name }}</p>', '<p>{{full_name}</p>', '<p>{% full_name %}</p>',
    '<img src="{{full_name}}">', '<div style="color:{{full_name}}">Text</div>',
    '<style>p{color:{{full_name}}}</style>', '<script>alert(1)</script>', '<img src="https://external.invalid/stamp.png">',
    '<img src="data:image/svg+xml;base64,PHN2Zy8+">', '<iframe src="data:text/html,hello"></iframe>',
    '<div onclick="alert(1)">Text</div>', '<meta http-equiv="refresh" content="0;url=https://external.invalid">',
    '<style>@import "https://external.invalid/a.css";</style>', '<style>p{background:u\\72l(https://external.invalid/x)}</style>',
    '<style>p{background:image-set("https://external.invalid/x" 1x)}</style>', '<style>@font-face{font-family:Other;src:local(Arial)}</style>',
    '<img src="data:image/png;base64,iVBORw0KGgo=">',
  ])('refuses unsupported template instead of dropping or executing it: %s', body => {
    expect(() => prepareEducationHtml(encode(document(body)), vars)).toThrow(EducationTemplateError);
  });

  it('used nonoptional blank scalar is refused; explicit empty optional qualification is retained', () => {
    expect(() => prepareEducationHtml(encode(document('{{organization_director_name}}')), {...vars, organization_director_name: ''})).toThrow(EducationTemplateError);
    expect(prepareEducationHtml(encode(document('<p>{{qualification_name}}</p>')), vars)).toContain('<p></p>');
  });

  it.each(['program_title', 'qualification_name', 'profession'] as const)('preserves the complete approved 4000-character %s through wire validation and HTML rendering', field => {
    const value = 'Я'.repeat(4000), variables = {...vars, [field]: value};
    expect(educationRenderVariablesSchema.safeParse(variables).success).toBe(true);
    const output = prepareEducationHtml(encode(document(`<p>{{${field}}}</p>`)), variables);
    expect(output).toContain(`<p>${value}</p>`);
    expect(output).not.toContain('{{');
  });

  it.each(['program_title', 'qualification_name', 'profession'] as const)('refuses a beyond-source 4001-character %s instead of truncating or rendering it', field => {
    const variables = {...vars, [field]: 'Я'.repeat(4001)};
    expect(educationRenderVariablesSchema.safeParse(variables).success).toBe(false);
    expect(() => prepareEducationHtml(encode(document(`<p>{{${field}}}</p>`)), variables)).toThrow(EducationTemplateError);
  });

  it('rejects invalid UTF8 and template limit before parsing', () => {
    expect(() => prepareEducationHtml(new Uint8Array([0xff]), vars)).toThrow(EducationTemplateError);
    expect(() => prepareEducationHtml(new Uint8Array(1_048_577), vars)).toThrow(EducationTemplateError);
  });

  it('embedded font bytes equal the existing owned repository assets and declared SHA256 (no external substitution)', () => {
    for (const font of educationFonts) {
      const actual = Buffer.from(font.dataUrl.split(',')[1], 'base64'), existing = readFileSync(font.path);
      expect(actual.length).toBe(font.bytes); expect(createHash('sha256').update(actual).digest('hex')).toBe(font.sha256);
      expect(createHash('sha256').update(existing).digest('hex')).toBe(font.sha256);
    }
  });

  it.each(EDUCATION_REQUIRED_BODY_FIELDS)('requires %s as an actual approved body placeholder, with no fallback insertion', missing => {
    const body = EDUCATION_REQUIRED_BODY_FIELDS.filter(key => key !== missing).map(key => `<p>{{${key}}}</p>`).join('');
    expect(() => prepareEducationHtml(encode(rawDocument(body)), vars)).toThrow(EducationTemplateError);
  });

  it.each(['comment', 'title', 'attribute', 'style'] as const)('a number placeholder only in %s cannot satisfy the essential body field', location => {
    const body = EDUCATION_REQUIRED_BODY_FIELDS.filter(key => key !== 'document_number').map(key => `<p>{{${key}}}</p>`).join('');
    const source = location === 'comment' ? rawDocument(body + '<!--{{document_number}}-->')
      : location === 'title' ? rawDocument(body, '<title>{{document_number}}</title>')
      : location === 'attribute' ? rawDocument(body + '<span title="{{document_number}}">Constant</span>')
      : rawDocument(body, '<style>p::after{content:"{{document_number}}"}</style>');
    expect(() => prepareEducationHtml(encode(source), vars)).toThrow(EducationTemplateError);
  });
});
