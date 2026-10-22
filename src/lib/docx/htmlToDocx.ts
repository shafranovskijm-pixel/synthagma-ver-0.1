import { isOwnStorageProxyImageUrl } from '@/utils/storageProxyUrl';
import { captureDocumentOutputFence } from "@/lib/documents/outputFence";
/**
 * Генерация настоящего редактируемого DOCX (OOXML) из HTML-разметки документа.
 * Без внешних зависимостей кроме jszip — важна поддержка кириллицы и таблиц.
 */
import JSZip from "jszip";
const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="ru-RU"/>
</w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>
<w:pPr><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/>
<w:pPr><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/>
<w:pPr><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
</w:styles>`;
const SECTION = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
const blobFences = new WeakMap<Blob, () => void>();
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const SKIP = new Set(['SCRIPT', 'STYLE', 'HEAD', 'TEMPLATE', 'NOSCRIPT']);
const BLOCKS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'BLOCKQUOTE', 'PRE', 'TABLE', 'UL', 'OL', 'HR']);
const UNSUPPORTED = 'svg,canvas,iframe,object,embed,input,textarea,select,video,audio,math';
const PAGE_WIDTH = 9355;
/** XML 1.0 cannot represent these characters. Refuse rather than silently edit a contract. */
function validXml(text: string): string {
    for (const ch of text) {
        const n = ch.codePointAt(0)!;
        if ((n < 32 && ![9, 10, 13].includes(n)) || (n >= 0xd800 && n <= 0xdfff) || n === 0xfffe || n === 0xffff)
            throw new Error('В документе есть символ, недопустимый для Word. Исправьте исходный текст.');
    }
    return text;
}
export function escapeXml(s: string): string {
    return validXml(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
interface Picture {
    id: string;
    name: string;
    bytes: Uint8Array;
    width: number;
    height: number;
    type: 'png' | 'jpeg';
}
interface Context {
    doc: Document;
    pictures: Map<Element, Picture>;
    pageWidth?: number;
}
const styleCache = new WeakMap<Element, Record<string, string>>();
const inheritedCache = new WeakMap<Element, Record<string, string>>();
interface Fmt {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    font?: string;
    size?: number;
    color?: string;
}
function cssDeclarations(value: string, target: Record<string, string>) {
    for (const decl of value.split(';')) {
        const colon = decl.indexOf(':');
        if (colon > 0) {
            const key = decl.slice(0, colon).trim().toLowerCase();
            const val = decl.slice(colon + 1).trim().replace(/\s*!important\s*$/i, '');
            target[key] = val;
            // Expand only table-border shorthands, in source order: a later
            // border:none must also reset an earlier border-left declaration.
            const side = /^border-(top|right|bottom|left)$/.exec(key);
            if (key === 'border' || side) {
                for (const edge of side ? [side[1]] : ['top', 'right', 'bottom', 'left']) {
                    target['border-' + edge] = val;
                    for (const part of ['width', 'style', 'color'])
                        delete target['border-' + edge + '-' + part];
                }
            }
            const part = /^border-(width|style|color)$/.exec(key);
            if (part) {
                const [top, right = top, bottom = top, left = right] = val.split(/\s+/);
                for (const [edge, entry] of Object.entries({ top, right, bottom, left }))
                    target['border-' + edge + '-' + part[1]] = entry;
            }
        }
    }
}
/** A finite cascade for editable universal documents; the original OOXML-template path is separate. */
function ownStyle(el: Element, ctx: Context): Record<string, string> {
    const cached = styleCache.get(el);
    if (cached)
        return cached;
    const style: Record<string, string> = {};
    for (const sheet of Array.from(ctx.doc.querySelectorAll('style'))) {
        for (const rule of (sheet.textContent || '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
            const selector = rule[1].trim();
            if (selector.startsWith('@'))
                continue;
            try {
                if (el.matches(selector))
                    cssDeclarations(rule[2], style);
            }
            catch { /* unsupported selector has no effect */ }
        }
    }
    cssDeclarations(el.getAttribute('style') || '', style);
    const margin = style.margin?.split(/\s+/);
    if (margin?.length) {
        const [top, right = top, bottom = top, left = right] = margin;
        for (const [key, val] of Object.entries({ top, right, bottom, left }))
            style["margin-" + key] ||= val;
    }
    styleCache.set(el, style);
    return style;
}
function inheritedStyle(el: Element, ctx: Context): Record<string, string> {
    const cached = inheritedCache.get(el);
    if (cached)
        return cached;
    const result: Record<string, string> = {};
    if (el.parentElement) {
        const parent = inheritedStyle(el.parentElement, ctx);
        for (const key of ['font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'text-align', 'color', 'line-height'])
            if (parent[key])
                result[key] = parent[key];
    }
    Object.assign(result, ownStyle(el, ctx));
    inheritedCache.set(el, result);
    return result;
}
function points(value?: string): number | undefined {
    const m = /^([\d.]+)(pt|px|mm|cm|in)?$/i.exec(value || '');
    if (!m)
        return undefined;
    const n = Number(m[1]) * ({ pt: 1, px: .75, mm: 72 / 25.4, cm: 72 / 2.54, in: 72 }[m[2]?.toLowerCase() || 'px']);
    return Number.isFinite(n) && n >= 0 && n <= 1000 ? n : undefined;
}
function color(value?: string): string | undefined {
    if (!value)
        return;
    const named: Record<string, string> = { black: '000000', white: 'FFFFFF', gray: '808080', grey: '808080' };
    if (named[value.toLowerCase()])
        return named[value.toLowerCase()];
    const m = /^#([a-f\d]{3}|[a-f\d]{6})$/i.exec(value);
    if (m)
        return (m[1].length === 3 ? [...m[1]].map(x => x + x).join('') : m[1]).toUpperCase();
}
function formatting(el: Element, ctx: Context, inherited: Fmt = {}): Fmt {
    const s = inheritedStyle(el, ctx), tag = el.tagName;
    const size = points(s['font-size']);
    return { ...inherited,
        bold: /^(bold|[6-9]00)$/i.test(s['font-weight'] || '') || ['B', 'STRONG', 'TH'].includes(tag) || (s['font-weight'] ? false : inherited.bold),
        italic: s['font-style'] === 'italic' || ['I', 'EM'].includes(tag) || (s['font-style'] ? false : inherited.italic),
        underline: /underline/.test(s['text-decoration'] || '') || tag === 'U' || inherited.underline,
        font: s['font-family']?.split(',')[0].trim().replace(/^['"]|['"]$/g, '') || inherited.font,
        size: size ? Math.round(Math.min(96, Math.max(6, size)) * 2) : inherited.size,
        color: color(s.color) || inherited.color,
    };
}
function runXml(text: string, fmt: Fmt): string {
    if (!text)
        return '';
    const props = [fmt.bold ? '<w:b/>' : '', fmt.italic ? '<w:i/>' : '', fmt.underline ? '<w:u w:val="single"/>' : '',
        fmt.font ? '<w:rFonts w:ascii="' + escapeXml(fmt.font) + '" w:hAnsi="' + escapeXml(fmt.font) + '"/>' : '',
        fmt.size ? '<w:sz w:val="' + fmt.size + '"/>' : '', fmt.color ? '<w:color w:val="' + fmt.color + '"/>' : ''].join('');
    return '<w:r>' + (props ? '<w:rPr>' + props + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + escapeXml(text) + '</w:t></w:r>';
}
function drawing(pic: Picture, el: Element, ctx: Context): string {
    const style = ownStyle(el, ctx);
    const available = (ctx.pageWidth || PAGE_WIDTH) / 20;
    const length = (value?: string) => { const percent = /^([\d.]+)%$/.exec(value || ''); return percent ? available * Number(percent[1]) / 100 : points(value); };
    const explicitWidth = length(style.width || el.getAttribute('width') || ''), explicitHeight = points(style.height || el.getAttribute('height') || '');
    let width = explicitWidth || (explicitHeight ? explicitHeight * pic.width / pic.height : pic.width * .75);
    let height = explicitHeight || width * pic.height / pic.width;
    const maxWidth = length(style['max-width']) || available, maxHeight = points(style['max-height']) || 650;
    const scale = Math.min(1, available / width, maxWidth / width, maxHeight / height, 650 / height);
    width *= scale;
    height *= scale;
    const cx = Math.round(width * 12700), cy = Math.round(height * 12700), id = pic.id.slice(3);
    return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="' + id + '" name="' + escapeXml(el.getAttribute('alt') || pic.name) + '"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="' + id + '" name="' + escapeXml(pic.name) + '"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + pic.id + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
}
function collect(node: Node, fmt: Fmt, ctx: Context): string {
    if (node.nodeType === 3)
        return runXml((node.nodeValue || '').replace(/[\t\r\n ]+/g, ' '), fmt);
    if (node.nodeType !== 1)
        return '';
    const el = node as Element;
    if (SKIP.has(el.tagName) || ownStyle(el, ctx).display === 'none')
        return '';
    if (el.tagName === 'BR')
        return '<w:r><w:br/></w:r>';
    if (el.tagName === 'IMG') {
        const pic = ctx.pictures.get(el);
        if (!pic)
            throw new Error('Изображение не подготовлено для DOCX. Используйте полную выгрузку Word.');
        return drawing(pic, el, ctx);
    }
    const next = formatting(el, ctx, fmt);
    return Array.from(el.childNodes).map(n => collect(n, next, ctx)).join('');
}
function paragraph(nodes: Node[], el: Element, ctx: Context, styleId?: string, prefix = ''): string {
    const s = inheritedStyle(el, ctx), own = ownStyle(el, ctx);
    const align = s['text-align'] || el.getAttribute('align');
    const props = [styleId ? '<w:pStyle w:val="' + styleId + '"/>' : '',
        ['center', 'right', 'justify', 'left'].includes(align || '') ? '<w:jc w:val="' + (align === 'justify' ? 'both' : align) + '"/>' : '',
        own['page-break-before'] === 'always' ? '<w:pageBreakBefore/>' : '',
        '<w:spacing w:before="' + Math.round((points(own['margin-top']) || 0) * 20) + '" w:after="' + Math.round((points(own['margin-bottom']) || 0) * 20) + '"/>'].join('');
    const fmt = formatting(el, ctx);
    return '<w:p><w:pPr>' + props + '</w:pPr>' + runXml(prefix, fmt) + nodes.map(n => collect(n, fmt, ctx)).join('') + '</w:p>';
}
function span(el: Element, attr: string): number {
    const raw = el.getAttribute(attr) || '1';
    if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 100)
        throw new Error('Недопустимое объединение ячеек таблицы.');
    return Number(raw);
}
/** HTML tables are borderless unless a table/cell declaration supplies a border. */
function borderXml(edge: string, style: Record<string, string>, legacyBorder?: string): string {
    const base = style['border-' + edge] ?? legacyBorder ?? '';
    const tokens = base.toLowerCase().split(/\s+/);
    const kind = style['border-' + edge + '-style'] || tokens.find(x => /^(none|hidden|solid|dashed|dotted|double)$/.test(x)) || 'none';
    const rawWidth = style['border-' + edge + '-width'] || tokens.find(x => /^(?:[\d.]+(?:px|pt|mm|cm|in)?|thin|medium|thick)$/.test(x)) || 'medium';
    const width = ({ thin: .75, medium: 2.25, thick: 3.75 } as Record<string, number>)[rawWidth] ?? points(rawWidth);
    if (kind === 'none' || kind === 'hidden' || width === 0)
        return '<w:' + edge + ' w:val="nil"/>';
    const line = ({ solid: 'single', dashed: 'dashed', dotted: 'dotted', double: 'double' } as Record<string, string>)[kind];
    if (!line || width === undefined)
        throw new Error('Неподдерживаемая граница таблицы. Укажите толщину и тип линии явно.');
    const shade = color(style['border-' + edge + '-color']) || tokens.map(x => color(x)).find(Boolean) || '000000';
    return '<w:' + edge + ' w:val="' + line + '" w:sz="' + Math.max(2, Math.min(96, Math.round(width * 8))) + '" w:color="' + shade + '"/>';
}
function tableXml(table: Element, ctx: Context): string {
    const rows = Array.from(table.children).flatMap(el => el.tagName === 'TR' ? [el] : ['THEAD', 'TBODY', 'TFOOT'].includes(el.tagName) ? Array.from(el.children).filter(x => x.tagName === 'TR') : []);
    if (!rows.length)
        return '';
    const carry = new Map<number, {
        left: number;
        cols: number;
        cell: Element;
    }>();
    let maxCols = 0;
    const lines: Array<Array<{
        cell: Element;
        cols: number;
        continued: boolean;
        merged: boolean;
        col: number;
    }>> = [];
    for (const row of rows) {
        const cells = Array.from(row.children).filter(el => ['TD', 'TH'].includes(el.tagName));
        const line: typeof lines[number] = [];
        let col = 0;
        const continuation = () => {
            while (carry.has(col)) {
                const item = carry.get(col)!;
                line.push({ cell: item.cell, cols: item.cols, continued: true, merged: true, col });
                item.left--;
                if (!item.left)
                    carry.delete(col);
                col += item.cols;
            }
        };
        for (const cell of cells) {
            continuation();
            const cols = span(cell, 'colspan'), count = span(cell, 'rowspan');
            for (let c = col; c < col + cols; c++)
                if (carry.has(c))
                    throw new Error('Пересекающиеся объединения ячеек таблицы.');
            line.push({ cell, cols, continued: false, merged: count > 1, col });
            if (count > 1)
                carry.set(col, { left: count - 1, cols, cell });
            col += cols;
        }
        continuation();
        if ([...carry.keys()].some(key => key > col))
            throw new Error('Неполная строка объединённой таблицы.');
        maxCols = Math.max(maxCols, col);
        lines.push(line);
    }
    if (carry.size)
        throw new Error('Объединение ячеек выходит за последнюю строку таблицы.');
    if (maxCols > 100)
        throw new Error('Слишком много столбцов в таблице.');
    const pageWidth = ctx.pageWidth || PAGE_WIDTH;
    const widths = Array.from({ length: maxCols }, () => Math.floor(pageWidth / maxCols));
    // Honour explicit percentage/physical widths from the first complete source row.
    const complete = lines.find(line => line.reduce((n, c) => n + c.cols, 0) === maxCols);
    for (const item of complete || []) {
        const raw = ownStyle(item.cell, ctx).width || item.cell.getAttribute('width') || '';
        const match = /^([\d.]+)%$/.exec(raw);
        const pt = points(raw);
        const w = match ? pageWidth * Number(match[1]) / 100 : pt ? pt * 20 : 0;
        if (w > 0)
            for (let c = item.col; c < item.col + item.cols; c++)
                widths[c] = Math.round(w / item.cols);
    }
    const total = widths.reduce((a, b) => a + b, 0);
    const normalized = widths.map(w => Math.round(w * pageWidth / total));
    const legacyWidth = points(table.getAttribute('border') || '');
    const legacyBorder = legacyWidth ? legacyWidth + 'pt solid #000' : undefined;
    const body = lines.map((line, index) => {
        const header = index === 0 && line.every(item => item.cell.tagName === 'TH');
        const cells = line.map(item => {
            const { cell, cols, continued, merged, col } = item;
            const s = ownStyle(cell, ctx);
            const shading = color(s['background-color'] || s.background) || (cell.tagName === 'TH' ? 'EFEFEF' : undefined);
            const width = normalized.slice(col, col + cols).reduce((a, b) => a + b, 0);
            let inner = continued ? '<w:p/>' : blocksXml(cell, { ...ctx, pageWidth: width });
            if (!inner.endsWith('</w:p>') && !inner.endsWith('<w:p/>'))
                inner += '<w:p/>';
            const borders = ['top', 'left', 'bottom', 'right'].map(edge => borderXml(edge, s, legacyBorder)).join('');
            return '<w:tc><w:tcPr><w:tcW w:w="' + width + '" w:type="dxa"/>' + (cols > 1 ? '<w:gridSpan w:val="' + cols + '"/>' : '') + (merged ? '<w:vMerge' + (continued ? '' : ' w:val="restart"') + '/>' : '') + '<w:tcBorders>' + borders + '</w:tcBorders>' + (shading ? '<w:shd w:fill="' + shading + '"/>' : '') + '<w:vAlign w:val="center"/></w:tcPr>' + inner + '</w:tc>';
        }).join('');
        return '<w:tr><w:trPr><w:cantSplit/>' + (header ? '<w:tblHeader/>' : '') + '</w:trPr>' + cells + '</w:tr>';
    }).join('');
    const borders = ['top', 'left', 'bottom', 'right'].map(edge => borderXml(edge, ownStyle(table, ctx), legacyBorder)).join('') + '<w:insideH w:val="nil"/><w:insideV w:val="nil"/>';
    return '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblLayout w:type="fixed"/><w:tblBorders>' + borders + '</w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' + normalized.map(w => '<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>' + body + '</w:tbl>';
}
function listXml(list: Element, ctx: Context): string {
    let index = Number(list.getAttribute('start') || '1');
    if (!Number.isSafeInteger(index) || Math.abs(index) > 1000000)
        throw new Error('Недопустимая нумерация списка.');
    return Array.from(list.children).filter(el => el.tagName === 'LI').map(li => {
        if (li.hasAttribute('value')) {
            index = Number(li.getAttribute('value'));
            if (!Number.isSafeInteger(index) || Math.abs(index) > 1000000)
                throw new Error('Недопустимая нумерация списка.');
        }
        const nested = Array.from(li.children).filter(x => ['UL', 'OL', 'TABLE'].includes(x.tagName));
        const main = paragraph(Array.from(li.childNodes).filter(x => !nested.includes(x as Element)), li, ctx, undefined, list.tagName === 'OL' ? (index++) + '. ' : '— ');
        return main + nested.map(child => child.tagName === 'TABLE' ? tableXml(child, ctx) : listXml(child, ctx)).join('');
    }).join('');
}
function blocksXml(root: Element, ctx: Context): string {
    const parts: string[] = [];
    let inline: Node[] = [];
    const flush = () => {
        if (inline.some(n => n.nodeType !== 3 || n.textContent?.trim()))
            parts.push(paragraph(inline, root, ctx));
        inline = [];
    };
    for (const node of Array.from(root.childNodes)) {
        if (node.nodeType !== 1) {
            inline.push(node);
            continue;
        }
        const el = node as Element, tag = el.tagName;
        if (SKIP.has(tag) || ownStyle(el, ctx).display === 'none')
            continue;
        if (!BLOCKS.has(tag)) {
            inline.push(node);
            continue;
        }
        flush();
        if (tag === 'TABLE')
            parts.push(tableXml(el, ctx));
        else if (tag === 'UL' || tag === 'OL')
            parts.push(listXml(el, ctx));
        else if (tag === 'HR')
            parts.push('<w:p/>');
        else if (Array.from(el.children).some(x => BLOCKS.has(x.tagName)))
            parts.push(blocksXml(el, ctx));
        else
            parts.push(paragraph(Array.from(el.childNodes), el, ctx, /^H[1-6]$/.test(tag) ? 'Heading' + Math.min(3, Number(tag[1])) : undefined));
    }
    flush();
    return parts.join('') || '<w:p/>';
}
function parseHtml(html: string): Document {
    validXml(html);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (doc.querySelector(UNSUPPORTED))
        throw new Error('В HTML есть элемент, который нельзя достоверно перенести в универсальный Word. Используйте исходный Word-шаблон или PDF.');
    if (doc.querySelector('link[rel="stylesheet"]'))
        throw new Error('Внешние стили не поддерживаются в универсальном Word. Используйте исходный Word-шаблон или PDF.');
    return doc;
}
function sectionXml(ctx: Context): string {
    const css = Array.from(ctx.doc.querySelectorAll('style')).map(x => x.textContent).join('\n');
    const rule = /@page\s*(?:[^{]*)\{([^{}]*)\}/i.exec(css);
    if (!rule)
        return SECTION;
    const style: Record<string, string> = {};
    cssDeclarations(rule[1], style);
    const landscape = /landscape/i.test(style.size || '');
    const width = landscape ? 16838 : 11906, height = landscape ? 11906 : 16838;
    const all = style.margin?.split(/\s+/) || [];
    const [top, right = top, bottom = top, left = right] = all;
    const values = [style['margin-top'] || top, style['margin-right'] || right, style['margin-bottom'] || bottom, style['margin-left'] || left];
    const defaults = [1134, 850, 1134, 1701];
    const margins = values.map((v, i) => v ? Math.round((points(v) ?? defaults[i] / 20) * 20) : defaults[i]);
    if (margins[1] + margins[3] > width - 2000 || margins[0] + margins[2] > height - 2000)
        throw new Error('Поля страницы оставляют слишком мало места для документа.');
    ctx.pageWidth = width - margins[1] - margins[3];
    return '<w:sectPr><w:pgSz w:w="' + width + '" w:h="' + height + '"' + (landscape ? ' w:orient="landscape"' : '') + '/><w:pgMar w:top="' + margins[0] + '" w:right="' + margins[1] + '" w:bottom="' + margins[2] + '" w:left="' + margins[3] + '" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
}
function documentXml(ctx: Context): string {
    const section = sectionXml(ctx);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>' + blocksXml(ctx.doc.body, ctx) + section + '</w:body></w:document>';
}
/** Synchronous inspection helper; images require the asynchronous full export. */
export function htmlToWordXml(html: string): string { return documentXml({ doc: parseHtml(html), pictures: new Map() }); }
function dimensions(bytes: Uint8Array): {
    type: 'png' | 'jpeg';
    width: number;
    height: number;
} {
    if (bytes.length >= 45 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte) && bytes[8] === 0 && bytes[9] === 0 && bytes[10] === 0 && bytes[11] === 13 && String.fromCharCode(...bytes.slice(12, 16)) === 'IHDR') {
        const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        return { type: 'png', width: data.getUint32(16), height: data.getUint32(20) };
    }
    if (bytes[0] === 255 && bytes[1] === 216) {
        let pos = 2;
        while (pos + 8 < bytes.length) {
            if (bytes[pos] !== 255)
                break;
            const marker = bytes[pos + 1];
            if (marker === 0xd8 || marker === 0xd9) {
                pos += 2;
                continue;
            }
            const len = bytes[pos + 2] * 256 + bytes[pos + 3];
            if (len < 2 || pos + len + 2 > bytes.length)
                break;
            if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker))
                return { type: 'jpeg', height: bytes[pos + 5] * 256 + bytes[pos + 6], width: bytes[pos + 7] * 256 + bytes[pos + 8] };
            pos += len + 2;
        }
    }
    throw new Error('Изображение подписи или печати должно быть корректным PNG или JPEG.');
}
async function imageBytes(src: string): Promise<Uint8Array> {
    const data = /^data:image\/(?:png|jpe?g);base64,([a-z\d+/=\s]+)$/i.exec(src);
    if (data) {
        if (data[1].length > 7000000)
            throw new Error('Изображение слишком большое для Word.');
        try {
            return Uint8Array.from(atob(data[1]), c => c.charCodeAt(0));
        }
        catch {
            throw new Error('Некорректное изображение в документе.');
        }
    }
    let url: URL;
    try {
        url = new URL(src, window.location.href);
    }
    catch {
        throw new Error('Некорректный адрес изображения.');
    }
    const allowed = new Set([window.location.origin]);
    try {
        allowed.add(new URL(import.meta.env.VITE_SUPABASE_URL).origin);
    }
    catch { /* unset in offline tests */ }
    if (url.protocol !== 'https:' || (!allowed.has(url.origin) && !isOwnStorageProxyImageUrl(url.href)) || url.username || url.password)
        throw new Error('Внешнее изображение не перенесено: загрузите подпись или печать в хранилище организации либо используйте PDF.');
    const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 15000);
    try {
        const response = await fetch(url.href, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: abort.signal });
        if (!response.ok)
            throw new Error('Не удалось загрузить изображение для Word.');
        const length = Number(response.headers.get('content-length') || 0);
        if (length > 5000000)
            throw new Error('Изображение слишком большое для Word.');
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > 5000000)
            throw new Error('Изображение слишком большое для Word.');
        return new Uint8Array(buffer);
    }
    finally {
        clearTimeout(timeout);
    }
}
async function buildZip(html: string): Promise<JSZip> {
    const doc = parseHtml(html), pictures = new Map<Element, Picture>(), elements = Array.from(doc.querySelectorAll('body img'));
    if (elements.length > 100)
        throw new Error('В документе слишком много изображений.');
    let total = 0;
    for (const el of elements) {
        const bytes = await imageBytes(el.getAttribute('src') || '');
        total += bytes.length;
        if (total > 20000000)
            throw new Error('Изображения документа превышают 20 МБ.');
        const size = dimensions(bytes);
        if (size.width < 1 || size.height < 1 || size.width > 20000 || size.height > 20000)
            throw new Error('Недопустимый размер изображения.');
        const index = pictures.size + 2;
        pictures.set(el, { ...size, bytes, id: 'rId' + index, name: 'image' + index + '.' + size.type });
    }
    const zip = new JSZip();
    let contentTypes = CONTENT_TYPES;
    for (const type of new Set([...pictures.values()].map(x => x.type)))
        contentTypes = contentTypes.replace('</Types>', '<Default Extension="' + type + '" ContentType="image/' + type + '"/></Types>');
    zip.file('[Content_Types].xml', contentTypes);
    zip.file('_rels/.rels', RELS);
    zip.file('word/document.xml', documentXml({ doc, pictures }));
    zip.file('word/styles.xml', STYLES);
    let rels = DOC_RELS;
    for (const pic of pictures.values()) {
        zip.file('word/media/' + pic.name, pic.bytes);
        rels = rels.replace('</Relationships>', '<Relationship Id="' + pic.id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + pic.name + '"/></Relationships>');
    }
    zip.file('word/_rels/document.xml.rels', rels);
    return zip;
}
export async function htmlToDocxBlob(html: string): Promise<Blob> {
    const current = captureDocumentOutputFence();
    current();
    const zip = await buildZip(html);
    current();
    const blob = await zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME });
    current();
    blobFences.set(blob, current);
    return blob;
}
export function sanitizeFileName(name: string, ext: string): string {
    const base = (name || 'document').normalize('NFC').replace(/[\x00-\x1f\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 80) || 'document';
    return base + '.' + ext;
}
export async function htmlDocsToZipBlob(docs: Array<{
    name: string;
    html: string;
}>): Promise<Blob> {
    const current = captureDocumentOutputFence();
    current();
    const zip = new JSZip(), used = new Set<string>();
    for (const doc of docs) {
        const base = sanitizeFileName(doc.name, 'docx').slice(0, -5);
        let fileName = base + '.docx', index = 2;
        while (used.has(fileName.toLocaleLowerCase('ru-RU'))) {
            const suffix = ' (' + (index++) + ')';
            fileName = base.slice(0, 80 - suffix.length) + suffix + '.docx';
        }
        used.add(fileName.toLocaleLowerCase('ru-RU'));
        zip.file(fileName, await (await buildZip(doc.html)).generateAsync({ type: 'uint8array' }));
    }
    current();
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
    current();
    blobFences.set(blob, current);
    return blob;
}
export function downloadBlob(blob: Blob, fileName: string): void {
    blobFences.get(blob)?.();
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    let clicked = false;
    try {
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        clicked = true;
    }
    finally {
        anchor.remove();
        if (clicked)
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        else
            URL.revokeObjectURL(url);
    }
}
