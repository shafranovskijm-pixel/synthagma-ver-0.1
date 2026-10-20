// @vitest-environment node
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";

const MiB = 1024 * 1024;
const organizationId = "00000000-0000-4000-8000-000000000100";

// The handler observes real File instances, with synthetic declared sizes so
// boundary tests never allocate30MiB. HTTP multipart parsing itself is mocked.
class FixtureFile extends File {
  declaredSize: number | undefined;
  textReads = 0;
  bufferReads = 0;
  constructor(content: string | ArrayBuffer, name: string, declaredSize?: number) {
    super([content], name);
    this.declaredSize = declaredSize;
  }
  override get size() { return this.declaredSize ?? super.size; }
  override text() { this.textReads++; return super.text(); }
  override arrayBuffer() { this.bufferReads++; return super.arrayBuffer(); }
}

function actualHandler(options: { invalidAuth?: boolean; allowed?: boolean; permissionError?: boolean } = {}) {
  const entryReads: string[] = [];
  const getUser = vi.fn(async () => ({
    data: { user: options.invalidAuth ? null : { id: "00000000-0000-4000-8000-000000000001" } },
    error: options.invalidAuth ? { message: "Synthetic invalid token" } : null,
  }));
  const rpc = vi.fn(async (_name: string, _args: unknown) => ({
    data: options.allowed !== false,
    error: options.permissionError ? { message: "Synthetic permission lookup failed" } : null,
  }));
  const createClient = vi.fn(() => ({ auth: { getUser }, rpc }));
  const loadAsync = vi.fn(async (buffer: ArrayBuffer) => {
    const archive = await JSZip.loadAsync(buffer); // Actual local ZIP decoding.
    archive.forEach((path, entry) => {
      const originalAsync = entry.async.bind(entry);
      // Count actual entry-content reads without changing the data returned by JSZip.
      entry.async = ((...args: Parameters<typeof entry.async>) => {
        entryReads.push(path);
        return originalAsync(...args);
      }) as typeof entry.async;
    });
    return archive;
  });
  const network = vi.fn(() => { throw new Error("Network forbidden in this local handler test"); });
  let handler!: (req: Request) => Promise<Response>;
  const source = readFileSync("supabase/functions/import-course/index.ts", "utf8");
  const ast = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
  const stripped = [...ast.statements.filter(ts.isImportDeclaration)].reverse().reduce(
    (text, statement) => text.slice(0, statement.getFullStart()) + text.slice(statement.end), source,
  );
  const executable = ts.transpileModule(stripped, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
  }).outputText;
  const dependencies = {
    serve: (fn: typeof handler) => { handler = fn; }, createClient,
    JSZip: { loadAsync },
    mammoth: { convertToHtml: network, images: { imgElement: network } },
    Deno: { env: { get: (key: string) => ({
      SUPABASE_URL: "https://synthetic.invalid", SUPABASE_ANON_KEY: "SYNTHETIC_PUBLIC_KEY",
    } as Record<string,string>)[key] } },
    File: FixtureFile, fetch: network, crypto: { randomUUID },
    console: { log() {}, warn() {}, error() {} },
  };
  new Function(...Object.keys(dependencies), executable)(...Object.values(dependencies));
  async function request(files: FixtureFile[], settings: { authorization?: boolean; organization?: string } = {}) {
    const entries: Array<[string, string | File]> = [["organization_id", settings.organization ?? organizationId],
      ...files.map((file, index) => ["file-" + index, file] as [string, File])];
    const formData = vi.fn(async () => ({
      get: (key: string) => entries.find(([name]) => name === key)?.[1] ?? null,
      entries: () => entries[Symbol.iterator](),
    }) as unknown as FormData);
    const headers: Record<string,string> = { "content-type": "multipart/form-data; boundary=SYNTHETIC" };
    if(settings.authorization !== false) headers.authorization = "Bearer SYNTHETIC_USER_JWT";
    const req = new Request("https://synthetic.invalid/import-course", { method: "POST", headers });
    Object.defineProperty(req, "formData", { value: formData });
    const response = await handler(req);
    return { response, body: await response.json(), formData };
  }
  return { request, getUser, rpc, createClient, entryReads, loadAsync, network,
    options: () => handler(new Request("https://synthetic.invalid/import-course", { method: "OPTIONS" })) };
}

async function zipFile(count: number, extras: string[] = []) {
  const archive = new JSZip();
  const names = Array.from({ length: count }, (_, index) => `lesson-${String(index + 1).padStart(2,"0")}.txt`);
  for(const name of names) archive.file("section/" + name, "Unique contents for " + name);
  for(const path of extras) archive.file(path, "Ignored synthetic file");
  return { file: new FixtureFile(await archive.generateAsync({ type: "arraybuffer" }), "course.zip"), names };
}
function expectNoContentReads(f: ReturnType<typeof actualHandler>, files: FixtureFile[]) {
  expect(f.entryReads).toEqual([]);
  for(const file of files) expect(file.textReads + file.bufferReads).toBe(0);
  expect(f.network).not.toHaveBeenCalled();
}

