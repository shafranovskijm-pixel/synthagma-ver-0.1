import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ids, programEnvelope, programVersion } from "./programFacts.fixtures";
const mocks = vi.hoisted(() => ({ programs: {} as any, course: {} as any, usePrograms: vi.fn(), useCourse: vi.fn() }));
vi.mock("@/hooks/useProgramFacts", () => ({ useProgramFacts: (...a: any[]) => { mocks.usePrograms(...a); return mocks.programs; }, useCourseProgramBinding: (...a: any[]) => { mocks.useCourse(...a); return mocks.course; } }));
vi.mock("@/components/organization/OrgDocumentVersionsDialog", () => ({ OrgDocumentVersionsDialog: ({ open, documentId }: any) => open ? <div data-testid="file-history">{documentId}</div> : null }));
vi.mock("@/hooks/useProgramFileAccess", () => ({ useProgramFileAccess: (org: string, canConfigure: boolean) => ({ scope: { actorId:'actor',organizationId:org,accessRevision:1,key:org,current:()=>true },ownerKey:org,canWrite:canConfigure,canRead:true,loading:false }) }));
vi.mock("@/lib/programFiles", () => ({ createScopedOrgDocumentTransport:(scope:any)=>({key:scope.key,assertCurrent:()=>undefined}),programFileScopeCurrent:(scope:any)=>scope.current() }));
vi.mock("./ProgramFileManagerDialog", () => ({ ProgramFileManagerDialog: ({open,onChanged}:any)=>open ? <div data-testid="programme-files"><button onClick={onChanged}>Обновить согласованные файлы</button></div> : null }));
// Native select preserves selection events while keeping these tests focused on programme decisions.
vi.mock("@/components/ui/select", async () => {
  const { Children, isValidElement } = await import("react");
  const passthrough = ({ children }: any) => children;
  const collect = (children: any): any[] => Children.toArray(children).flatMap((c: any) => !isValidElement(c) ? [] : (c.props as any).value !== undefined ? [<option key={(c.props as any).value} value={(c.props as any).value}>{(c.props as any).children}</option>] : collect((c.props as any).children));
  return { Select: ({ children, value, onValueChange, disabled }: any) => <select id={(Children.toArray(children)[0] as any)?.props?.id} value={value} disabled={disabled} onChange={e => onValueChange(e.target.value)}><option value="" />{collect(children)}</select>, SelectTrigger: passthrough, SelectContent: passthrough, SelectItem: passthrough, SelectValue: passthrough };
});
import { ProgramFactsPanel } from "./ProgramFactsPanel";

