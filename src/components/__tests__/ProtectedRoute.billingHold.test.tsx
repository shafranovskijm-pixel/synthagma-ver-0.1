import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act,cleanup,fireEvent,render,screen } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),retry:vi.fn(),refresh:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:m.auth}));
import { ProtectedRoute } from '../ProtectedRoute';
beforeEach(()=>{vi.clearAllMocks();m.auth.mockReturnValue({user:{id:'held'},userRole:'organization',loading:false,authError:'ACCESS_SUSPENDED',retryAuth:m.retry,refreshUserRole:m.refresh});});
afterEach(()=>{cleanup();vi.useRealTimers();});
describe('held account route',()=>{
  it('hides protected content even if the same actor still has an old organization role',()=>{
    render(<MemoryRouter><ProtectedRoute requiredRole="organization"><p>Private course data</p></ProtectedRoute></MemoryRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent('Доступ временно приостановлен');
    expect(screen.queryByText('Private course data')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Проверить доступ'}));expect(m.retry).toHaveBeenCalledTimes(1);
  });
  it('does not automatically retry a known suspension as a missing role',()=>{
    vi.useFakeTimers();m.auth.mockReturnValue({user:{id:'held'},userRole:null,loading:false,authError:'ACCESS_SUSPENDED',retryAuth:m.retry,refreshUserRole:m.refresh});
    render(<MemoryRouter><ProtectedRoute requiredRole="organization"><p>Private course data</p></ProtectedRoute></MemoryRouter>);
    act(()=>vi.advanceTimersByTime(9000));expect(m.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Доступ временно приостановлен');
  });
});
