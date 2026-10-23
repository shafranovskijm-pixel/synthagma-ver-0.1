import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
const state=vi.hoisted(()=>({read:vi.fn(),upload:vi.fn(),restore:vi.fn(),refreshed:vi.fn(),download:vi.fn(),refresh:vi.fn(),workflow:vi.fn()}));
vi.mock("@/utils/storageHelpers",()=>({downloadPrivateFile:state.download}));
vi.mock("@/hooks/useOrgDocumentVersions",()=>({useOrgDocumentVersions:state.read}));
vi.mock("../documents/OrgDocumentWorkflowPanel",()=>({OrgDocumentWorkflowPanel:(props:any)=>{state.workflow(props);return <button onClick={props.onOpenFiles}>Перейти к файлам и версиям</button>;}}));
import { OrgDocumentVersionsDialog } from "../OrgDocumentVersionsDialog";
const versions=[
  {id:"current",document_id:"doc",organization_id:"org",version_number:2,file_url:"https://example.test/new.pdf",created_at:"2026-10-18T00:00:00Z",event_kind:"upload"},
  {id:"old",document_id:"doc",organization_id:"org",version_number:1,file_url:"https://example.test/old.pdf",created_at:"2026-10-18T00:00:00Z",event_kind:"baseline"},
];
const props={open:true,onOpenChange:vi.fn(),documentId:"doc",documentName:"Лицензия",organizationId:"org",onRestored:state.refreshed};
beforeEach(()=>{
  vi.clearAllMocks();
  state.upload.mockResolvedValue(true);state.restore.mockResolvedValue(true);
  state.download.mockResolvedValue(true);
  state.read.mockImplementation((_id,canWrite)=>({versions,loading:false,loadError:null,hasLoaded:true,refresh:state.refresh,currentVersionId:"current",canChange:canWrite,
    uploadVersion:state.upload,restoreVersion:state.restore}));
});
describe("organization version history permissions and event UI",()=>{
  it("offers a retry for a failed history read instead of claiming no history exists",()=>{
    state.read.mockReturnValue({versions:[],loading:false,loadError:"Не удалось загрузить историю версий.",hasLoaded:false,
      refresh:state.refresh,currentVersionId:null,canChange:false,uploadVersion:state.upload,restoreVersion:state.restore});
    render(<OrgDocumentVersionsDialog {...props} canWrite />);
    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось загрузить историю версий.");
    expect(screen.queryByText(/История пока не велась/)).not.toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Загрузить новую версию"})).toBeDisabled();
    fireEvent.click(screen.getByRole("button",{name:"Повторить загрузку истории"}));
    expect(state.refresh).toHaveBeenCalledOnce();
  });
  it("returns from internal review to the existing version upload without writing a file automatically",()=>{
    render(<OrgDocumentVersionsDialog {...props} canWrite />);
    fireEvent.keyDown(screen.getByRole("tab",{name:"Внутреннее согласование"}),{key:"Enter"});
    fireEvent.click(screen.getByRole("button",{name:"Перейти к файлам и версиям"}));
    expect(screen.getByRole("tab",{name:"Файлы и версии"})).toHaveAttribute("aria-selected","true");
    expect(screen.getByRole("button",{name:"Загрузить новую версию"})).toBeEnabled();
    expect(state.upload).not.toHaveBeenCalled();expect(state.restore).not.toHaveBeenCalled();
  });
  it("forwards the template download-only source mode to ordinary review without changing default callers",()=>{
    const assertCurrent=vi.fn(),controller=new AbortController();render(<OrgDocumentVersionsDialog {...props} sourceOpenMode="download" sourceDownloadAssertCurrent={assertCurrent} sourceDownloadSignal={controller.signal} />);
    fireEvent.keyDown(screen.getByRole("tab",{name:"Внутреннее согласование"}),{key:"Enter"});
    expect(state.workflow).toHaveBeenCalledWith(expect.objectContaining({sourceOpenMode:"download",sourceDownloadAssertCurrent:assertCurrent,sourceDownloadSignal:controller.signal}));
    expect(state.upload).not.toHaveBeenCalled();expect(state.restore).not.toHaveBeenCalled();
  });
  it("downloads a historical file through private Storage access",async()=>{
    state.download.mockResolvedValue(true);
    render(<OrgDocumentVersionsDialog {...props} />);
    await act(async()=>{fireEvent.click(screen.getAllByTitle("Скачать")[1]);});
    expect(state.download).toHaveBeenCalledWith("org-documents",versions[1].file_url,"Лицензия",expect.objectContaining({signal:expect.any(AbortSignal),onProgress:expect.any(Function)}));
  });
  it("blocks duplicate clicks, keeps timeout visible, and retries with a truthful browser handoff receipt",async()=>{
    let finish!: (ok:boolean)=>void;
    let progress!: (phase:string)=>void;
    state.download.mockImplementation((_bucket,_path,_name,options)=>{
      progress=options.onProgress;
      return new Promise<boolean>(resolve=>{finish=resolve;});
    });
    render(<OrgDocumentVersionsDialog {...props} />);
    const button=screen.getAllByTitle("Скачать")[0];
    fireEvent.click(button);fireEvent.click(button);
    expect(state.download).toHaveBeenCalledOnce();expect(button).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Подготавливаем файл");
    await act(async()=>{progress("downloading");});
    expect(screen.getByRole("status")).toHaveTextContent("Загружаем файл");
    await act(async()=>{progress("timed_out");finish(false);});
    expect(screen.getByRole("alert")).toHaveTextContent("45 секунд");
    expect(screen.queryByText("Файл передан браузеру для сохранения.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Повторить скачивание"}));
    expect(state.download).toHaveBeenCalledTimes(2);
    await act(async()=>{progress("handed_to_browser");finish(true);});
    expect(screen.getByRole("status")).toHaveTextContent("Файл передан браузеру для сохранения.");
    expect(screen.queryByText(/^Файл сохранён/)).not.toBeInTheDocument();expect(button).toBeEnabled();
  });
  it("cancels a pending download on close and does not attach its late receipt to another document",async()=>{
    let finish!: (ok:boolean)=>void;
    let signal!:AbortSignal;
    state.download.mockImplementation((_bucket,_path,_name,options)=>{
      signal=options.signal;return new Promise<boolean>(resolve=>{finish=resolve;});
    });
    const view=render(<OrgDocumentVersionsDialog {...props} />);
    fireEvent.click(screen.getAllByTitle("Скачать")[0]);
    view.rerender(<OrgDocumentVersionsDialog {...props} open={false} />);
    expect(signal.aborted).toBe(true);
    view.rerender(<OrgDocumentVersionsDialog {...props} documentId="different-document" />);
    await act(async()=>{finish(true);});
    expect(screen.queryByText("Файл передан браузеру для сохранения.")).not.toBeInTheDocument();
  });
  it("shows readable history but no upload controls and disables restoration without write rights",()=>{
    render(<OrgDocumentVersionsDialog {...props} />);
    expect(state.read).toHaveBeenCalledWith("doc",false,undefined);
    expect(screen.getByText("Снимок на дату операции")).toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Загрузить новую версию"})).not.toBeInTheDocument();
    screen.getAllByTitle("Сделать актуальной").forEach(button=>expect(button).toBeDisabled());
  });
  it("restores an older version through the lifecycle callback, never the current version",async()=>{
    render(<OrgDocumentVersionsDialog {...props} canWrite />);
    const buttons=screen.getAllByTitle("Сделать актуальной");
    expect(buttons[0]).toBeDisabled();expect(buttons[1]).toBeEnabled();
    fireEvent.click(buttons[1]);
    await waitFor(()=>expect(state.refreshed).toHaveBeenCalledTimes(1));
    expect(state.restore).toHaveBeenCalledWith(versions[1]);
  });
  it("does not refresh the parent's current document on a rejected restore",async()=>{
    state.restore.mockResolvedValue(false);
    render(<OrgDocumentVersionsDialog {...props} canWrite />);
    fireEvent.click(screen.getAllByTitle("Сделать актуальной")[1]);
    await waitFor(()=>expect(state.restore).toHaveBeenCalledTimes(1));
    expect(state.refreshed).not.toHaveBeenCalled();
  });
  it("does not fetch document history while its dialog is closed",()=>{
    render(<OrgDocumentVersionsDialog {...props} open={false} canWrite />);
    expect(state.read).toHaveBeenCalledWith(null,true,undefined);
  });
  it("forwards an opt-in programme scope into history/download and suppresses a late browser receipt",async()=>{
    let live=true,finish!:(v:boolean)=>void;
    const transport={key:'programme-owner',assertCurrent:()=>{if(!live)throw Error('old context');},signUrl:vi.fn(),rpc:vi.fn(),readDocument:vi.fn(),readVersions:vi.fn(),saveUpload:vi.fn(),restore:vi.fn()};
    state.download.mockImplementation(()=>new Promise<boolean>(resolve=>{finish=resolve;}));
    render(<OrgDocumentVersionsDialog {...props} transport={transport} accept="application/pdf,.pdf"/>);
    expect(state.read).toHaveBeenCalledWith('doc',false,transport);
    fireEvent.click(screen.getAllByTitle('Скачать')[0]);
    expect(state.download).toHaveBeenCalledWith('org-documents',versions[0].file_url,'Лицензия',expect.objectContaining({assertCurrent:transport.assertCurrent,signUrl:transport.signUrl}));
    live=false;await act(async()=>finish(true));
    expect(screen.queryByText('Файл передан браузеру для сохранения.')).not.toBeInTheDocument();
  });
  it("enforces both template and programme guards before the scoped signer can hand off a file",async()=>{
    let templateLive=true;
    const templateGuard=vi.fn(()=>{if(!templateLive)throw Error("old template actor");});
    const transport={key:"programme-owner",assertCurrent:vi.fn(),signUrl:vi.fn(),rpc:vi.fn(),readDocument:vi.fn(),readVersions:vi.fn(),saveUpload:vi.fn(),restore:vi.fn()};
    state.download.mockImplementation(async(_bucket,_path,_name,options)=>{options.assertCurrent();templateLive=false;options.assertCurrent();return true;});
    render(<OrgDocumentVersionsDialog {...props} transport={transport} sourceOpenMode="download" sourceDownloadAssertCurrent={templateGuard}/>);
    fireEvent.click(screen.getAllByTitle("Скачать")[0]);
    await waitFor(()=>expect(state.download).toHaveBeenCalledOnce());
    expect(templateGuard).toHaveBeenCalled();expect(transport.assertCurrent).toHaveBeenCalled();
    expect(state.download).toHaveBeenCalledWith("org-documents",versions[0].file_url,"Лицензия",expect.objectContaining({signUrl:transport.signUrl,assertCurrent:expect.any(Function)}));
    expect(screen.queryByText("Файл передан браузеру для сохранения.")).not.toBeInTheDocument();
  });
});

