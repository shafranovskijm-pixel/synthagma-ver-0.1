import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OrgDocumentWorkflowPanel } from "./OrgDocumentWorkflowPanel";
import { ids, workflow, workflowComment, workflowEnvelope, workflowCandidates, workflowId } from "@/lib/__tests__/orgDocumentWorkflow.fixture";
const mocks = vi.hoisted(() => ({ hook: vi.fn(), transition: vi.fn(), draft: vi.fn(), comment: vi.fn(), resolve: vi.fn(), reload: vi.fn(), content: vi.fn(), review: vi.fn(), openFile: vi.fn(), downloadFile: vi.fn() }));
vi.mock("@/hooks/useOrgDocumentWorkflow", () => ({ useOrgDocumentWorkflow: mocks.hook }));
vi.mock("@/lib/orgDocumentReviewContent", () => ({ loadOrgDocumentReviewContent: mocks.content }));
vi.mock("@/utils/storageHelpers", () => ({ openPrivateFile: mocks.openFile, downloadPrivateFile: mocks.downloadFile }));
vi.mock("@/components/signing/ReviewableDocument", () => ({ ReviewableDocument: (props: any) => { mocks.review(props); return <div>Содержимое для проверки</div>; } }));
let state: any;
const mount = () => render(<OrgDocumentWorkflowPanel organizationId={ids.org} documentId={ids.doc} currentVersionId={ids.version} />);
beforeEach(() => {
  vi.clearAllMocks(); mocks.transition.mockResolvedValue(true); mocks.draft.mockResolvedValue(true); mocks.comment.mockResolvedValue(true);
  state = { data: workflowEnvelope(workflow({ state: "in_review" })), candidates: workflowCandidates(), loading: false, saving: false, error: null, denied: false, conflict: false,
    transition: mocks.transition, saveDraft: mocks.draft, addComment: mocks.comment, resolveComment: mocks.resolve, reload: mocks.reload };
  mocks.hook.mockImplementation(() => state);
});
describe("internal review card", () => {
  it("shows denied access honestly without an invented empty readiness state", () => {
    state.data = null; state.denied = true; state.error = "Внутреннее согласование этого документа недоступно с вашими правами."; mount();
    expect(screen.getByRole("alert")).toHaveTextContent(/недоступно/); expect(screen.queryByText("Нет согласования текущей версии")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Утвердить/ })).not.toBeInTheDocument();
  });
  it("requires explicitly entered approval number/date and sends exactly them", async () => {
    mount(); const approve = screen.getByRole("button", { name: "Утвердить эту версию внутри центра" }); expect(approve).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Номер утверждения"), { target: { value: "Приказ 17" } });
    fireEvent.change(screen.getByLabelText("Дата утверждения"), { target: { value: "2026-10-18" } });
    fireEvent.click(approve); await waitFor(() => expect(mocks.transition).toHaveBeenCalledWith("approve", "", "Приказ 17", "2026-10-18"));
  });
  it("accepted text changes visibly demand a new version and cannot be approved", () => {
    state.data.workflow.comments = [workflowComment({ resolved: true, resolution_status: "accepted", position_anchor: { kind: "replace" } })]; mount();
    expect(screen.getByRole("status")).toHaveTextContent(/загрузите новую версию/);
    expect(screen.getByRole("button", { name: /Утвердить эту версию/ })).toBeDisabled(); expect(mocks.transition).not.toHaveBeenCalled();
  });
  it("general comment resolution is 'Учтено', not a claim that the file was edited", () => {
    state.data.workflow.comments = [workflowComment()]; mount(); fireEvent.click(screen.getByRole("button", { name: "Учтено" }));
    expect(mocks.resolve).toHaveBeenCalledWith(state.data.workflow.comments[0].id, "accepted");
  });
  it("read-only readers see the review but cannot configure, comment or decide", () => {
    Object.keys(state.data.capabilities).forEach(k => { state.data.capabilities[k] = false; }); mount();
    expect(screen.getByText("На проверке")).toBeInTheDocument(); expect(screen.queryByLabelText("Общее замечание")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Проверяющий")).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: /Утвердить/ })).not.toBeInTheDocument();
  });
  it("keeps an unconfirmed legacy file and history readable while directing the user to an explicit new version", () => {
    const openFiles = vi.fn(); mocks.openFile.mockResolvedValue(true);
    state.data.document.file_state = "unconfirmed";
    Object.keys(state.data.capabilities).forEach(k => { state.data.capabilities[k] = false; });
    state.data.cycles = [state.data.workflow];
    render(<OrgDocumentWorkflowPanel organizationId={ids.org} documentId={ids.doc} currentVersionId={ids.version} onOpenFiles={openFiles} />);
    expect(screen.getByRole("status")).toHaveTextContent(/просмотр и история доступны/);
    expect(screen.getByLabelText("Текущее согласование и история")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Открыть прежний файл" }));
    expect(mocks.openFile).toHaveBeenCalledWith("org-documents", state.data.document.file_path || state.data.document.file_url);
    fireEvent.click(screen.getByRole("button", { name: "Перейти к файлам и версиям" }));
    expect(openFiles).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /Сохранить участников|Передать на проверку|Утвердить эту версию/ })).not.toBeInTheDocument();
    expect(mocks.draft).not.toHaveBeenCalled(); expect(mocks.transition).not.toHaveBeenCalled();
  });
  it("new fileless documents do not default an actor, decision, number or date", () => {
    state.data = workflowEnvelope(null); state.data.document.current_version_id = null; state.data.document.file_state = "fileless"; mount();
    expect(screen.getByText(/Сначала загрузите версию/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить участников и связи" })).toBeDisabled(); expect(mocks.draft).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Дата утверждения")).not.toBeInTheDocument();
  });
  it("uses the existing review widget only for proposal comments with no implicit save", async () => {
    state.data.document.file_name = "Положение.html"; mocks.content.mockResolvedValue("<p>Проверяемая версия</p>"); mount();
    fireEvent.click(screen.getByRole("button", { name: "Показать содержимое для проверки" }));
    await screen.findByText("Содержимое для проверки");
    expect(mocks.review).toHaveBeenCalledWith(expect.objectContaining({ proposalsOnly: true, documentHtml: "<p>Проверяемая версия</p>", canComment: true }));
    expect(mocks.transition).not.toHaveBeenCalled(); expect(mocks.draft).not.toHaveBeenCalled();
  });
  it("downloads template HTML without any signed-source opening or automatic approval", async () => {
    state.data.document.file_name = "Шаблон.html"; mocks.downloadFile.mockResolvedValue(true); const assertCurrent=vi.fn(),controller=new AbortController();
    render(<OrgDocumentWorkflowPanel organizationId={ids.org} documentId={ids.doc} currentVersionId={ids.version} sourceOpenMode="download" sourceDownloadAssertCurrent={assertCurrent} sourceDownloadSignal={controller.signal} />);
    fireEvent.click(screen.getByRole("button", { name: "Скачать исходный файл" }));
    await waitFor(() => expect(mocks.downloadFile).toHaveBeenCalledWith("org-documents", state.data.document.file_path || state.data.document.file_url, "Шаблон.html", expect.objectContaining({assertCurrent,signal:expect.any(AbortSignal)})));
    expect(assertCurrent).toHaveBeenCalled(); expect(mocks.openFile).not.toHaveBeenCalled(); expect(screen.queryByRole("button", { name: "Открыть исходный файл" })).toBeNull(); expect(mocks.transition).not.toHaveBeenCalled();
  });
  it("opens a historical approved cycle without presenting its approval as the new file's approval", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    const previous = workflow({ id: workflowId(30), version_id: workflowId(31), state: "approved", responsible_name: "Иван Петров", reviewer_name: "Ольга Иванова",
      approval: { number: "17", date: "2026-10-17", recorded_at: "2026-10-18T10:00:00Z", recorded_by: ids.reviewer }, comments: [workflowComment({ resolved: true, resolution_status: "accepted" })] });
    state.data = workflowEnvelope(null); state.data.cycles = [previous];
    render(<OrgDocumentWorkflowPanel organizationId={ids.org} documentId={ids.doc} currentVersionId={ids.version} versions={[{
      id: previous.version_id, document_id: ids.doc, organization_id: ids.org, version_number: 1, file_url: "org/old.pdf", file_path: null, file_size: 20,
      file_name: "Прежний файл.pdf", change_summary: null, uploaded_by: ids.responsible, uploaded_by_name: null, created_at: "2026-10-17T00:00:00Z",
    }]} />);
    expect(screen.getByText("Нет согласования текущей версии")).toBeInTheDocument(); expect(screen.queryByText(/Внутреннее утверждение №/)).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("Текущее согласование и история"), { key: "ArrowDown" });
    const option = await screen.findByRole("option", { name: /17 от 2026-10-17/ }); fireEvent.keyDown(option, { key: "Enter" });
    expect(await screen.findByText("Версия v1")).toBeInTheDocument(); expect(screen.getByText(/Иван Петров/)).toHaveTextContent("Ольга Иванова");
    expect(screen.getByText(/Историческое согласование другой версии/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Открыть файл этой версии" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Утвердить эту версию/ })).not.toBeInTheDocument(); expect(mocks.transition).not.toHaveBeenCalled();
  });

  it("forwards the same scoped signer and BOTH template/transport guards to inline HTML reads",async()=>{
    state.data.document.file_name="Template.html";mocks.content.mockResolvedValue("<p>Scoped content</p>");const templateGuard=vi.fn(),transportGuard=vi.fn(),signUrl=vi.fn();
    const transport={key:"template-owner",assertCurrent:transportGuard,signUrl,rpc:vi.fn(),readDocument:vi.fn(),readVersions:vi.fn(),saveUpload:vi.fn(),restore:vi.fn()};
    render(<OrgDocumentWorkflowPanel organizationId={ids.org} documentId={ids.doc} currentVersionId={ids.version} sourceOpenMode="download" sourceDownloadAssertCurrent={templateGuard} transport={transport}/>);
    fireEvent.click(screen.getByRole("button",{name:"Показать содержимое для проверки"}));await waitFor(()=>expect(mocks.content).toHaveBeenCalledOnce());
    expect(mocks.content).toHaveBeenCalledWith(state.data.document.file_path||state.data.document.file_url,"Template.html",expect.any(AbortSignal),expect.objectContaining({signUrl,assertCurrent:expect.any(Function)}));
    mocks.content.mock.calls[0][3].assertCurrent();expect(templateGuard).toHaveBeenCalled();expect(transportGuard).toHaveBeenCalled();expect(mocks.openFile).not.toHaveBeenCalled();
  });
  it("does not expose a deferred inline HTML result after its template transport is no longer current",async()=>{
    state.data.document.file_name="Template.html";let live=true,release!:(value:string)=>void;mocks.content.mockReturnValueOnce(new Promise(done=>{release=done;}));
    const transport={key:"old-template",assertCurrent:()=>{if(!live)throw Error("old scope");},signUrl:vi.fn(),rpc:vi.fn(),readDocument:vi.fn(),readVersions:vi.fn(),saveUpload:vi.fn(),restore:vi.fn()};
    render(<OrgDocumentWorkflowPanel organizationId={ids.org} documentId={ids.doc} currentVersionId={ids.version} sourceOpenMode="download" transport={transport}/>);
    fireEvent.click(screen.getByRole("button",{name:"Показать содержимое для проверки"}));await waitFor(()=>expect(mocks.content).toHaveBeenCalledOnce());live=false;await act(async()=>release("<p>Private late source</p>"));
    expect(mocks.review).not.toHaveBeenCalled();expect(screen.queryByText("Содержимое для проверки")).not.toBeInTheDocument();expect(mocks.transition).not.toHaveBeenCalled();
  });

});
