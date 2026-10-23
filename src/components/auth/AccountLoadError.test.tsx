import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter,useLocation} from 'react-router-dom';
import {AccountLoadError} from './AccountLoadError';
import {ProtectedRoute} from '../ProtectedRoute';
const state=vi.hoisted(()=>({auth:{} as any}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>state.auth}));
afterEach(cleanup);beforeEach(()=>{state.auth={user:null,userRole:null,loading:false,authError:'SESSION_UNAVAILABLE',retryAuth:vi.fn().mockResolvedValue(undefined),refreshUserRole:vi.fn()};});
describe('explicit account loading failure presentation',()=>{
 it('keeps the protected URL and offers retry after session timeout instead of navigating to login or showing private content',()=>{function Location(){return <span data-testid="location">{useLocation().pathname}</span>;}render(<MemoryRouter initialEntries={['/student']}><Location/><ProtectedRoute requiredRole="student"><p>PRIVATE COURSES</p></ProtectedRoute></MemoryRouter>);expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить кабинет');expect(screen.getByTestId('location')).toHaveTextContent('/student');expect(screen.queryByText('PRIVATE COURSES')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Повторить загрузку'}));expect(state.auth.retryAuth).toHaveBeenCalledTimes(1);});
 it('failed courses are an error with a retry and never say courses were not found',async()=>{const retry=vi.fn().mockRejectedValue(new Error('secret transport details'));render(<AccountLoadError title="Не удалось загрузить курсы" onRetry={retry}/>);expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить курсы');expect(screen.queryByText('Курсы не найдены')).toBeNull();fireEvent.click(screen.getByRole('button'));await waitFor(()=>expect(screen.getByRole('button')).not.toBeDisabled());expect(retry).toHaveBeenCalledTimes(1);expect(screen.queryByText('secret transport details')).toBeNull();});
 it('coalesces repeated retry clicks until the current loader completes',async()=>{let finish!:()=>void;const retry=vi.fn(()=>new Promise<void>(done=>{finish=done;}));render(<AccountLoadError onRetry={retry}/>);fireEvent.click(screen.getByRole('button'));fireEvent.click(screen.getByRole('button'));expect(retry).toHaveBeenCalledTimes(1);expect(screen.getByRole('button')).toBeDisabled();finish();await waitFor(()=>expect(screen.getByRole('button')).not.toBeDisabled());});
});
