import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
vi.mock('@/api/courseReviewer',()=>({fetchCourseReviewSnapshot:vi.fn(()=>{throw new Error('Unexpected reviewer read');})}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:null,userRole:null})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:vi.fn(()=>{throw new Error('Unexpected RPC');})}}));
import { resolveLoginDestination } from '@/utils/loginDestination';
import { organizationRegistrationTarget, safeInternalNext } from '@/utils/authReturn';
import { ordinaryDrivingExit } from '@/pages/DrivingSchoolPage';
import AutoSchools from '@/pages/AutoSchools';
describe('ordinary auth defaults and separate marketing entry',()=>{
 it('ASA01 module return-to-cabinet agrees with existing canonical defaults for every ordinary role',async()=>{
  for(const role of ['student','organization','admin','company','sales_manager'])expect(ordinaryDrivingExit(role)).toBe(await resolveLoginDestination('synthetic-ordinary-user',role,null));
  expect(await resolveLoginDestination('synthetic-ordinary-user','student',null)).toBe('/student');
 });
 it('ASA02 current driving registration and exact course return remain distinct; foreign redirects stay denied',()=>{
  expect(organizationRegistrationTarget(new URLSearchParams('module=driving-school'))).toBe('/organization/driving-school');
  expect(organizationRegistrationTarget(new URLSearchParams())).toBe('/organization');
  const course='/organization?tab=services&catalogCourseId=11111111-2222-4333-8444-555555555555';
  expect(organizationRegistrationTarget(new URLSearchParams({next:course}))).toBe(course);
  expect(safeInternalNext('//foreign.invalid/driving-school')).toBeNull();
 });
 it('ASA03 the separate Beta landing has deliberate owner and participant paths, ordinary account preservation and draft boundaries',()=>{
  render(<HelmetProvider><MemoryRouter><AutoSchools/></MemoryRouter></HelmetProvider>);
  expect(screen.getByRole('link',{name:/Войти как организация/}).getAttribute('href')).toBe('/login?next=%2Forganization%2Fdriving-school');
  expect(screen.getByRole('link',{name:'Зарегистрировать организацию'}).getAttribute('href')).toBe('/register-organization?module=driving-school');
  expect(screen.getByRole('link',{name:'Кабинет ученика или инструктора'}).getAttribute('href')).toBe('/driving-school');
  expect(screen.getByText(/Обычный кабинет слушателя сохраняется/)).toBeTruthy();expect(screen.getByText(/Одна регистрация.*не включает/)).toBeTruthy();expect(screen.getByText(/Контур работает в режиме Beta/)).toBeTruthy();
 });
});
