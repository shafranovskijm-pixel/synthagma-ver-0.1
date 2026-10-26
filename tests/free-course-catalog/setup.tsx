import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

const ports = vi.hoisted(() => ({ navigate: vi.fn(), from: vi.fn() }));
export { ports };
vi.mock('react-router-dom', () => ({ useNavigate: () => ports.navigate }));
vi.mock('@/components/organization/CourseComments', () => ({ CourseComments: () => null }));
vi.mock('@/components/organization/CourseMaterialPassportCard', () => ({ CourseMaterialPassportCard: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: ports.from } }));
vi.mock('@/integrations/supabase/publicCatalogClient', () => ({ publicCatalogClient: { from: () => { throw new Error('Use the explicit offline page port'); } } }));
vi.mock('@/utils/safeInvoke', () => ({ safeInvoke: () => { throw new Error('No remote operations in this suite'); } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// Exercise the actual OrderDialog branches while keeping Radix focus/portal behavior outside this scope.
vi.mock('@/components/ui/dialog', async () => {
  const { createElement } = await import('react');
  const block = ({ children }: any) => createElement('div', null, children);
  return {
    Dialog: ({ open, children }: any) => open ? createElement('div', null, children) : null,
    DialogContent: ({ children }: any) => createElement('div', { role: 'dialog' }, children),
    DialogDescription: block, DialogFooter: block, DialogHeader: block, DialogTitle: block,
  };
});
beforeEach(() => {
  vi.clearAllMocks();
  ports.from.mockImplementation(() => { throw new Error('Unexpected database operation'); });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network access is forbidden in this suite'); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
