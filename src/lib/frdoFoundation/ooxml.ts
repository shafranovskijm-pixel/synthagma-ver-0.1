import {OFFICIAL_TEMPLATES} from './officialMetadata.ts';
import {nativeDefinition} from './dictionaries.ts';
import {BOUNDS,decodeUtf8,FrdoFoundationError,refuse,utf8} from './hash.ts';
import type {OfficialCell,Stream} from './types.ts';
import {browserXmlRuntime,type XmlDocument,type XmlElement,type XmlRuntime} from './xmlRuntime.ts';
const main='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
export function parseXml(bytes:Uint8Array,runtime:XmlRuntime=browserXmlRuntime):XmlDocument&{readonly documentElement:XmlElement}{const text=decodeUtf8(bytes,BOUNDS.xmlBytes);if(/<!DOCTYPE|<!ENTITY/i.test(text))return refuse();let doc:XmlDocument;try{doc=runtime.parse(text);}catch(cause){return refuse(cause instanceof FrdoFoundationError&&cause.code==='DEPENDENCY_UNAVAILABLE'?'DEPENDENCY_UNAVAILABLE':'INVALID_WORKBOOK');}if(!doc?.documentElement||doc.getElementsByTagName('parsererror').length||doc.documentElement.localName==='parsererror')return refuse();return doc as XmlDocument&{readonly documentElement:XmlElement};}
export const elements=(node:XmlDocument|XmlElement,name:string):XmlElement[]=>Array.from(node.getElementsByTagNameNS(main,name));
function direct(node:XmlElement,name:string):XmlElement[]{return Array.from(node.children).filter(e=>e.namespaceURI===main&&e.localName===name);}
export function sharedStrings(parts:ReadonlyMap<string,Uint8Array>,runtime:XmlRuntime=browserXmlRuntime):string[]{const raw=parts.get('xl/sharedStrings.xml');if(!raw)return refuse();const doc=parseXml(raw,runtime);return elements(doc,'si').map(si=>elements(si,'t').map(t=>t.textContent??'').join(''));}
export function cellValue(cell:XmlElement,strings:readonly string[]):OfficialCell{
 if(direct(cell,'f').length)return refuse();const type=cell.getAttribute('t'),v=direct(cell,'v'),is=direct(cell,'is');
 if(type==='s'){if(v.length!==1||is.length)return refuse();const raw=v[0].textContent??'';if(!/^\d+$/.test(raw))return refuse();const value=strings[Number(raw)];if(value===undefined)return refuse();return value;}
 if(type==='inlineStr'){if(v.length||is.length!==1)return refuse();return elements(is[0],'t').map(t=>t.textContent??'').join('');}
 if(type!==null&&type!=='n')return refuse();if(is.length||v.length>1)return refuse();if(!v.length)return null;
 const text=v[0].textContent??'';if(!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text))return refuse();const n=Number(text);if(!Number.isFinite(n))return refuse();return n;
}
export function cellGrid(doc:XmlDocument,strings:readonly string[]):Map<string,OfficialCell>{const result=new Map<string,OfficialCell>();for(const cell of elements(doc,'c')){const ref=cell.getAttribute('r');if(!ref||!/^\$?[A-Z]{1,3}\$?[1-9]\d*$/.test(ref)||result.has(ref))return refuse();result.set(ref,cellValue(cell,strings));}return result;}
export function columnNumber(name:string):number{let value=0;for(const ch of name)value=value*26+ch.charCodeAt(0)-64;return value;}
export function columnLetter(index:number):string{let text='';for(let n=index;n>0;n=Math.floor((n-1)/26))text=String.fromCharCode(65+(n-1)%26)+text;return text;}
/** Independently read every named native dictionary, including the structured table
 * reference with its significant leading-space header. No dictionary is rewritten. */
