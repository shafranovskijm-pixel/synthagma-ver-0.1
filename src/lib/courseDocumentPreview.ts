/** Classify a locator before choosing a viewer. Private/signed links never become external viewer parameters. */
export type CourseDocumentPreview = {mode:'native_pdf'|'public_office'|'direct_only'|'unavailable'; sourceUrl:string|null; previewUrl:string|null};
const office = new Set(['doc','docx','xls','xlsx','ppt','pptx']);
export function courseDocumentPreview(input:string,type:string|null,platformBases:readonly string[],pageOrigin:string):CourseDocumentPreview {
 const unavailable:CourseDocumentPreview={mode:'unavailable',sourceUrl:null,previewUrl:null};
 if(!input||/[\u0000-\u0020\u007f\\]/.test(input))return unavailable;
 let url:URL;try{url=new URL(input,pageOrigin);}catch{return unavailable;}
 if(url.username||url.password||!['https:','blob:'].includes(url.protocol))return unavailable;
 if(url.protocol==='blob:'&&url.origin!==pageOrigin)return unavailable;
 const extension=(type??'').toLowerCase();
 if(extension==='pdf')return{mode:'native_pdf',sourceUrl:url.href,previewUrl:url.href};
 if(!office.has(extension))return{mode:'direct_only',sourceUrl:url.href,previewUrl:null};
 const allowed=new Set(platformBases.flatMap(base=>{try{const u=new URL(base);return u.protocol==='https:'&&!u.username&&!u.password?[u.origin]:[];}catch{return[];}}));
 let decoded:string;try{decoded=decodeURIComponent(url.pathname);}catch{return unavailable;}
 const publicCourse=url.protocol==='https:'&&allowed.has(url.origin)&&!url.search&&!url.hash&&
  !/[\u0000-\u0020\u007f%\\]/.test(decoded)&&!decoded.split('/').some(part=>part==='.'||part==='..')&&
  /^(?:\/storage\/v1|\/sb-storage)\/object\/public\/course-files\/[^/]+\/.+/.test(decoded);
 if(publicCourse)return{mode:'public_office',sourceUrl:url.href,previewUrl:'https://view.officeapps.live.com/op/embed.aspx?src='+encodeURIComponent(url.href)};
 return{mode:'direct_only',sourceUrl:url.href,previewUrl:null};
}
