import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

let ffmpeg: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;

  ffmpeg = new FFmpeg();

  ffmpeg.on("log", ({ message }) => {
    console.log("[FFmpeg]", message);
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
  try {
    const ff = await getFFmpeg();

    const inputName = "input." + (file.name.split(".").pop()?.toLowerCase() || "mp4");
    const outputName = "output.mp4";

    ff.on("progress", ({ progress }) => {
      onProgress?.(Math.round(Math.min(progress * 100, 100)));
    });

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
    const blob = new Blob([uint8.buffer], { type: "video/mp4" });

    // Cleanup
    await ff.deleteFile(inputName).catch(() => {});
    await ff.deleteFile(outputName).catch(() => {});

    const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, ".mp4"), {
      type: "video/mp4",
    });

    console.log(
      `[VideoCompressor] Original: ${(file.size / 1024 / 1024).toFixed(1)} MB → Compressed: ${(compressedFile.size / 1024 / 1024).toFixed(1)} MB`
    );

    return compressedFile;
  } catch (error) {
    console.error("[VideoCompressor] Compression failed, using original file:", error);
    return file;
  }
}