describe("ProgramFactsPanel decisions", () => {
  beforeEach(() => {
    mocks.usePrograms.mockClear(); mocks.useCourse.mockClear();
    mocks.programs = { programs: [], candidates: { files: [{ document_id: ids.document, version_id: ids.file, review_id: ids.review, document_name: "Программа.pdf", version_number: 2, approval: programVersion().file_approval }], reviewers: [{ user_id: ids.actor, display_name: "Мария Проверяющая" }], courses: [], groups: [] }, loading: false, saving: false, error: null, denied: false, conflict: false, candidatesError: null, reload: vi.fn(), createVersion: vi.fn().mockResolvedValue(false), transition: vi.fn().mockResolvedValue(true) };
    mocks.course = { data: { revision: 0, binding: null, version: null }, loading: false, saving: false, error: null, reload: vi.fn(), bind: vi.fn().mockResolvedValue(true) };
  });
  const openDraft = () => { fireEvent.click(screen.getByRole("button", { name: "Добавить программу" })); fireEvent.change(screen.getByLabelText("Название записи программы"), { target: { value: "Новая программа" } }); fireEvent.change(screen.getByLabelText("Согласованная версия файла"), { target: { value: ids.file } }); fireEvent.change(screen.getByLabelText("Проверяющий сведения программы"), { target: { value: ids.actor } }); };
  it("keeps unknown facts null and selects an exact approved file and real reviewer", async () => {
    render(<ProgramFactsPanel organizationId={ids.org} canConfigure />); openDraft();
    expect(screen.getByLabelText("Академические часы")).toHaveValue(null);
    expect(screen.getByLabelText("Дистанционные технологии")).toHaveValue("unknown");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить новую версию сведений" }));
    await waitFor(() => expect(mocks.programs.createVersion).toHaveBeenCalledOnce());
    expect(mocks.programs.createVersion.mock.calls[0][0]).toMatchObject({ fileVersionId: ids.file, reviewerId: ids.actor, facts: { academic_hours: null, program_type: null, uses_elearning: null, uses_distance_learning: null, training_form: null }, description: "" });
  });
  it("retains the new identity across uncertain retries and reload, then creates a distinct explicit new draft", async () => {
    const view = render(<ProgramFactsPanel organizationId={ids.org} canConfigure />); openDraft();
    const save = () => fireEvent.click(screen.getByRole("button", { name: "Сохранить новую версию сведений" }));
    save(); await waitFor(() => expect(mocks.programs.createVersion).toHaveBeenCalledTimes(1));
    const stable = mocks.programs.createVersion.mock.calls[0][0].programId;
    mocks.programs = { ...mocks.programs, error: "Сохранение не подтверждено." }; view.rerender(<ProgramFactsPanel organizationId={ids.org} canConfigure />);
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку программ" })); save();
    await waitFor(() => expect(mocks.programs.createVersion).toHaveBeenCalledTimes(2));
    expect(mocks.programs.createVersion.mock.calls[1][0].programId).toBe(stable);
    fireEvent.click(screen.getByRole("button", { name: "Закрыть без сохранения" })); openDraft(); save();
    await waitFor(() => expect(mocks.programs.createVersion).toHaveBeenCalledTimes(3));
    expect(mocks.programs.createVersion.mock.calls[2][0].programId).not.toBe(stable);
  });
  it("keeps prior approved facts read-only and available for prospective course binding", () => {
    const old = programVersion(), newer = programVersion({ id: ids.newer, version_number: 2, state: "in_review", approved_at: null, approved_by: null });
    const p = programEnvelope(newer); p.versions = [newer, old]; p.capabilities.can_approve = true; mocks.programs.programs = [p];
    render(<ProgramFactsPanel organizationId={ids.org} canConfigure courses={[{ id: ids.course, title: "Курс" }]} />);
    fireEvent.change(screen.getByLabelText("Программа"), { target: { value: ids.program } });
    fireEvent.change(screen.getByLabelText("Версия программы"), { target: { value: ids.version } });
    expect(screen.queryByRole("button", { name: "Утвердить сведения этой версии" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "История файла программы" })); expect(screen.getByTestId("file-history")).toHaveTextContent(ids.document);
    fireEvent.change(screen.getByLabelText("Курс"), { target: { value: ids.course } });
    fireEvent.change(screen.getByLabelText("Утверждённая версия для курса"), { target: { value: ids.version } });
    fireEvent.click(screen.getByRole("button", { name: "Связать с курсом для будущих групп" }));
    expect(mocks.course.bind).toHaveBeenCalledWith(ids.version);
    expect(mocks.useCourse).toHaveBeenLastCalledWith(ids.org, ids.course, true, expect.objectContaining({key:ids.org}));
  });
  it("does not silently duplicate an uncertain save after reload reveals that the programme changed", async () => {
    const view = render(<ProgramFactsPanel organizationId={ids.org} canConfigure />); openDraft();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить новую версию сведений" }));
    await waitFor(() => expect(mocks.programs.createVersion).toHaveBeenCalledOnce());
    const stableId = mocks.programs.createVersion.mock.calls[0][0].programId;
    const committed = programEnvelope(); committed.program.id = stableId;
    mocks.programs.programs = [committed]; view.rerender(<ProgramFactsPanel organizationId={ids.org} canConfigure />);
    expect(screen.getByText(/Предыдущее сохранение могло завершиться/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить новую версию сведений" })).toBeDisabled();
    expect(mocks.programs.createVersion).toHaveBeenCalledOnce();
  });
  it("records approval only for the selected current version and shows unavailable candidates without hiding history", () => {
    const p = programEnvelope(programVersion({ state: "in_review", approved_at: null, approved_by: null })); p.capabilities.can_approve = true; mocks.programs.programs = [p]; mocks.programs.candidates = null; mocks.programs.candidatesError = "Файлы и сотрудники сейчас недоступны";
    render(<ProgramFactsPanel organizationId={ids.org} canConfigure />);
    fireEvent.change(screen.getByLabelText("Программа"), { target: { value: ids.program } });
    fireEvent.change(screen.getByLabelText("Комментарий к решению"), { target: { value: "Проверено" } });
    fireEvent.click(screen.getByRole("button", { name: "Утвердить сведения этой версии" }));
    expect(mocks.programs.transition).toHaveBeenCalledWith(ids.program, ids.version, "approve", "Проверено");
    expect(screen.getByRole("alert")).toHaveTextContent("Файлы и сотрудники");
    expect(screen.getByText("Подтверждённая программа")).toBeInTheDocument();
  });
  it("never exposes mutation controls to a read-only user even when file history exists", () => {
    mocks.programs.programs = [programEnvelope()];
    render(<ProgramFactsPanel organizationId={ids.org} />);
    fireEvent.change(screen.getByLabelText("Программа"), { target: { value: ids.program } });
    expect(screen.queryByRole("button", { name: "Добавить программу" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Создать новую версию сведений" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "История файла программы" })).toBeEnabled();
    expect(mocks.programs.createVersion).not.toHaveBeenCalled();
  });
  it("does not call an error an empty programme list", () => {
    mocks.programs.programs = null; mocks.programs.error = "Сведения недоступны"; mocks.programs.denied = true;
    render(<ProgramFactsPanel organizationId={ids.org} canConfigure />);
    expect(screen.getByRole("alert")).toHaveTextContent("Сведения недоступны");
    expect(screen.queryByText(/Версии программы со сведениями пока не созданы/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить программу" })).toBeDisabled();
  });
  it("offers the separate PDF path when approved candidates are empty, without creating or approving facts", () => {
    mocks.programs.candidates.files=[];
    render(<ProgramFactsPanel organizationId={ids.org} canConfigure/>);
    fireEvent.click(screen.getByRole('button',{name:'Добавить программу'}));
    expect(screen.getByText(/Откройте «Файлы программ», загрузите PDF/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Файлы программ'}));
    expect(screen.getByTestId('programme-files')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Обновить согласованные файлы'}));
    expect(mocks.programs.reload).toHaveBeenCalledOnce(); expect(mocks.programs.createVersion).not.toHaveBeenCalled(); expect(mocks.programs.transition).not.toHaveBeenCalled();
  });
});
