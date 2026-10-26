import { beforeEach, describe, expect, it } from 'vitest';
import { fetchPublicCatalogPage, loadPublicCourseCatalog } from '../../src/lib/publicCourseCatalog';
import { MARKETPLACE_ORG_ID } from '../../src/constants/marketplace';
import { publicCatalogPort } from './public-catalog.port';
const row = () => ({ id:'10000000-0000-4000-8000-000000000011',course_id:'10000000-0000-4000-8000-000000000012',description_short:null,course:{id:'10000000-0000-4000-8000-000000000012',organization_id:MARKETPLACE_ORG_ID,title:'Synthetic platform course',description:null,is_published:true,hidden_from_catalog:false,category:null} });
beforeEach(()=>{publicCatalogPort.calls.length=0;});
describe('platform-owned courses only in the public landing catalogue',()=>{
 it('scopes the server read to both platform listing and actual course owner',async()=>{
  await fetchPublicCatalogPage(0,199);
  expect(publicCatalogPort.calls.filter(x=>x.method==='eq').map(x=>x.args)).toContainEqual(['organization_id',MARKETPLACE_ORG_ID]);
  expect(publicCatalogPort.calls.filter(x=>x.method==='eq').map(x=>x.args)).toContainEqual(['course.organization_id',MARKETPLACE_ORG_ID]);
  expect(String(publicCatalogPort.calls.find(x=>x.method==='select')?.args[0])).toContain('courses!inner(id, organization_id,');
 });
 it('counts a published verified source course owned by the platform',async()=>{
  const result=await loadPublicCourseCatalog({fetchPage:async()=>[row()]});
  expect(result.totalCount).toBe(1);expect(result.groups[0].courses[0].courseId).toBe(row().course_id);
 });
 it('rejects a customer-owned course even when it arrives in a platform listing response',async()=>{
  const foreign=row();foreign.id='10000000-0000-4000-8000-000000000013';foreign.course.organization_id='10000000-0000-4000-8000-000000000099';
  await expect(loadPublicCourseCatalog({fetchPage:async()=>[row(),foreign]})).rejects.toThrow();
 });
});
