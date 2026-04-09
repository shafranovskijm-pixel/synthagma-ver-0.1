import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const debugLog: string[] = [];
    const log = (msg: string) => {
      console.log(msg);
      debugLog.push(msg);
    };

    // Fetch all lessons for the course
    const { data: lessons, error: lessonsError } = await supabase
      .from("lessons")
      .select("id, title, content, type")
      .eq("course_id", courseId)
      .order("order_index");

    if (lessonsError) {
      return new Response(
        JSON.stringify({ error: "Ошибка загрузки уроков: " + lessonsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log(`Found ${lessons.length} lessons for course ${courseId}`);

    let filesTransferred = 0;
    let filesFailed = 0;
    let filesSkipped = 0;

    const extFromContentType = (ct: string): string => {
      const map: Record<string, string> = {
        "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
        "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg",
        "application/pdf": "pdf", "application/msword": "doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
        "audio/mpeg": "mp3", "audio/wav": "wav",
      };
      return map[ct.split(";")[0].trim()] || "bin";
    };

    const extFromUrl = (u: string): string => {
      try {
        const pathname = new URL(u).pathname;
        const m = pathname.match(/\.(\w{2,5})$/);
        return m ? m[1].toLowerCase() : "";
      } catch { return ""; }
    };

    const isExternalUrl = (url: string): boolean => {
      if (!url || !url.startsWith("http")) return false;
      // Skip URLs already in our storage
      if (url.includes("supabase") || url.includes(supabaseUrl)) return false;
      return true;
    };

    const downloadAndReupload = async (fileUrl: string): Promise<string | null> => {
      if (!isExternalUrl(fileUrl)) {
        filesSkipped++;
        return null;
      }
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);

        const res = await fetch(fileUrl, { signal: controller.signal });
        clearTimeout(timeout);

        if (!res.ok) {
          log(`Download failed ${res.status}: ${fileUrl.substring(0, 100)}`);
          return null;
        }

        const contentLength = parseInt(res.headers.get("content-length") || "0", 10);
        if (contentLength > 500 * 1024 * 1024) {
          log(`File too large (${(contentLength / 1024 / 1024).toFixed(1)}MB), skipping`);
          return null;
        }

        const blob = await res.blob();
        const ct = res.headers.get("content-type") || "application/octet-stream";
        const ext = extFromUrl(fileUrl) || extFromContentType(ct);
        const storagePath = `${organizationId}/${courseId}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from("course-files")
          .upload(storagePath, blob, { contentType: ct, upsert: true });

        if (uploadErr) {
          log(`Upload error: ${uploadErr.message}`);
          return null;
        }

        const publicUrl = `${supabaseUrl}/storage/v1/object/public/course-files/${storagePath}`;
        const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
        log(`Transferred ${sizeMB}MB → course-files/${storagePath}`);
        filesTransferred++;
        return publicUrl;
      } catch (err) {
        log(`Download error: ${String(err).substring(0, 120)}`);
        return null;
      }
    };

    // Process each lesson
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
        // Handle inline links in content
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
        const { error: updateErr } = await supabase
          .from("lessons")
          .update({ content: JSON.stringify(blocks) })
          .eq("id", lesson.id);

        if (updateErr) {
          log(`Failed to update lesson "${lesson.title}": ${updateErr.message}`);
        } else {
          log(`Updated lesson "${lesson.title}"`);
        }
      }

      if ((li + 1) % 5 === 0 || li === lessons.length - 1) {
        log(`Progress: ${li + 1}/${lessons.length} lessons processed`);
      }
    }

    log(`Done: ${filesTransferred} transferred, ${filesFailed} failed, ${filesSkipped} skipped`);

    return new Response(
      JSON.stringify({
        success: true,
        filesTransferred,
        filesFailed,
        filesSkipped,
        debug: debugLog,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Migration error:", error);
    return new Response(
      JSON.stringify({ error: "Ошибка миграции: " + (error instanceof Error ? error.message : String(error)) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