export interface VerifiedPublicDonorStructure{sheet:XmlDocument;styles:XmlDocument;strings:readonly string[];}
export function verifyNativeStructure(parts:ReadonlyMap<string,Uint8Array>,stream:Stream,runtime:XmlRuntime=browserXmlRuntime):VerifiedPublicDonorStructure{
 const required=(path:string)=>{const raw=parts.get(path);if(!raw)return refuse();return raw;};
 const strings=sharedStrings(parts,runtime),sheet=parseXml(required(OFFICIAL_TEMPLATES[stream].sheet_path),runtime);
 if(elements(sheet,'dimension').length!==1||elements(sheet,'dimension')[0].getAttribute('ref')!==OFFICIAL_TEMPLATES[stream].native_dimension||elements(sheet,'hyperlink').length)return refuse();
 // The exact donor SHA and all part hashes already pin every untouched data row.
 // Native structure needs header values, not a map of all40000 pre-styled blanks.
 const header=elements(sheet,'row')[0];if(!header||header.getAttribute('r')!=='1')return refuse('TEMPLATE_CHANGED');const headerCells=direct(header,'c');if(headerCells.length!==OFFICIAL_TEMPLATES[stream].column_count)return refuse('TEMPLATE_CHANGED');
 OFFICIAL_TEMPLATES[stream].columns.forEach((col,index)=>{const cell=headerCells[index];if(cell.getAttribute('r')!==col.letter+'1'||cellValue(cell,strings)!==col.header)return refuse('TEMPLATE_CHANGED');});
 const workbook=parseXml(required('xl/workbook.xml'),runtime),names=new Map<string,string>();for(const entry of elements(workbook,'definedName')){const name=entry.getAttribute('name');if(!name||names.has(name))return refuse();names.set(name,entry.textContent??'');}
 const validationGrid=cellGrid(parseXml(required('xl/worksheets/sheet2.xml'),runtime),strings),table=parseXml(required('xl/tables/table1.xml'),runtime);
 const dictionaries=nativeDefinition(stream).dictionaries as unknown as Record<string,{reference:string;values:readonly(string|number)[]}>;
 for(const [name,data]of Object.entries(dictionaries)){
  if(names.get(name)!==data.reference)return refuse('TEMPLATE_CHANGED');let values:OfficialCell[]=[];
  const range=/^'?Проверки'?!(\$[A-Z]{1,3})\$(\d+):\1\$(\d+)$/.exec(data.reference);
  if(range){const start=Number(range[2]),end=Number(range[3]),col=range[1].slice(1);if(end<start||end-start>10000)return refuse();for(let row=start;row<=end;row++)values.push(validationGrid.get(col+row)??null);}
  else{
   const structured=/^([^\[]+)\[\[(.*)\]\]$/.exec(data.reference),root=table.documentElement;
   if(!structured||root.getAttribute('displayName')!==structured[1])return refuse();const columns=elements(table,'tableColumn'),index=columns.findIndex(col=>col.getAttribute('name')===structured[2]),ref=/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(root.getAttribute('ref')??'');
   if(index<0||!ref)return refuse();const col=columnLetter(columnNumber(ref[1])+index);for(let row=Number(ref[2])+1;row<=Number(ref[4]);row++)values.push(validationGrid.get(col+row)??null);
  }
  if(values.length!==data.values.length||values.some((v,i)=>v!==data.values[i]))return refuse('TEMPLATE_CHANGED');
 }
 return {sheet,strings,styles:parseXml(required('xl/styles.xml'),runtime)};
}
function escapeXml(value:string):string{utf8(value,BOUNDS.cellBytes);if(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(value))return refuse('INVALID_REQUEST');return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
/** Exact donor row surgery: existing styles/row attributes, headers, validations,
 * unused rows, named ranges, relationships and all non-target bytes stay intact. */
export function fillTargetRows(donor:string,stream:Stream,rows:readonly(readonly OfficialCell[])[]):string{
 if(rows.length<1||rows.length>BOUNDS.rows)return refuse('LIMIT_EXCEEDED');const metadata=OFFICIAL_TEMPLATES[stream];let seen=0;
 const result=donor.replace(/<row\b[^>]*\br="(\d+)"[^>]*>[^]*?<\/row>/g,(row:string,number:string)=>{const n=Number(number);if(n<2||n>rows.length+1)return row;const values=rows[n-2];if(values.length!==metadata.column_count||values[values.length-1]!==null)return refuse('INVALID_REQUEST');seen++;let cellCount=0;
  const next=row.replace(/<c\b([^>]*\br="([A-Z]+)(\d+)"[^>]*)\/>/g,(whole:string,attrs:string,letter:string,rowNumber:string)=>{if(Number(rowNumber)!==n||columnNumber(letter)!==++cellCount)return refuse('TEMPLATE_CHANGED');const value=values[cellCount-1];if(/\bt=|\bf=/.test(attrs))return refuse('TEMPLATE_CHANGED');if(value===null)return whole;if(typeof value==='number'){if(!Number.isSafeInteger(value)||value<0)return refuse('INVALID_REQUEST');return '<c'+attrs+' t="n"><v>'+value+'</v></c>';}return '<c'+attrs+' t="inlineStr"><is><t xml:space="preserve">'+escapeXml(value)+'</t></is></c>';});
  if(cellCount!==metadata.column_count)return refuse('TEMPLATE_CHANGED');return next;
 });if(seen!==rows.length)return refuse('TEMPLATE_CHANGED');utf8(result,BOUNDS.xmlBytes);return result;
}
/** A second XML reader checks exact order, literal types, styles and every value;
 * passing string replacement alone is not a readback proof. */
export function verifyWrittenCells(output:XmlDocument,donor:XmlDocument,stream:Stream,rows:readonly(readonly OfficialCell[])[],strings:readonly string[],styles:XmlDocument):void{
 const outRows=elements(output,'row'),oldRows=elements(donor,'row'),metadata=OFFICIAL_TEMPLATES[stream];if(outRows.length!==oldRows.length||elements(output,'f').length||elements(output,'hyperlink').length)return refuse();
 const xfs=elements(styles,'cellXfs');if(xfs.length!==1)return refuse();const styleList=direct(xfs[0],'xf');
 rows.forEach((values,index)=>{const n=index+2,out=outRows[index+1],old=oldRows[index+1];if(out.getAttribute('r')!==String(n)||old.getAttribute('r')!==String(n))return refuse();const cells=direct(out,'c'),oldCells=direct(old,'c');if(cells.length!==metadata.column_count||oldCells.length!==metadata.column_count)return refuse();cells.forEach((cell,col)=>{
  if(cell.getAttribute('r')!==metadata.columns[col].letter+n||cell.getAttribute('s')!==oldCells[col].getAttribute('s')||cellValue(cell,strings)!==values[col])return refuse();
  const value=values[col],type=cell.getAttribute('t');if(value!==null&&type!==(typeof value==='number'?'n':'inlineStr'))return refuse();
  if(value!==null&&metadata.date_columns.includes(col+1 as never)){const style=Number(cell.getAttribute('s'));if(styleList[style]?.getAttribute('numFmtId')!=='14')return refuse('TEMPLATE_CHANGED');}
 });if(cellValue(cells[cells.length-1],strings)!==null)return refuse();});
}