describe("import-course actual handler technical limits",()=>{
  it("preserves every one of25ZIPfiles with its actual content and order",async()=>{
    const f=actualHandler(), {file,names}=await zipFile(25);
    const {response,body}=await f.request([file]);
    expect(response.status).toBe(200);
    expect(body).toMatchObject({success:true,filesCount:25,sectionsCount:25});
    expect(body.lessons.map((lesson:any)=>lesson.metadata.fileName)).toEqual(names);
    expect(body.lessons.map((lesson:any)=>lesson.content)).toEqual(names.map(name=>`<p>Unique contents for ${name}</p>`));
    expect(f.entryReads).toHaveLength(25);
    expect(f.rpc).toHaveBeenCalledWith("can_access_organization",{_organization_id:organizationId,_permission:"courses.write"});
    expect(f.network).not.toHaveBeenCalled();
  });
  it("rejects all26ZIPfiles before reading any entry, with no partial preview",async()=>{
    const f=actualHandler(),{file}=await zipFile(26);
    const {response,body}=await f.request([file]);
    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body).not.toHaveProperty("lessons");
    expect(body.error).toContain("26");expect(body.error).toContain("25");
    expect(body.error).toMatch(/Разделите архив/);
    expect(f.loadAsync).toHaveBeenCalledOnce();expect(f.entryReads).toEqual([]);
    expect(f.network).not.toHaveBeenCalled();
  });
  it("does not count unsupported files, directories or existing hidden/system-file exclusions",async()=>{
    const f=actualHandler(),{file,names}=await zipFile(25,["ignored.png","ignored.exe",".hidden.txt","__MACOSX/system.txt","section/.hidden.md"]);
    const {response,body}=await f.request([file]);
    expect(response.status).toBe(200);expect(body.filesCount).toBe(25);
    expect(body.lessons.map((lesson:any)=>lesson.metadata.fileName)).toEqual(names);
    expect(f.entryReads).toEqual(names.map(name=>"section/"+name));
  });
  it("accepts the exact30MiB per-file and total boundary without allocating a large blob",async()=>{
    const f=actualHandler(),file=new FixtureFile("Tiny body", "boundary.txt",30*MiB);
    const {response,body}=await f.request([file]);
    expect(response.status).toBe(200);expect(body).toMatchObject({success:true,filesCount:1});
    expect(body.lessons).toHaveLength(1);expect(file.textReads).toBe(1);
  });
  it("rejects31MiB before content parsing and names the real30MiB file limit",async()=>{
    const f=actualHandler(),file=new FixtureFile("Tiny body","oversize.txt",31*MiB);
    const {response,body}=await f.request([file]);
    expect(response.status).toBe(400);expect(body.success).toBe(false);
    expect(body.error).toContain("30 МиБ");expect(body.error).toContain("31.0 МиБ");expect(body.error).not.toContain("50");
    expect(body).not.toHaveProperty("lessons");expectNoContentReads(f,[file]);
  });
  it("accepts exactly30MiB combined across individually valid files",async()=>{
    const f=actualHandler(),files=[new FixtureFile("First","a.txt",16*MiB),new FixtureFile("Second","b.txt",14*MiB)];
    const {response,body}=await f.request(files);
    expect(response.status).toBe(200);expect(body).toMatchObject({success:true,filesCount:2});expect(body.lessons).toHaveLength(2);
  });
  it("rejects combined31MiB before parsing and names the real30MiB total limit",async()=>{
    const f=actualHandler(),files=[new FixtureFile("First","a.txt",16*MiB),new FixtureFile("Second","b.txt",15*MiB)];
    const {response,body}=await f.request(files);
    expect(response.status).toBe(400);expect(body.success).toBe(false);
    expect(body.error).toContain("Общий размер");expect(body.error).toContain("30 МиБ");expect(body.error).not.toContain("50");
    expect(body).not.toHaveProperty("lessons");expectNoContentReads(f,files);
  });
  it("preserves the separate30regular-file request guard without parsing a partial set",async()=>{
    const f=actualHandler(),files=Array.from({length:31},(_,i)=>new FixtureFile("Tiny",`file-${i}.txt`));
    const {response,body}=await f.request(files);
    expect(response.status).toBe(400);expect(body.success).toBe(false);
    expect(body.error).toContain("31");expect(body.error).toContain("30");expectNoContentReads(f,files);
  });
  it("returns401before multipart or file processing when the bearer token is absent",async()=>{
    const f=actualHandler(),file=new FixtureFile("Tiny","a.txt");
    const {response,body,formData}=await f.request([file],{authorization:false});
    expect(response.status).toBe(401);expect(body.success).toBe(false);
    expect(formData).not.toHaveBeenCalled();expect(f.createClient).not.toHaveBeenCalled();expectNoContentReads(f,[file]);
  });
  it("returns401before multipart or file processing when Auth rejects the token",async()=>{
    const f=actualHandler({invalidAuth:true}),file=new FixtureFile("Tiny","a.txt");
    const {response,formData}=await f.request([file]);
    expect(response.status).toBe(401);expect(formData).not.toHaveBeenCalled();expect(f.rpc).not.toHaveBeenCalled();expectNoContentReads(f,[file]);
  });
  it.each([{allowed:false},{permissionError:true}])("preserves403before file processing when tenant permission is denied: %j",async options=>{
    const f=actualHandler(options),{file}=await zipFile(26);
    const {response,body}=await f.request([file]);
    expect(response.status).toBe(403);expect(body.success).toBe(false);
    expect(f.rpc).toHaveBeenCalledWith("can_access_organization",{_organization_id:organizationId,_permission:"courses.write"});
    expect(f.loadAsync).not.toHaveBeenCalled();expectNoContentReads(f,[file]);
  });
  it("preserves explicit valid-tenant selection before permission or file processing",async()=>{
    const f=actualHandler(),file=new FixtureFile("Tiny","a.txt");
    const {response}=await f.request([file],{organization:"not-a-tenant"});
    expect(response.status).toBe(400);expect(f.rpc).not.toHaveBeenCalled();expectNoContentReads(f,[file]);
  });
  it("preserves unauthenticated CORS preflight without parsing or external requests",async()=>{
    const f=actualHandler(),response=await f.options();
    expect(response.status).toBe(200);expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(f.createClient).not.toHaveBeenCalled();expect(f.network).not.toHaveBeenCalled();
  });
});
