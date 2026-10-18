import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
const state=vi.hoisted(()=>({read:vi.fn(),upload:vi.fn(),restore:vi.fn(),refreshed:vi.fn(),download:vi.fn()}));
vi.mock("@/utils/storageHelpers",()=>({downloadPrivateFile:state.download}));
vi.mock("@/hooks/useOrgDocumentVersions",()=>({useOrgDocumentVersions:state.read}));
import { OrgDocumentVersionsDialog } from "../OrgDocumentVersionsDialog";
const versions=[
  {id:"current",document_id:"doc",organization_id:"org",version_number:2,file_url:"https://example.test/new.pdf",created_at:"2026-10-18T00:00:00Z",event_kind:"upload"},
  {id:"old",document_id:"doc",organization_id:"org",version_number:1,file_url:"https://example.test/old.pdf",created_at:"2026-10-18T00:00:00Z",event_kind:"baseline"},
];
const props={open:true,onOpenChange:vi.fn(),documentId:"doc",documentName:"Лицензия",organizationId:"org",onRestored:state.refreshed};
beforeEach(()=>{
  vi.clearAllMocks();
  state.upload.mockResolvedValue(true);state.restore.mockResolvedValue(true);
  state.read.mockImplementation((_id,canWrite)=>({versions,loading:false,currentVersionId:"current",canChange:canWrite,
    uploadVersion:state.upload,restoreVersion:state.restore}));
});
describe("organization version history permissions and event UI",()=>{
  it("downloads a historical file through private Storage access",()=>{
    state.download.mockResolvedValue(true);
    render(<OrgDocumentVersionsDialog {...props} />);
    fireEvent.click(screen.getAllByTitle("Скачать")[1]);
    expect(state.download).toHaveBeenCalledWith("org-documents",versions[1].file_url,"Лицензия");
  });
  it("shows readable history but no upload controls and disables restoration without write rights",()=>{
    render(<OrgDocumentVersionsDialog {...props} />);
    expect(state.read).toHaveBeenCalledWith("doc",false);
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
    expect(state.read).toHaveBeenCalledWith(null,true);
  });
});

