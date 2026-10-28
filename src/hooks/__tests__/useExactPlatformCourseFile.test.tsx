import { act,cleanup,renderHook,waitFor } from "@testing-library/react";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { useExactPlatformCourseFile } from "../useExactPlatformCourseFile";
import type { ExactPlatformCourseFileLease,SealedPlatformFileContext,SelectedPlatformFileReference } from "@/lib/exactPlatformCourseFile";
const mock=vi.hoisted(()=>({actor:"00000000-0000-4000-8000-000000000001",role:"admin",revision:1,listeners:new Set<()=>void>(),context:vi.fn(),bytes:vi.fn()}));
vi.mock("@/hooks/useAuth",()=>({useAuth:()=>({user:{id:mock.actor},userRole:mock.role,loading:false,authError:null})}));
vi.mock("@/api/exactPlatformCourseFile",()=>({exactPlatformCourseFile:{context:mock.context,bytes:mock.bytes}}));
vi.mock("@/utils/courseCache",()=>({captureOfflineAuthRevision:()=>mock.revision,captureOfflineContext:()=>({actorId:mock.actor,revision:mock.revision}),subscribeOfflineAuthRevision:(listener:()=>void)=>{mock.listeners.add(listener);return()=>mock.listeners.delete(listener);}}));
const id=(n:number)=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const target=():SelectedPlatformFileReference=>({actorId:id(1),marketplaceId:id(2),courseId:id(3),proposalId:id(4),proposalEditionSha256:"a".repeat(64),referenceKind:"course_document",referenceId:id(5)});
// Gateway exact12/5/binary integrity is tested separately. This suite observes
// hook scope lifetime only with an opaque sealed context and lease.
const sealed={state:"bytes_sealed"} as SealedPlatformFileContext;
const lease=(name:string):ExactPlatformCourseFileLease=>({url:"blob:"+name,mime:"application/pdf",previewKind:"pdf",context:sealed,release:vi.fn()});
function delayed<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return{promise,resolve};}
beforeEach(()=>{mock.actor=id(1);mock.role="admin";mock.revision=1;mock.listeners.clear();mock.context.mockReset();mock.bytes.mockReset();mock.context.mockResolvedValue(sealed);Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe("selected source proposal lease fences",()=>{
 it("does not acquire source bytes for another actor or a non-moderator",()=>{mock.role="student";const hook=renderHook(()=>useExactPlatformCourseFile(target(),true));expect(hook.result.current.view.state).toBe("idle");expect(mock.context).not.toHaveBeenCalled();mock.role="admin";mock.actor=id(90);hook.rerender();expect(mock.context).not.toHaveBeenCalled();});
 it("keeps missing metadata or an unsealed receipt held without bytes",async()=>{mock.context.mockResolvedValue({state:"held",receipt:null});const hook=renderHook(()=>useExactPlatformCourseFile(target(),true));await waitFor(()=>expect(hook.result.current.view.state).toBe("held"));expect(mock.bytes).not.toHaveBeenCalled();});
 it("never accepts an old proposal answer after A to B to A selection",async()=>{
  const a1=delayed<SealedPlatformFileContext>(),b=delayed<SealedPlatformFileContext>(),a3=delayed<SealedPlatformFileContext>();mock.context.mockReturnValueOnce(a1.promise).mockReturnValueOnce(b.promise).mockReturnValueOnce(a3.promise);mock.bytes.mockResolvedValue(lease("current"));
  const hook=renderHook(({selection})=>useExactPlatformCourseFile(selection,true),{initialProps:{selection:target()}});hook.rerender({selection:{...target(),proposalId:id(40)}});hook.rerender({selection:target()});
  await act(async()=>{a1.resolve(sealed);b.resolve(sealed);});expect(mock.bytes).not.toHaveBeenCalled();await act(async()=>a3.resolve(sealed));await waitFor(()=>expect(hook.result.current.view.state).toBe("exact"));expect(mock.bytes).toHaveBeenCalledTimes(1);
 });
 it("releases a late byte lease when selected reference changed",async()=>{
  const old=delayed<ExactPlatformCourseFileLease>(),stale=lease("old"),fresh=lease("fresh");mock.bytes.mockReturnValueOnce(old.promise).mockResolvedValueOnce(fresh);
  const hook=renderHook(({selection})=>useExactPlatformCourseFile(selection,true),{initialProps:{selection:target()}});await waitFor(()=>expect(mock.bytes).toHaveBeenCalledTimes(1));hook.rerender({selection:{...target(),referenceId:id(50)}});await waitFor(()=>expect(hook.result.current.view.state).toBe("exact"));await act(async()=>old.resolve(stale));expect(stale.release).toHaveBeenCalledTimes(1);expect(hook.result.current.view.state==="exact"&&hook.result.current.view.lease.url).toBe("blob:fresh");
 });
 it("revokes private bytes synchronously when Auth access changes, then holds denied rereads",async()=>{
  const file=lease("before-revoke");mock.bytes.mockResolvedValue(file);const hook=renderHook(()=>useExactPlatformCourseFile(target(),true));await waitFor(()=>expect(hook.result.current.view.state).toBe("exact"));mock.context.mockRejectedValue(new Error("revoked"));
  act(()=>{mock.revision++;for(const listener of mock.listeners)listener();expect(file.release).toHaveBeenCalledTimes(1);});expect(hook.result.current.view.state).not.toBe("exact");await waitFor(()=>expect(hook.result.current.view.state).toBe("held"));
 });
 it("revokes on close/unmount and ignores late metadata",async()=>{
  const pending=delayed<SealedPlatformFileContext>();mock.context.mockReturnValue(pending.promise);const hook=renderHook(({enabled})=>useExactPlatformCourseFile(target(),enabled),{initialProps:{enabled:true}});const signal=mock.context.mock.calls[0][1] as AbortSignal;hook.rerender({enabled:false});expect(signal.aborted).toBe(true);hook.unmount();await act(async()=>pending.resolve(sealed));expect(mock.bytes).not.toHaveBeenCalled();
 });
});
