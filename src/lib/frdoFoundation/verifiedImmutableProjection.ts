import { BOUNDS, refuse, utf8 } from './hash';
/** Byte-preserving semantic windows for already SHA-pinned immutable template parts.
 * Not an XML parser or a source-authority check. The caller must validate the whole
 * donor and all original part hashes before this known native-edition index is used.
 * Every indexed element is still read by the unchanged namespace-aware XML parser. */
export const PINNED_IMMUTABLE_WINDOW=32;
const qualified=(name:string)=>'(?:[A-Za-z_][A-Za-z0-9_.-]*:)?'+name;
export function indexPinnedImmutableElements(text:string,container:'sst'|'sheetData',item:'si'|'row'){
 utf8(text,BOUNDS.xmlBytes);
 // A different XML grammar cannot silently become a projection of this pinned edition.
 if(/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(text))return refuse();
 const opening=new RegExp('<('+qualified(container)+')\\b[^>]*>','g'),opens=[...text.matchAll(opening)];
 if(opens.length!==1)return refuse();const open=opens[0],start=open.index!+open[0].length;
 if(open[0].endsWith('/>')){
  return {count:0,project(first=0,count=0){if(first!==0||count!==0)return refuse();return text;}};
 }
 const closing='</'+open[1]+'>',end=text.indexOf(closing,start);
 if(end<start||text.indexOf(closing,end+closing.length)!==-1)return refuse();
 const body=text.slice(start,end),pattern=new RegExp('<('+qualified(item)+')\\b[^>]*?(?:\\/>|>[\\s\\S]*?<\\/\\1>)','g'),spans:{start:number;end:number}[]=[];
 let cursor=0;
 for(const value of body.matchAll(pattern)){
  const at=value.index!;if(!/^[\t\r\n ]*$/.test(body.slice(cursor,at)))return refuse();
  spans.push({start:start+at,end:start+at+value[0].length});cursor=at+value[0].length;
 }
 if(!/^[\t\r\n ]*$/.test(body.slice(cursor)))return refuse();
 const prefix=text.slice(0,start),suffix=text.slice(end);
 return {count:spans.length,project(first=0,count=Math.min(PINNED_IMMUTABLE_WINDOW,spans.length)){
  if(!Number.isSafeInteger(first)||!Number.isSafeInteger(count)||first<0||count<0||count>PINNED_IMMUTABLE_WINDOW||first+count>spans.length||count===0&&spans.length!==0)return refuse();
  return prefix+(count===0?'':text.slice(spans[first].start,spans[first+count-1].end))+suffix;
 }};
}
