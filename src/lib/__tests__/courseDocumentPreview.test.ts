// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {courseDocumentPreview as preview} from '../courseDocumentPreview';
const site='https://school.invalid',api='https://api.school.invalid',bases=[api,site];
const signed=api+'/sb-storage/object/sign/org-documents/org/file?token=SYNTHETIC_PRIVATE_TOKEN';
const publicCourse=api+'/storage/v1/object/public/course-files/course/documents/synthetic.docx';
describe('UC027 course locator classification before any external viewer',()=>{
 it('keeps a private signed PDF in the browser and never encodes it into Google or Microsoft URLs',()=>{const p=preview(signed,'pdf',bases,site);expect(p).toEqual({mode:'native_pdf',sourceUrl:signed,previewUrl:signed});expect(p.previewUrl).not.toMatch(/google|officeapps/);});
 it('uses direct-only access for private signed Office documents',()=>{expect(preview(signed,'docx',bases,site)).toEqual({mode:'direct_only',sourceUrl:signed,previewUrl:null});});
 it('preserves preview for exact known public course-files Office assets',()=>{const p=preview(publicCourse,'docx',bases,site);expect(p.mode).toBe('public_office');expect(new URL(p.previewUrl!).searchParams.get('src')).toBe(publicCourse);});
 it('does not treat another host or another public bucket as approved course assets',()=>{for(const url of[publicCourse.replace(api,'https://other.invalid'),publicCourse.replace('/course-files/','/org-documents/')])expect(preview(url,'docx',bases,site).previewUrl).toBeNull();});
 it('does not forward any query or fragment even under the known public bucket',()=>{for(const suffix of['?token=SYNTHETIC_PRIVATE_TOKEN','?download=1','#capability'])expect(preview(publicCourse+suffix,'docx',bases,site).previewUrl).toBeNull();});
 it('closes script/data/http/userinfo URLs instead of mounting them into a frame',()=>{for(const url of['javascript:alert(1)','data:text/html,SYNTHETIC','http://school.invalid/f.pdf','https://name:secret@school.invalid/f.pdf'])expect(preview(url,'pdf',bases,site).mode).toBe('unavailable');});
 it('only accepts Blob PDF locators from the current page origin',()=>{expect(preview('blob:'+site+'/synthetic','pdf',bases,site).mode).toBe('native_pdf');expect(preview('blob:https://other.invalid/synthetic','pdf',bases,site).mode).toBe('unavailable');});
 it('never promotes malformed, nested-encoded or control-character paths to external Office preview',()=>{for(const path of['%','%00secret','%252e%252e%252fprivate','%5cprivate'])expect(preview(publicCourse.replace('synthetic.docx',path),'docx',bases,site).mode).not.toBe('public_office');});
});

