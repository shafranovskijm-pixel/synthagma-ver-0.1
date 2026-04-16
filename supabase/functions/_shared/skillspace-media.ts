// SkillSpace media download & reupload helpers

import { getCookieHeader, type CookieMap } from "./skillspace-auth.ts";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function extFromContentType(ct: string): string {
  const map: Record<string, string> = {
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
    "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg",
    "application/pdf": "pdf", "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  };
  return map[ct.split(";")[0].trim()] || "bin";
}

export function extFromUrl(u: string): string {
  try {
    const pathname = new URL(u).pathname;
    const m = pathname.match(/\.(\w{2,5})$/);
    return m ? m[1].toLowerCase() : "";
  } catch { return ""; }
}

export function createMediaTransfer(
  supabaseClient: any,
  supabaseUrl: string,
  organizationId: string,
  cookieMap: CookieMap,
  log: (msg: string) => void,
) {
  let filesTransferred = 0;
  let filesFailed = 0;

  const downloadAndReupload = async (fileUrl: string): Promise<string | null> => {
    if (!fileUrl || !fileUrl.startsWith("http")) return null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const headers: Record<string, string> = {
        "Cookie": getCookieHeader(cookieMap),
      };
      if (fileUrl.includes("skillspace.ru")) {
        headers["sec-fetch-dest"] = "empty";
        headers["sec-fetch-mode"] = "cors";
        headers["sec-fetch-site"] = "same-origin";
      }

      const res = await fetch(fileUrl, { headers, signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        log(`Download failed ${res.status}: ${fileUrl.substring(0, 100)}`);
        return null;
      }

      const contentLength = parseInt(res.headers.get("content-length") || "0", 10);
      if (contentLength > MAX_FILE_SIZE) {
        log(`File too large (${(contentLength / 1024 / 1024).toFixed(1)}MB), keeping original URL: ${fileUrl.substring(0, 80)}`);
        return null;
      }

      const ct = res.headers.get("content-type") || "application/octet-stream";

      if (ct.startsWith("video/") || fileUrl.match(/\.(mp4|webm|mov|avi|mkv)(\?|$)/i)) {
        log(`Skipping video file (memory constraint): ${fileUrl.substring(0, 80)}`);
        try { res.body?.cancel(); } catch {}
        return null;
      }

      const arrayBuf = await res.arrayBuffer();
      if (arrayBuf.byteLength > MAX_FILE_SIZE) {
        log(`File actually ${(arrayBuf.byteLength / 1024 / 1024).toFixed(1)}MB, skipping`);
        return null;
      }

      const blob = new Blob([arrayBuf], { type: ct });
      const ext = extFromUrl(fileUrl) || extFromContentType(ct);
      const storagePath = `${organizationId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadErr } = await supabaseClient.storage
        .from("course-files")
        .upload(storagePath, blob, { contentType: ct, upsert: true });

      if (uploadErr) {
        log(`Upload error: ${uploadErr.message} for ${fileUrl.substring(0, 80)}`);
        return null;
      }

      const publicUrl = `${supabaseUrl}/storage/v1/object/public/course-files/${storagePath}`;
      const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
      log(`Transferred ${sizeMB}MB → course-files/${storagePath}`);
      filesTransferred++;
      return publicUrl;
    } catch (err) {
      log(`Download error: ${String(err).substring(0, 100)} for ${fileUrl.substring(0, 80)}`);
      return null;
    }
  };

  const processLessonMedia = async (lessonContents: any[]) => {
    log(`Step 4.5: Downloading media files...`);
    for (let li = 0; li < lessonContents.length; li++) {
      const lesson = lessonContents[li];
      let blocks: any[];
      try { blocks = JSON.parse(lesson.content); } catch { continue; }
      let changed = false;

      for (const block of blocks) {
        if (block.type === "image" && block.imageSrc && block.imageSrc.startsWith("http")) {
          const newUrl = await downloadAndReupload(block.imageSrc);
          if (newUrl) { block.imageSrc = newUrl; changed = true; }
          else filesFailed++;
        }
        if (block.type === "video" && block.videoUrl && block.videoUrl.startsWith("http")) {
          const newUrl = await downloadAndReupload(block.videoUrl);
          if (newUrl) { block.videoUrl = newUrl; changed = true; }
          else filesFailed++;
        }
        if (block.type === "document" && block.documentUrl && block.documentUrl.startsWith("http")) {
          const newUrl = await downloadAndReupload(block.documentUrl);
          if (newUrl) { block.documentUrl = newUrl; changed = true; }
          else filesFailed++;
        }
        if (block.content && typeof block.content === "string" && block.content.includes("skillspace.ru")) {
          const hrefRegex = /href="(https?:\/\/[^"]*skillspace\.ru[^"]*)"/g;
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
        lessonContents[li].content = JSON.stringify(blocks);
      }

      if ((li + 1) % 10 === 0 || li === lessonContents.length - 1) {
        log(`Media processing: ${li + 1}/${lessonContents.length} lessons`);
      }
    }
  };

  return {
    downloadAndReupload,
    processLessonMedia,
    getStats: () => ({ filesTransferred, filesFailed }),
  };
}
