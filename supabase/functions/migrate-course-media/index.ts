import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB — edge function memory safe limit

async function runMigration(courseId: string, organizationId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const log = (msg: string) => console.log(`[migrate-media] ${msg}`);

  const { data: lessons, error: lessonsError } = await supabase
    .from("lessons")
    .select("id, title, content, type")
    .eq("course_id", courseId)
    .order("order_index");

  if (lessonsError || !lessons) {
    log(`Error fetching lessons: ${lessonsError?.message}`);
    return { filesTransferred: 0, filesFailed: 0, filesSkipped: 0, error: lessonsError?.message };
  }

  log(`Found ${lessons.length} lessons`);

  let filesTransferred = 0;
  let filesFailed = 0;
  let filesSkipped = 0;

  const extFromContentType = (ct: string): string => {
    const map: Record<string, string> = {
      "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
      "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
      "application/pdf": "pdf", "application/msword": "doc",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    };
    return map[ct.split(";")[0].trim()] || "bin";
  };

  const extFromUrl = (u: string): string => {
    try {
      const m = new URL(u).pathname.match(/\.(\w{2,5})$/);
      return m ? m[1].toLowerCase() : "";
    } catch { return ""; }
  };

  const isExternalUrl = (url: string): boolean => {
    if (!url || !url.startsWith("http")) return false;
    if (url.includes("supabase") || url.includes(supabaseUrl)) return false;
    return true;
  };

  const downloadAndReupload = async (fileUrl: string): Promise<string | null> => {
    if (!isExternalUrl(fileUrl)) { filesSkipped++; return null; }
    try {
      // HEAD request first to check size without downloading
      try {
        const headRes = await fetch(fileUrl, { method: "HEAD", signal: AbortSignal.timeout(10000) });
        const contentLength = parseInt(headRes.headers.get("content-length") || "0", 10);
        if (contentLength > MAX_FILE_SIZE) {
          log(`Skipping large file (${(contentLength / 1024 / 1024).toFixed(0)}MB): ${fileUrl.substring(0, 80)}`);
          filesSkipped++;
          return null;
        }
      } catch { /* HEAD not supported, proceed with GET */ }

      const res = await fetch(fileUrl, { signal: AbortSignal.timeout(60000) });
      if (!res.ok) { log(`Download failed ${res.status}`); return null; }

      // Double-check content-length from GET response
      const cl = parseInt(res.headers.get("content-length") || "0", 10);
      if (cl > MAX_FILE_SIZE) {
        log(`Skipping large file (${(cl / 1024 / 1024).toFixed(0)}MB)`);
        await res.body?.cancel();
        filesSkipped++;
        return null;
      }

      const blob = await res.blob();
      if (blob.size > MAX_FILE_SIZE) {
        log(`Downloaded blob too large (${(blob.size / 1024 / 1024).toFixed(0)}MB), discarding`);
        filesSkipped++;
        return null;
      }

      const ct = res.headers.get("content-type") || "application/octet-stream";
      const ext = extFromUrl(fileUrl) || extFromContentType(ct);
      const storagePath = `${organizationId}/${courseId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("course-files")
        .upload(storagePath, blob, { contentType: ct, upsert: true });

      if (uploadErr) { log(`Upload error: ${uploadErr.message}`); return null; }

      const publicUrl = `${supabaseUrl}/storage/v1/object/public/course-files/${storagePath}`;
      log(`OK ${(blob.size / 1024 / 1024).toFixed(1)}MB → ${storagePath}`);
      filesTransferred++;
      return publicUrl;
    } catch (err) {
      log(`Error: ${String(err).substring(0, 100)}`);
      return null;
    }
  };

  for (let li = 0; li < lessons.length; li++) {
    const lesson = lessons[li];
    if (!lesson.content) continue;

    let blocks: any[];
    try { blocks = JSON.parse(lesson.content); } catch { continue; }
    if (!Array.isArray(blocks)) continue;

    let changed = false;

    for (const block of blocks) {
      if (block.type === "image" && block.imageSrc && isExternalUrl(block.imageSrc)) {
        const newUrl = await downloadAndReupload(block.imageSrc);
        if (newUrl) { block.imageSrc = newUrl; changed = true; }
        else filesFailed++;
      }
      if (block.type === "video" && block.videoUrl && isExternalUrl(block.videoUrl)) {
        const newUrl = await downloadAndReupload(block.videoUrl);
        if (newUrl) { block.videoUrl = newUrl; changed = true; }
        else filesFailed++;
      }
      if (block.type === "document" && block.documentUrl && isExternalUrl(block.documentUrl)) {
        const newUrl = await downloadAndReupload(block.documentUrl);
        if (newUrl) { block.documentUrl = newUrl; changed = true; }
        else filesFailed++;
      }
      if (block.content && typeof block.content === "string") {
        const hrefRegex = /href="(https?:\/\/[^"]*(?:skillspace\.ru|selstorage\.ru)[^"]*)"/g;
        let match;
        const replacements: Array<[string, string]> = [];
        while ((match = hrefRegex.exec(block.content)) !== null) {
          const origUrl = match[1];
          if (origUrl.match(/\.(pdf|doc|docx|xlsx|pptx|mp4|mp3|zip|rar)(\?|$)/i)) {
            const newUrl = await downloadAndReupload(origUrl);
            if (newUrl) replacements.push([origUrl, newUrl]);
            else filesFailed++;
          }
        }
        for (const [orig, repl] of replacements) {
          block.content = block.content.replaceAll(orig, repl);
          changed = true;
        }
      }
    }

    if (changed) {
      await supabase.from("lessons").update({ content: JSON.stringify(blocks) }).eq("id", lesson.id);
    }
    log(`Lesson ${li + 1}/${lessons.length} done`);
  }

  log(`Complete: ${filesTransferred} transferred, ${filesFailed} failed, ${filesSkipped} skipped`);
  return { filesTransferred, filesFailed, filesSkipped };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { courseId, organizationId } = await req.json();
    if (!courseId || !organizationId) {
      return new Response(
        JSON.stringify({ error: "courseId и organizationId обязательны" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Run migration in background using waitUntil
    const resultPromise = runMigration(courseId, organizationId);

    // Use EdgeRuntime.waitUntil to keep the function alive in background
    // @ts-ignore EdgeRuntime is a Deno Deploy global
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(resultPromise);
      return new Response(
        JSON.stringify({ success: true, message: "Миграция запущена в фоне", background: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fallback: wait for result directly
    const result = await resultPromise;
    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Ошибка: " + (error instanceof Error ? error.message : String(error)) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
