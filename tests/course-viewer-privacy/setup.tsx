import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi, expect } from 'vitest';
import { cleanup } from '@testing-library/react';
const ports = vi.hoisted(() => ({ queries: [] as any[], rows: {} as Record<string, any>, preview: {} as any, writes: 0, network: 0, proxy: 0 }));
export { ports };
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from(table: string) { if(table!=='course_documents') throw Error('UNEXPECTED_TABLE'); let course=''; ports.queries.push({table}); return {
    select(columns: string) { ports.queries.at(-1).columns=columns; return this; },
    eq(key:string,value:string) { if(key!=='course_id')throw Error('UNSCOPED_QUERY');course=value;ports.queries.at(-1).course=value;return this; },
    order(key:string, options:any) { ports.queries.at(-1).order=[key,options]; const row=ports.rows[course];return Promise.resolve(typeof row==='function'?row():{data:row??[],error:null}); },
    insert(){ports.writes++;throw Error('NO_WRITE');},delete(){ports.writes++;throw Error('NO_WRITE');}
  }; }, storage: new Proxy({}, {get(){ports.writes++;throw Error('NO_STORAGE');}})
} }));
vi.mock('@/hooks/useCoursePreview',()=>({useCoursePreview:()=>ports.preview}));
vi.mock('@/components/course-builder/LazyMediaPreview',()=>({LazyMediaPreview:({children}:any)=><div>{children}</div>}));
vi.mock('@/components/course-builder/PptxPickerDialog',()=>({PptxPickerDialog:()=>null}));
vi.mock('@/components/course-builder/VideoPreviewInline',()=>({VideoPreviewInline:()=>null}));
vi.mock('@/mobile/NativeWebMaterial',()=>({NativeWebMaterial:()=>null}));
vi.mock('@/components/course-builder/block-editor/FormulaRender',()=>({FormulaRender:()=>null}));
vi.mock('@/components/course-builder/block-editor',()=>({BlockRenderer:()=>null,parseLessonContent:()=>[]}));
vi.mock('@/utils/proxyFetch',()=>({proxiedAssetUrl:(url:string)=>{ports.proxy++;return url;}}));
vi.mock('@/components/ui/scroll-area',()=>({ScrollArea:React.forwardRef(({children,...props}:any,ref:any)=><div {...props} ref={ref}>{children}</div>)}));
vi.mock('@/components/ui/dialog',()=>({
 Dialog:({open,children}:any)=>open?<div role="dialog">{children}</div>:null,
 DialogContent:({children}:any)=><div>{children}</div>,DialogHeader:({children}:any)=><header>{children}</header>,
 DialogTitle:({children}:any)=><h2>{children}</h2>,DialogDescription:({children}:any)=><p>{children}</p>,DialogTrigger:({children}:any)=><>{children}</>
}));
beforeEach(()=>{ports.queries=[];ports.rows={};ports.preview={};ports.writes=0;ports.network=0;ports.proxy=0;vi.stubGlobal('fetch',vi.fn(()=>{ports.network++;throw Error('NO_NETWORK');}));});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();expect(ports.writes).toBe(0);expect(ports.network).toBe(0);});