import {createElement,useMemo} from 'react';
import {afterEach,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {FilePreviewDialog} from '../../components/course-learning/FilePreviewDialog';
import {DocumentBlock} from '../../components/course-builder/block-editor/blocks/media/DocumentBlock';
const fixture=vi.hoisted(()=>({actor:'00000000-0000-4000-8000-000000000001',read:vi.fn(),refresh:vi.fn()}));
// These component cases are explicitly legacy. Protocol/rights/frozen-byte
// decisions are tested separately; no live Auth or source locator is consulted.
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:fixture.actor}})}));
vi.mock('@/utils/courseCache',()=>({captureOfflineAuthRevision:()=>1,captureOfflineContext:()=>({actorId:fixture.actor,revision:1}),subscribeOfflineAuthRevision:()=>()=>{}}));
vi.mock('@/hooks/useCourseFileDeliveryMode',()=>({useCourseFileDeliveryMode:()=>({view:{state:'legacy',context:legacyMode},refresh:vi.fn()})}));
vi.mock('@/hooks/useCourseExactFileDelivery',()=>({useCourseExactFileDelivery:(scope:any)=>{
 fixture.read(scope);const context=useMemo(()=>({schema_version:1,actor_id:fixture.actor,organization_id:scope.organizationId,course_id:scope.courseId,reference_kind:scope.referenceKind,reference_id:scope.referenceId,access_mode:scope.accessMode,purpose:scope.purpose,mode:'legacy',state:'legacy',binding:null}),[JSON.stringify(scope)]);
 return{view:{state:'legacy',context},refresh:fixture.refresh};
}}));
const legacyMode={schema_version:1,actor_id:fixture.actor,organization_id:'00000000-0000-4000-8000-000000000002',course_id:'00000000-0000-4000-8000-000000000003',access_mode:'learner',mode:'legacy',state:'legacy',cohort:null};
const selected={courseId:legacyMode.course_id,organizationId:legacyMode.organization_id,referenceKind:'course_document' as const,referenceId:'00000000-0000-4000-8000-000000000004',name:'Synthetic.pdf',fileType:'pdf',legacyUrl:signed};
const boundProps={open:true,onOpenChange:()=>{},reference:selected,accessMode:'learner' as const,allowDownload:true};
vi.mock('../../components/ui/dialog',async()=>{const {createElement}=await import('react');const wrap=({children}:{children:import('react').ReactNode})=>createElement('div',null,children);return{Dialog:wrap,DialogContent:wrap,DialogHeader:wrap,DialogTitle:wrap};});
vi.mock('../../components/course-builder/LazyMediaPreview',async()=>{const {createElement}=await import('react');return{LazyMediaPreview:({children}:{children:import('react').ReactNode})=>createElement('div',null,children)};});
afterEach(()=>{cleanup();vi.restoreAllMocks();fixture.read.mockClear();fixture.refresh.mockClear();});
describe('UC027 real course component binds classified preview rather than raw external viewer URL',()=>{
 it('student dialog keeps a private Word locator out of every iframe and reauthorizes direct access',async()=>{
  const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  render(createElement(FilePreviewDialog,{...boundProps,reference:{...selected,name:'Synthetic.docx',fileType:'docx'}}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Открыть файл'})).toBeTruthy());
  expect(document.querySelector('iframe')).toBeNull();expect(screen.getByRole('button',{name:'Открыть файл'}).getAttribute('href')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Открыть файл'}));await waitFor(()=>expect(click).toHaveBeenCalledTimes(1));
  expect(fixture.read.mock.calls.some(call=>call[0].purpose==='download')).toBe(true);
  expect((click.mock.contexts[0] as HTMLAnchorElement).href).toBe(signed);
 });
 it('student dialog uses the original PDF URL and provides fresh-authority fallback after frame failure, resetting for a new source',async()=>{
  const view=render(createElement(FilePreviewDialog,boundProps));const frame=await screen.findByTitle('Synthetic.pdf');
  expect(frame.getAttribute('src')).toBe(signed);expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');expect(frame.getAttribute('sandbox')).toBe('');
  fireEvent.error(frame);expect(document.querySelector('iframe')).toBeNull();expect(screen.getByRole('button',{name:'Открыть файл'}).getAttribute('href')).toBeNull();
  view.rerender(createElement(FilePreviewDialog,{...boundProps,reference:{...selected,legacyUrl:signed+'&v=2'}}));
  await waitFor(()=>expect(screen.getByTitle('Synthetic.pdf').getAttribute('src')).toBe(signed+'&v=2'));
 });
 it('builder also leaves a private Word locator as a direct file link and renders no external viewer',()=>{
  const block={id:'synthetic-doc',type:'document',documentUrl:signed,documentName:'Synthetic.docx'}as Parameters<typeof DocumentBlock>[0]['block'];
  const view=render(createElement(DocumentBlock,{block,onUpdate:vi.fn()}));expect(document.querySelector('iframe')).toBeNull();expect(screen.getByRole('link',{name:'Скачать'}).getAttribute('href')).toBe(signed);
  view.rerender(createElement(DocumentBlock,{block:{...block,documentName:'Synthetic.pdf'},onUpdate:vi.fn()}));expect(screen.getByTitle('Synthetic.pdf').getAttribute('sandbox')).toBe('allow-downloads');expect(screen.getByRole('link',{name:'Скачать'}).getAttribute('href')).toBe(signed);
 });
});
