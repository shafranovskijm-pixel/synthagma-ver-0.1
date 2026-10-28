import React, { useMemo } from 'react';
const auth = vi.hoisted(() => ({ id: '00000000-0000-4000-8000-000000000001' }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: auth.id } }) }));
vi.mock('@/utils/courseCache', () => ({ captureOfflineAuthRevision: () => 1, captureOfflineContext: () => ({ actorId: auth.id, revision: 1 }), subscribeOfflineAuthRevision: () => () => {} }));
vi.mock('@/hooks/useCourseFileDeliveryMode', () => ({ useCourseFileDeliveryMode: () => ({ view: { state: 'legacy', context: modeContext }, refresh: vi.fn() }) }));
vi.mock('@/hooks/useCourseExactFileDelivery', () => ({ useCourseExactFileDelivery: (scope: any) => ({ view: useMemo(() => ({ state: 'legacy', context: { schema_version: 1, actor_id: auth.id, organization_id: scope.organizationId, course_id: scope.courseId, reference_kind: scope.referenceKind, reference_id: scope.referenceId, access_mode: scope.accessMode, purpose: scope.purpose, mode: 'legacy', state: 'legacy', binding: null } }), [JSON.stringify(scope)]), refresh: vi.fn() }) }));
const modeContext = { schema_version: 1, actor_id: auth.id, organization_id: '00000000-0000-4000-8000-000000000002', course_id: '00000000-0000-4000-8000-000000000003', access_mode: 'learner', mode: 'legacy', state: 'legacy', cohort: null };
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import {FilePreviewDialog} from '@/components/course-learning/FilePreviewDialog';
const privateA='https://api.xn--80aaiswd0ak.xn--p1ai/sb-storage/object/sign/org-documents/QA_ONLY/A.pdf?token=NON_SECRET_TEST_TOKEN';
const privateB='https://api.xn--80aaiswd0ak.xn--p1ai/sb-storage/object/sign/org-documents/QA_ONLY/B.pdf?token=NON_SECRET_TEST_TOKEN';
const publicOffice='https://platform.example/storage/v1/object/public/course-files/QA_ONLY/example.docx';
const props={open:true,onOpenChange:()=>{},reference:{courseId:modeContext.course_id,organizationId:modeContext.organization_id,referenceKind:'course_document' as const,referenceId:'00000000-0000-4000-8000-000000000004',legacyUrl:privateA,name:'QA-A.pdf',fileType:'pdf'},accessMode:'learner' as const,allowDownload:true};
const advance=(ms:number)=>act(()=>{vi.advanceTimersByTime(ms);});
const noVendor=()=>{for(const frame of document.querySelectorAll('iframe'))expect(frame.getAttribute('src')).not.toMatch(/officeapps|docs\.google|gview/i);expect(fetch).not.toHaveBeenCalled();};
const spinner=()=>screen.queryByText('Загрузка предпросмотра…');
describe('bounded original-file preview wait',()=>{
 it('FT01 hanging private PDF reaches original-only manual fallback at15seconds with native iframe protections intact',()=>{
  render(<FilePreviewDialog {...props}/>);
  const frame=screen.getByTitle('QA-A.pdf');
  expect(frame.getAttribute('src')).toBe(privateA);
  expect(frame.getAttribute('sandbox')).toBe('');
  expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
  expect(screen.getByRole('button',{name:'Скачать'})).not.toHaveAttribute('href');
  advance(14999);expect(spinner()).toBeInTheDocument();expect(document.querySelector('iframe')).not.toBeNull();
  advance(1);expect(spinner()).toBeNull();expect(document.querySelector('iframe')).toBeNull();
  expect(screen.getByRole('button',{name:'Открыть файл'})).not.toHaveAttribute('href');
  expect(vi.getTimerCount()).toBe(0);noVendor();
 });
 it('FT02 successful current load clears the timer and keeps the PDF frame beyond the deadline',()=>{
  render(<FilePreviewDialog {...props}/>);advance(1000);fireEvent.load(screen.getByTitle('QA-A.pdf'));
  expect(spinner()).toBeNull();expect(vi.getTimerCount()).toBe(0);advance(30000);
  expect(screen.getByTitle('QA-A.pdf').getAttribute('src')).toBe(privateA);expect(screen.queryByRole('button',{name:'Открыть файл'})).toBeNull();noVendor();
 });
 it('FT03 current frame error immediately keeps original fallback and clears the deadline',()=>{
  render(<FilePreviewDialog {...props}/>);advance(1000);fireEvent.error(screen.getByTitle('QA-A.pdf'));
  expect(spinner()).toBeNull();expect(document.querySelector('iframe')).toBeNull();expect(screen.getByRole('button',{name:'Открыть файл'})).not.toHaveAttribute('href');expect(vi.getTimerCount()).toBe(0);advance(30000);noVendor();
 });
 it('FT04 URL name and type changes isolate old timer and old iframe events from each new file lifecycle',()=>{
  for(const change of [{legacyUrl:privateB},{name:'QA-renamed.pdf'},{fileType:'PDF'}]){
   const timerSpy=vi.spyOn(globalThis,'setTimeout');const view=render(<FilePreviewDialog {...props}/>);const oldFrame=screen.getByTitle('QA-A.pdf');
   const oldTimer=timerSpy.mock.calls.find(row=>row[1]===15000)?.[0];expect(typeof oldTimer).toBe('function');advance(10000);
   const next={...props,reference:{...props.reference,...change}};view.rerender(<FilePreviewDialog {...next}/>);
   act(()=>{(oldTimer as ()=>void)();});fireEvent.load(oldFrame);fireEvent.error(oldFrame);
   expect(spinner()).toBeInTheDocument();expect(screen.getByTitle(next.reference.name).getAttribute('src')).toBe(next.reference.legacyUrl);expect(vi.getTimerCount()).toBe(1);
   advance(14999);expect(spinner()).toBeInTheDocument();advance(1);
   expect(screen.getByRole('button',{name:'Открыть файл'})).not.toHaveAttribute('href');expect(document.querySelector('iframe')).toBeNull();noVendor();
   cleanup();timerSpy.mockRestore();vi.clearAllTimers();
  }
 });
 it('FT05 close cancels pending work and old callbacks cannot consume a reopened deadline; unmount clears it',()=>{
  const timerSpy=vi.spyOn(globalThis,'setTimeout');const view=render(<FilePreviewDialog {...props}/>);
  const oldTimer=timerSpy.mock.calls.find(row=>row[1]===15000)?.[0];expect(typeof oldTimer).toBe('function');advance(10000);
  view.rerender(<FilePreviewDialog {...props} open={false}/>);expect(screen.queryByRole('dialog')).toBeNull();expect(vi.getTimerCount()).toBe(0);
  view.rerender(<FilePreviewDialog {...props}/>);act(()=>{(oldTimer as ()=>void)();});advance(14999);
  expect(spinner()).toBeInTheDocument();expect(screen.getByTitle('QA-A.pdf').getAttribute('src')).toBe(privateA);expect(vi.getTimerCount()).toBe(1);
  view.unmount();expect(vi.getTimerCount()).toBe(0);advance(30000);expect(document.querySelector('iframe')).toBeNull();noVendor();
 });
 it('FT06 download prohibition hides every direct link after PDF timeout and for private Office fallback',()=>{
  const view=render(<FilePreviewDialog {...props} allowDownload={false}/>);expect(screen.queryAllByRole('link')).toHaveLength(0);advance(15000);
  expect(document.querySelector('iframe')).toBeNull();expect(screen.queryAllByRole('link')).toHaveLength(0);
  view.rerender(<FilePreviewDialog {...props} reference={{...props.reference,legacyUrl:privateA.replace('A.pdf','private.docx'),name:'QA-private.docx',fileType:'docx'}} allowDownload={false}/>);
  expect(document.querySelector('iframe')).toBeNull();expect(screen.queryAllByRole('link')).toHaveLength(0);expect(vi.getTimerCount()).toBe(0);noVendor();
 });
 it('FT07 validated public Office preview remains available but timeout never switches to another vendor',()=>{
  render(<FilePreviewDialog {...props} reference={{...props.reference,legacyUrl:publicOffice,name:'QA-public.docx',fileType:'docx'}}/>);
  const frame=screen.getByTitle('QA-public.docx');expect(frame.getAttribute('src')).toContain('view.officeapps.live.com');expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');expect(frame).not.toHaveAttribute('sandbox');
  advance(15000);expect(document.querySelector('iframe')).toBeNull();expect(screen.getByRole('button',{name:'Открыть файл'})).not.toHaveAttribute('href');expect(screen.getByRole('button',{name:'Скачать'})).not.toHaveAttribute('href');expect(vi.getTimerCount()).toBe(0);expect(fetch).not.toHaveBeenCalled();
 });
});
