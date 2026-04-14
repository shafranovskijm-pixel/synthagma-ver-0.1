import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

let ffmpeg: FFmpeg | null = null;

const MAX_COMPRESSIBLE_SIZE = 1024 * 1024 * 1024; // 1 GB
const COMPRESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;

  ffmpeg = new FFmpeg();

  ffmpeg.on("log", ({ message }) => {
  });

  await ffmpeg.load({
    coreURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js",
    wasmURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm",
  });

  return ffmpeg;
}

export async function compressVideo(
  file: File,
  onProgress?: (progress: number) => void
): Promise<File> {
  // Refuse to compress files > 1 GB — FFmpeg.wasm will crash the browser
  if (file.size > MAX_COMPRESSIBLE_SIZE) {
    console.warn(`[VideoCompressor] File too large for browser compression (${(file.size / 1024 / 1024).toFixed(0)} MB > 1024 MB). Skipping.`);
    throw new Error('File too large for browser compression');
  }

  try {
    const ff = await getFFmpeg();

    const inputName = "input." + (file.name.split(".").pop()?.toLowerCase() || "mp4");
    const outputName = "output.mp4";

    ff.on("progress", ({ progress }) => {
      onProgress?.(Math.round(Math.min(progress * 100, 100)));
    });

    // Race compression against a timeout
    const compressionPromise = (async () => {
      await ff.writeFile(inputName, await fetchFile(file));

      await ff.exec([
        "-i", inputName,
        "-c:v", "libx264",
        "-crf", "28",
        "-preset", "fast",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "-y",
        outputName,
      ]);

      const data = await ff.readFile(outputName);
      const uint8 = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);
      const blob = new Blob([new Uint8Array(uint8)], { type: "video/mp4" });

      // Cleanup
      await ff.deleteFile(inputName).catch(() => {});
      await ff.deleteFile(outputName).catch(() => {});

      return new File([blob], file.name.replace(/\.[^.]+$/, ".mp4"), {
        type: "video/mp4",
      });
    })();

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Compression timeout (5 min)')), COMPRESSION_TIMEOUT_MS);
    });

    const compressedFile = await Promise.race([compressionPromise, timeoutPromise]);

    return compressedFile;
  } catch (error) {
    console.error("[VideoCompressor] Compression failed, using original file:", error);
    throw error; // Let caller handle fallback
  }
}
