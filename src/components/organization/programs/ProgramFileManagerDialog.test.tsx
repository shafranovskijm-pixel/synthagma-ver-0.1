import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ list: vi.fn(), read: vi.fn(), prepare: vi.fn(), run: vi.fn(), history: vi.fn(), live: true }));
vi.mock('@/lib/programFiles', () => ({
  listProgramFiles: m.list, readProgramFile: m.read, prepareProgramFile: m.prepare,
  programFileScopeCurrent: (scope: any) => m.live && scope.current(),
  requireProgramFileScope: (scope: any) => { if (!m.live || !scope.current()) throw Error('context closed'); },
  createScopedOrgDocumentTransport: (scope: any) => ({ key: scope.key, assertCurrent: () => { if (!m.live || !scope.current()) throw Error('context closed'); } }),
}));
vi.mock('@/components/organization/OrgDocumentVersionsDialog', () => ({ OrgDocumentVersionsDialog: (props: any) => {
  m.history(props); return <div data-testid="programme-history">{props.documentName}<button onClick={() => props.onOpenChange(false)}>Закрыть историю</button></div>;
} }));
import { ProgramFileManagerDialog } from './ProgramFileManagerDialog';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope = { actorId: id(1), organizationId: id(2), accessRevision: 1, key: 'scopeA', current: () => true };
const item = (n = 3, name = 'Программа А') => ({ document: { id: id(n), organization_id: id(2), type: 'education_program', name, document_revision: 1, current_version_id: id(n+100), status: 'active', deleted_at: null, created_at: '2026-10-23T00:00:00Z' }, currentVersion: { id: id(n+100), document_id: id(n), organization_id: id(2), file_name: name+'.pdf', version_number: 1 } });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => {
  vi.clearAllMocks(); m.live = true; m.list.mockResolvedValue({ items: [], next: null }); m.read.mockResolvedValue(item()); m.run.mockResolvedValue(item());
  m.prepare.mockResolvedValue({ documentId: id(3), requestId: id(4), fileName: 'образец.pdf', name: 'Программа А', run: m.run });
});
const form = async () => {
  await waitFor(() => expect(screen.queryByText('Загрузка файлов программ…')).not.toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('Название файла программы'), { target: { value: 'Программа А' } });
  fireEvent.change(screen.getByLabelText('Файл программы PDF'), { target: { files: [new File(['%PDF-test'], 'образец.pdf', { type: 'application/pdf' })] } });
};
describe('programme file upload and explicit existing review path', () => {
  it('saves a separate programme PDF and forwards current scope to standard UC011 without approval or facts mutation', async () => {
    const changed = vi.fn(); render(<ProgramFileManagerDialog open onOpenChange={vi.fn()} scope={scope} canWrite onChanged={changed} />); await form();
    fireEvent.click(screen.getByRole('button',{name:'Загрузить файл программы'}));
    await waitFor(() => expect(screen.getByTestId('programme-history')).toBeInTheDocument());
    expect(m.prepare).toHaveBeenCalledWith(expect.objectContaining({ organizationId: id(2) }), 'Программа А', expect.any(File));
    const props = m.history.mock.calls.at(-1)![0]; expect(props).toMatchObject({ organizationId: id(2), documentId: id(3), canWrite: true, accept: 'application/pdf,.pdf' });
    expect(props.transport.assertCurrent).toBeTypeOf('function'); expect(changed).toHaveBeenCalledOnce();
    expect(screen.getByText(/Файл «Программа А» сохранён/)).toHaveTextContent('внутреннее согласование');
  });
  it('consumes a confirmed draft before a refresh notification failure, so retry never creates another file', async () => {
    render(<ProgramFileManagerDialog open onOpenChange={vi.fn()} scope={scope} canWrite onChanged={async () => { throw Error('refresh failed'); }} />); await form();
    fireEvent.click(screen.getByRole('button',{name:'Загрузить файл программы'}));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Файл сохранён'));
    expect(screen.queryByRole('button',{name:'Повторить то же сохранение'})).not.toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button',{name:'Обновить файлы программ'})));
    expect(m.run).toHaveBeenCalledOnce(); expect(m.prepare).toHaveBeenCalledOnce();
  });
  it('retains one unknown operation across same-owner close/reopen and retries that exact operation', async () => {
    m.run.mockRejectedValueOnce(Error('unknown result'));
    const view = render(<ProgramFileManagerDialog open onOpenChange={vi.fn()} scope={scope} canWrite />); await form();
    fireEvent.click(screen.getByRole('button',{name:'Загрузить файл программы'})); await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('unknown result'));
    view.rerender(<ProgramFileManagerDialog open={false} onOpenChange={vi.fn()} scope={scope} canWrite />);
    view.rerender(<ProgramFileManagerDialog open onOpenChange={vi.fn()} scope={scope} canWrite />);
    await waitFor(() => expect(screen.getByRole('button',{name:'Повторить то же сохранение'})).toBeEnabled());
    fireEvent.click(screen.getByRole('button',{name:'Повторить то же сохранение'})); await waitFor(() => expect(m.run).toHaveBeenCalledTimes(2));
    expect(m.prepare).toHaveBeenCalledOnce();
  });
  it('does not assign a deferred preparation from a closed dialog into a newly reopened draft', async () => {
    const pending = deferred<any>(); m.prepare.mockReturnValueOnce(pending.promise);
    const view = render(<ProgramFileManagerDialog open onOpenChange={vi.fn()} scope={scope} canWrite />); await form();
    fireEvent.click(screen.getByRole('button',{name:'Загрузить файл программы'}));
    view.rerender(<ProgramFileManagerDialog open={false} onOpenChange={vi.fn()} scope={scope} canWrite />);
    view.rerender(<ProgramFileManagerDialog open onOpenChange={vi.fn()} scope={scope} canWrite />);
    await act(async () => pending.resolve({ documentId:id(3),requestId:id(4),fileName:'старый.pdf',run:m.run }));
    expect(m.run).not.toHaveBeenCalled(); expect(screen.queryByText(/старый.pdf/)).not.toBeInTheDocument(); expect(screen.getByLabelText('Название файла программы')).toHaveValue('');
  });
  it('does not revive old pending preparation after organization A→B→A', async () => {
    const pending = deferred<any>(); m.prepare.mockReturnValueOnce(pending.promise);
    const view = render(<ProgramFileManagerDialog open onOpenChange={vi.fn()} scope={scope} canWrite />); await form(); fireEvent.click(screen.getByRole('button',{name:'Загрузить файл программы'}));
    view.rerender(<ProgramFileManagerDialog open onOpenChange={vi.fn()} scope={{...scope,key:'scopeB',organizationId:id(99)}} canWrite />);
    view.rerender(<ProgramFileManagerDialog open onOpenChange={vi.fn()} scope={{...scope,key:'scopeA-new-epoch'}} canWrite />);
    await act(async () => pending.resolve({ documentId:id(3),requestId:id(4),fileName:'старый.pdf',run:m.run }));
    expect(m.run).not.toHaveBeenCalled(); expect(screen.queryByRole('button',{name:'Повторить то же сохранение'})).not.toBeInTheDocument();
  });
  it('masks old private names and draft in layout phase before passive reset, including return to A', async () => {
    m.list.mockResolvedValue({items:[item()],next:null}); const observations: string[] = [];
    function Parent({current}:{current:typeof scope}) { useLayoutEffect(() => { observations.push(document.body.textContent ?? ''); },[current]); return <ProgramFileManagerDialog open onOpenChange={vi.fn()} scope={current} canWrite />; }
    const view=render(<Parent current={scope}/>); await form();
    const b={...scope,key:'scopeB',organizationId:id(99)}; view.rerender(<Parent current={b}/>);
    expect(observations.at(-1)).not.toContain('Программа А.pdf');
    view.rerender(<Parent current={{...scope,key:'scopeA-new'}}/>); expect(observations.at(-1)).not.toContain('Программа А.pdf');
    expect(screen.getByLabelText('Название файла программы')).toHaveValue('');
  });
  it('rereads a selected later-page file exactly and refreshes candidates only after explicit review return', async () => {
    m.list.mockResolvedValueOnce({items:[item(3)],next:id(3)}).mockResolvedValue({items:[item(9,'Поздняя программа')],next:null}); m.read.mockResolvedValue(item(9,'Поздняя программа'));
    const changed=vi.fn(); render(<ProgramFileManagerDialog open onOpenChange={vi.fn()} scope={scope} canWrite onChanged={changed}/>);
    await waitFor(()=>expect(screen.getByRole('button',{name:'Следующая страница'})).toBeEnabled()); fireEvent.click(screen.getByRole('button',{name:'Следующая страница'}));
    await waitFor(()=>expect(screen.getByText('Поздняя программа')).toBeInTheDocument()); fireEvent.click(screen.getByRole('button',{name:'История и согласование'}));
    await waitFor(()=>expect(screen.getByTestId('programme-history')).toHaveTextContent('Поздняя программа'));
    expect(m.read).toHaveBeenCalledWith(expect.objectContaining({organizationId:id(2)}),id(9)); expect(changed).not.toHaveBeenCalled();
    // The mock is a plain sibling div, so the outer Radix modal hides it from role queries.
    await act(async () => fireEvent.click(within(screen.getByTestId('programme-history')).getByText('Закрыть историю'))); expect(changed).toHaveBeenCalledOnce();
  });
  it('does not expose upload or write history to read-only actors', async () => {
    m.list.mockResolvedValue({items:[item()],next:null}); render(<ProgramFileManagerDialog open onOpenChange={vi.fn()} scope={scope} canWrite={false}/>);
    await waitFor(()=>expect(screen.getByRole('button',{name:'История и согласование'})).toBeEnabled());
    expect(screen.queryByLabelText('Файл программы PDF')).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button',{name:'История и согласование'}));
    await waitFor(()=>expect(m.history).toHaveBeenCalled()); expect(m.history.mock.calls.at(-1)![0].canWrite).toBe(false); expect(m.prepare).not.toHaveBeenCalled();
  });
  it('never opens stale history after its exact reread finishes under a new owner', async () => {
    const pending=deferred<any>(); m.list.mockResolvedValue({items:[item()],next:null}); m.read.mockReturnValue(pending.promise);
    const view=render(<ProgramFileManagerDialog open onOpenChange={vi.fn()} scope={scope} canWrite/>); await waitFor(()=>expect(screen.getByRole('button',{name:'История и согласование'})).toBeEnabled()); fireEvent.click(screen.getByRole('button',{name:'История и согласование'}));
    view.rerender(<ProgramFileManagerDialog open onOpenChange={vi.fn()} scope={{...scope,key:'scopeB',organizationId:id(99)}} canWrite/>);
    await act(async()=>pending.resolve(item())); expect(screen.queryByTestId('programme-history')).not.toBeInTheDocument();
  });
});
