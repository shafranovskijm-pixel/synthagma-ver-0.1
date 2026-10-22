import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actor,org,course,enrollment,uid } from "./fixtures";
const mock=vi.hoisted(()=>({current:true}));
vi.mock("@/utils/courseCache",()=>({captureOfflineContext:()=>({actorId:"00000000-0000-4000-8000-000000000001",revision:1}),isOfflineActorCurrent:()=>mock.current}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{}}));
import { captureIssuanceScope } from "../client";
import { downloadIssuanceBlob, verifyIssuanceExport } from "../export";
const scope=()=>captureIssuanceScope(org,{kind:"organization"},()=>true);
const query={kind:"export" as const,selection:{kind:"enrollments" as const,course_id:course,enrollment_ids:[enrollment]},format:"canonical_snapshot" as const};
const snapshot=()=>({schema_version:1,kind:"education_issuance_snapshot",organization_id:org,scope:{kind:"organization"},captured_at:"2026-10-22T10:00:00Z",captured_by:actor,
  records:[],history:[],missing:[{enrollment_id:enrollment,code:"NOT_ISSUED"}],not_official_submission:true});
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,"0")).join("");
async function artifact(raw:unknown=snapshot(),html="<!doctype html><html><body><p>Документ ещё не выдан</p></body></html>"){
  const snapshot_json=JSON.stringify(raw);
  return {snapshot_json,snapshot_sha256:await hash(snapshot_json),html,html_sha256:await hash(html),utf8_bytes:new TextEncoder().encode(snapshot_json).length+new TextEncoder().encode(html).length};
}
beforeEach(()=>{mock.current=true;vi.stubGlobal("crypto",webcrypto);});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
describe("canonical read-only issuance export",()=>{
  it("keeps an unissued assignment explicit and validates actual Cyrillic UTF-8 bytes",async()=>{
    const file=await artifact();expect(file.utf8_bytes).toBeGreaterThan(file.snapshot_json.length+file.html.length);
    await expect(verifyIssuanceExport(scope(),file,query)).resolves.toMatchObject({records:[],missing:[{code:"NOT_ISSUED"}],not_official_submission:true});
    await expect(verifyIssuanceExport(scope(),{...file,utf8_bytes:file.snapshot_json.length+file.html.length},query)).rejects.toThrow();
  });
  it("rejects a changed snapshot even when the display HTML looks valid",async()=>{
    const file=await artifact();file.snapshot_json=file.snapshot_json.replace("NOT_ISSUED","ANNULLED_ONLY");
    await expect(verifyIssuanceExport(scope(),file,query)).rejects.toThrow();
  });
  it("does not accept a foreign actor or silently omitted selected assignment, even with correct hashes",async()=>{
    await expect(verifyIssuanceExport(scope(),await artifact({...snapshot(),captured_by:uid(99)}),query)).rejects.toThrow();
    await expect(verifyIssuanceExport(scope(),await artifact({...snapshot(),missing:[]}),query)).rejects.toThrow();
  });
  it("rejects scripts and external content independently of artifact checksums",async()=>{
    for(const html of ['<html><script>alert(1)</script></html>','<html><img src="https://example.invalid/x"></html>','<html><p onclick="alert(1)">Текст</p></html>']){
      await expect(verifyIssuanceExport(scope(),await artifact(snapshot(),html),query)).rejects.toThrow();
    }
  });
  it("does not promote a canonical source snapshot into an official FRDO submission",async()=>{
    const file=await artifact({...snapshot(),not_official_submission:false});
    await expect(verifyIssuanceExport(scope(),file,query)).rejects.toThrow();
  });
  it("attaches its anchor and keeps the object URL alive until the browser can start saving",()=>{
    vi.useFakeTimers();const revoke=vi.fn(),create=vi.fn(()=>"blob:synthetic");vi.stubGlobal("URL",{createObjectURL:create,revokeObjectURL:revoke});const click=vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(function(this:HTMLAnchorElement){expect(this.isConnected).toBe(true);expect(this.download).toBe("Факты.json");});
    downloadIssuanceBlob(scope(),new Blob(["Факты"]),"Факты.json");expect(click).toHaveBeenCalledOnce();expect(document.querySelector('a[download="Факты.json"]')).toBeNull();vi.advanceTimersByTime(999);expect(revoke).not.toHaveBeenCalled();vi.advanceTimersByTime(1);expect(revoke).toHaveBeenCalledWith("blob:synthetic");
  });
  it("does not start a download when access changes after creating its URL and immediately cleans it up",()=>{
    const revoke=vi.fn();vi.stubGlobal("URL",{createObjectURL:()=>{mock.current=false;return "blob:rejected";},revokeObjectURL:revoke});const click=vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(()=>undefined);
    expect(()=>downloadIssuanceBlob(scope(),new Blob(["Факты"]),"Факты.json")).toThrow();expect(click).not.toHaveBeenCalled();expect(revoke).toHaveBeenCalledWith("blob:rejected");
  });
  it("rejects the same bytes after the actor access revision changed",async()=>{
    const captured=scope(),file=await artifact();mock.current=false;
    await expect(verifyIssuanceExport(captured,file,query)).rejects.toMatchObject({code:"ACCESS_DENIED"});
  });
});
