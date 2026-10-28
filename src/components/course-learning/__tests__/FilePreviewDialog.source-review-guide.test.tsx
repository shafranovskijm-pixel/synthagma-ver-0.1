import { cleanup,render,screen } from "@testing-library/react";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
const mock=vi.hoisted(()=>({role:"admin",read:vi.fn(),resolver:vi.fn()}));
const actor="10000000-0000-0000-0000-000000000001",own="4ac2c05a-d8b5-4e72-ba31-f2c743091d95";
vi.mock("@/hooks/useAuth",()=>({useAuth:()=>({user:{id:actor},userRole:mock.role})}));
vi.mock("@/utils/courseCache",()=>({captureOfflineAuthRevision:()=>1,captureOfflineContext:()=>({actorId:actor,revision:1}),subscribeOfflineAuthRevision:()=>()=>{}}));
vi.mock("@/hooks/useCourseFileDeliveryMode",()=>({useCourseFileDeliveryMode:()=>({view:{state:"frozen_required",context:{cohort:null}},refresh:vi.fn()})}));
vi.mock("@/hooks/useCourseExactFileDelivery",()=>({useCourseExactFileDelivery:(_scope:unknown,enabled:boolean)=>{mock.read(enabled);return{view:{state:"idle"},refresh:vi.fn()};}}));
vi.mock("@/components/ui/dialog",()=>({Dialog:({open,children}:any)=>open?<div>{children}</div>:null,DialogContent:({children}:any)=><div>{children}</div>,DialogHeader:({children}:any)=><header>{children}</header>,DialogTitle:({children}:any)=><h2>{children}</h2>}));
import { FilePreviewDialog } from "../FilePreviewDialog";
const reference={courseId:"30000000-0000-0000-0000-000000000001",organizationId:own,referenceKind:"course_document" as const,referenceId:"60000000-0000-0000-0000-000000000001",name:"Файл",fileType:"pdf",legacyUrl:"https://source.invalid/raw.pdf"};
beforeEach(()=>{vi.clearAllMocks();mock.role="admin";});afterEach(cleanup);
describe("ambiguous own-source preview stays held",()=>{
 it("offers the existing moderator review route without selecting a receipt or opening any source URL",()=>{const view=render(<FilePreviewDialog open onOpenChange={()=>{}} reference={reference} accessMode="staff_preview" allowDownload resolveLegacyUrl={mock.resolver}/>);expect(screen.getByRole("link",{name:"Открыть проверку каталога"}).getAttribute("href")).toBe("/admin?tab=marketplace");expect(view.container.querySelector("[src],iframe")).toBeNull();expect(view.container.innerHTML).not.toContain("https://source.invalid");expect(mock.read.mock.calls.every(call=>call[0]===false)).toBe(true);expect(mock.resolver).not.toHaveBeenCalled();});
 it("keeps the moderator-only route out of a normal learner view",()=>{mock.role="student";render(<FilePreviewDialog open onOpenChange={()=>{}} reference={reference} accessMode="learner" allowDownload/>);expect(screen.queryByRole("link")).toBeNull();expect(document.querySelector("[src],iframe")).toBeNull();});
});
