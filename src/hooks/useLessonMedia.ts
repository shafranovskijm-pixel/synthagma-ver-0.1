import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke, safeFetch } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { ContentBlock, blocksToJson as blocksToJsonFn } from "@/components/course-builder/BlockEditor";
import { useBackgroundUploads } from "@/contexts/BackgroundUploadsContext";

const SIZE_100MB = 100 * 1024 * 1024;
const SIZE_500MB = 500 * 1024 * 1024;
const SIZE_1GB = 1024 * 1024 * 1024;
const SIZE_2GB = 2 * 1024 * 1024 * 1024;

export function useLessonMedia(
  lessonId: string,
  courseId: string | undefined,
  onUpdate: (updates: any) => void,
  meta?: { courseTitle?: string; lessonTitle?: string; organizationId?: string }
) {
  const bg = useBackgroundUploads();
  const currentTaskIdRef = useRef<string | null>(null);
  const startBgTask = useCallback((kind: "internal" | "kinescope", file: File, abort: () => void) => {
    const id = crypto.randomUUID();
    bg.registerUpload({
      id, kind, lessonId, courseId: courseId || "",
      courseTitle: meta?.courseTitle || "Курс",
      lessonTitle: meta?.lessonTitle || "Урок",
      fileName: file.name, fileSize: file.size, abort,
      organizationId: meta?.organizationId,
    });
    currentTaskIdRef.current = id;
    return id;
  }, [bg, lessonId, courseId, meta?.courseTitle, meta?.lessonTitle, meta?.organizationId]);

  // TTS
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSpeechPaused, setIsSpeechPaused] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const extractTextFromBlocks = (blocks: ContentBlock[]): string => {
    return blocks
      .filter(b => ["heading1", "heading2", "quote", "bulletList", "numberedList", "paragraph"].includes(b.type))
      .map(b => (b.content || "").replace(/<[^>]+>/g, ""))
      .filter(t => t.trim())
      .join(". ");
  };

  const handlePlayAudio = useCallback((blocks: ContentBlock[]) => {
    const textToSpeak = extractTextFromBlocks(blocks);
    if (!textToSpeak.trim()) { toast.error("Нет текста для озвучивания"); return; }
    if (typeof window === "undefined" || !("speechSynthesis" in window)) { toast.error("Озвучка не поддерживается"); return; }

    if (isSpeaking) {
      if (isSpeechPaused) { window.speechSynthesis.resume(); setIsSpeechPaused(false); }
      else { window.speechSynthesis.pause(); setIsSpeechPaused(true); }
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = "ru-RU"; utterance.rate = 1; utterance.pitch = 1;
    utterance.onend = () => { setIsSpeaking(false); setIsSpeechPaused(false); utteranceRef.current = null; };
    utterance.onerror = () => { setIsSpeaking(false); setIsSpeechPaused(false); utteranceRef.current = null; toast.error("Ошибка озвучивания"); };
    utteranceRef.current = utterance;
    setIsSpeaking(true); setIsSpeechPaused(false);
    window.speechSynthesis.speak(utterance);
  }, [isSpeaking, isSpeechPaused]);

  const handleStopSpeech = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setIsSpeaking(false); setIsSpeechPaused(false); utteranceRef.current = null;
  }, []);

  // Video upload
  const [videoUploadProgress, setVideoUploadProgress] = useState<number | null>(null);
  const [compressionProgress, setCompressionProgress] = useState<number | null>(null);
  const [kinescopeUploadProgress, setKinescopeUploadProgress] = useState<number | null>(null);
  const videoUploadXhrRef = useRef<XMLHttpRequest | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const kinescopeInputRef = useRef<HTMLInputElement | null>(null);
  const tusAbortRef = useRef<AbortController | null>(null);

  // Upload tracking for ETA
  const [uploadStartTime, setUploadStartTime] = useState<number | null>(null);
  const [uploadFileSize, setUploadFileSize] = useState<number>(0);
  const [uploadedBytes, setUploadedBytes] = useState<number>(0);
  const [uploadFinishTime, setUploadFinishTime] = useState<number | null>(null);

  const getStorageConfig = useCallback(async () => {
    const baseUrl = import.meta.env.VITE_SUPABASE_URL;
    const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const { data: session } = await supabase.auth.getSession();
    const authToken = session?.session?.access_token || apiKey;
    return { baseUrl, apiKey, authToken, bucketName: 'course-files', useExternal: false };
  }, []);

  const handleVideoUpload = useCallback(async (file: File, skipCompression = false) => {
    if (!courseId) { toast.error("Сначала сохраните курс"); return; }
    // Guard against double-trigger (e.g. user clicked twice, antivirus duplicated event)
    if (videoUploadProgress !== null || kinescopeUploadProgress !== null || tusAbortRef.current) {
      toast.info("Загрузка уже идёт, дождитесь завершения");
      if (videoInputRef.current) videoInputRef.current.value = '';
      return;
    }
    if (file.size > SIZE_2GB) {
      toast.error("Файл слишком большой. Максимум — 2 ГБ.");
      if (videoInputRef.current) videoInputRef.current.value = '';
      return;
    }

    // Inform users about .TS limitations
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'ts' || ext === 'm2ts' || ext === 'mts') {
      toast.info("Формат .TS загружен. Для гарантированного воспроизведения во всех браузерах рекомендуем «Видеосервис+» — он автоматически перекодирует.", { duration: 8000 });
    }

    setVideoUploadProgress(0);
    setUploadStartTime(Date.now());
    setUploadFileSize(file.size);
    setUploadedBytes(0);
    setUploadFinishTime(null);
    try {
      let fileToUpload: File = file;
      toast.info(`Загрузка: ${file.name} (${(file.size / 1024 / 1024).toFixed(0)} МБ)`, { duration: 3000 });

      // Optional compression for files 500MB–1GB
      if (!skipCompression && file.size > SIZE_500MB && file.size <= SIZE_1GB) {
        try {
          setCompressionProgress(0);
          toast.info("Файл больше 500 МБ — запускаем сжатие...");
          const { compressVideo } = await import("@/utils/videoCompressor");
          fileToUpload = await compressVideo(file, (p) => setCompressionProgress(p));
          setCompressionProgress(null);
          if (fileToUpload.size < file.size) {
            toast.success(`Видео сжато: ${(file.size / 1024 / 1024).toFixed(0)} МБ → ${(fileToUpload.size / 1024 / 1024).toFixed(0)} МБ`);
          }
        } catch {
          setCompressionProgress(null);
          fileToUpload = file;
        }
      } else if (file.size > SIZE_1GB) {
        toast.info("Большой файл — загрузка может занять несколько минут...", { duration: 6000 });
      }

      const fileExt = fileToUpload.name.split('.').pop()?.toLowerCase() || 'mp4';
      const fileName = `video_${lessonId}_${Date.now()}.${fileExt}`;
      const filePath = `${courseId}/${fileName}`;

      const config = await getStorageConfig();

      // Use TUS (chunked) for files > 100 MB, XHR for smaller
      if (fileToUpload.size > SIZE_100MB) {
        await uploadViaTus(fileToUpload, filePath, config);
      } else {
        await uploadViaXhr(fileToUpload, filePath, config);
      }
    } catch (error: any) {
      console.error("Video upload error:", error);
      toast.error(`Ошибка загрузки: ${error.message}`);
      setVideoUploadProgress(null);
      videoUploadXhrRef.current = null;
      tusAbortRef.current = null;
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  }, [courseId, lessonId, onUpdate, getStorageConfig]);

  const uploadViaTus = useCallback(async (
    fileToUpload: File | Blob,
    filePath: string,
    config: { baseUrl: string; apiKey: string; authToken: string; bucketName: string; useExternal: boolean }
  ) => {
    const { tusUpload } = await import("@/utils/tusUpload");
    const abortController = new AbortController();
    tusAbortRef.current = abortController;

    // Register background task (so closing dialog won't lose visibility)
    const taskId = (fileToUpload instanceof File)
      ? startBgTask("internal", fileToUpload, () => abortController.abort())
      : null;

    try {
      const result = await tusUpload({
        file: fileToUpload,
        bucket: config.bucketName,
        path: filePath,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        authToken: config.authToken,
        onProgress: (percent) => {
          setVideoUploadProgress(percent);
          setUploadedBytes(Math.round((percent / 100) * fileToUpload.size));
          if (taskId) bg.updateUpload(taskId, { progress: percent });
        },
        onStall: () => {
          toast.warning("Загрузка замедлилась. Проверьте интернет-соединение.", { duration: 5000 });
        },
        signal: abortController.signal,
      });

      tusAbortRef.current = null;
      onUpdate({ content: result.url });
      setUploadFinishTime(Date.now());
      setVideoUploadProgress(null);
      if (videoInputRef.current) videoInputRef.current.value = '';
      if (taskId) bg.finishUpload(taskId);
      else toast.success("Видео загружено!");
    } catch (e: any) {
      if (taskId) bg.failUpload(taskId, e?.message || "Ошибка загрузки");
      throw e;
    }
  }, [onUpdate, startBgTask, bg]);


  const uploadViaXhr = useCallback(async (
    fileToUpload: File | Blob,
    filePath: string,
    config: { baseUrl: string; apiKey: string; authToken: string; bucketName: string; useExternal: boolean }
  ) => {
    const xhr = new XMLHttpRequest();
    videoUploadXhrRef.current = xhr;
    const uploadUrl = `${config.baseUrl}/storage/v1/object/${config.bucketName}/${filePath}`;

    return new Promise<void>((resolve, reject) => {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          setVideoUploadProgress(Math.round((event.loaded / event.total) * 100));
          setUploadedBytes(event.loaded);
        }
      });
      xhr.addEventListener('load', () => {
        videoUploadXhrRef.current = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          const publicUrl = `${config.baseUrl}/storage/v1/object/public/${config.bucketName}/${filePath}`;
          onUpdate({ content: publicUrl });
          setUploadFinishTime(Date.now());
          toast.success("Видео загружено!");
          resolve();
        } else {
          reject(new Error(`Ошибка загрузки: ${xhr.statusText || 'Неизвестная ошибка'}`));
        }
        setVideoUploadProgress(null);
        if (videoInputRef.current) videoInputRef.current.value = '';
      });
      xhr.addEventListener('error', () => {
        videoUploadXhrRef.current = null;
        setVideoUploadProgress(null);
        if (videoInputRef.current) videoInputRef.current.value = '';
        reject(new Error("Ошибка соединения при загрузке"));
      });
      xhr.addEventListener('abort', () => {
        videoUploadXhrRef.current = null;
        setVideoUploadProgress(null);
        if (videoInputRef.current) videoInputRef.current.value = '';
        resolve();
      });

      xhr.open('POST', uploadUrl, true);
      xhr.setRequestHeader('Authorization', `Bearer ${config.authToken}`);
      xhr.setRequestHeader('apikey', config.apiKey);
      xhr.setRequestHeader('x-upsert', 'true');
      xhr.send(fileToUpload);
    });
  }, [onUpdate]);

  const cancelVideoUpload = useCallback(() => {
    if (videoUploadXhrRef.current) { videoUploadXhrRef.current.abort(); videoUploadXhrRef.current = null; }
    if (tusAbortRef.current) { tusAbortRef.current.abort(); tusAbortRef.current = null; }
    setVideoUploadProgress(null);
    setKinescopeUploadProgress(null);
    if (videoInputRef.current) videoInputRef.current.value = '';
    if (kinescopeInputRef.current) kinescopeInputRef.current.value = '';
    toast.info("Загрузка отменена");
  }, []);

  // Kinescope upload
  const handleKinescopeUpload = useCallback(async (file: File) => {
    if (!courseId) { toast.error("Сначала сохраните курс"); return; }
    // Guard against double-trigger
    if (videoUploadProgress !== null || kinescopeUploadProgress !== null || tusAbortRef.current) {
      toast.info("Загрузка уже идёт, дождитесь завершения");
      if (kinescopeInputRef.current) kinescopeInputRef.current.value = '';
      return;
    }

    setKinescopeUploadProgress(0);
    setUploadStartTime(Date.now());
    setUploadFileSize(file.size);
    setUploadedBytes(0);
    setUploadFinishTime(null);
    try {
      toast.info(`Загрузка в Kinescope: ${file.name} (${(file.size / 1024 / 1024).toFixed(0)} МБ)`, { duration: 3000 });

      // 1. Init upload via edge function
      const { data: initData, error: initError } = await supabase.functions.invoke("kinescope-proxy", {
        body: {
          action: "upload_init",
          title: `${courseId}_${lessonId}_${file.name}`,
          file_size: file.size,
        },
      });

      if (initError || !initData?.upload_url) {
        throw new Error(initData?.error || initError?.message || "Не удалось инициализировать загрузку");
      }

      const { video_id, upload_url, embed_url } = initData;

      // 2. Upload via TUS directly to Kinescope
      const CHUNK_SIZE = 50 * 1024 * 1024; // 50 MB
      let offset = 0;
      const fileSize = file.size;
      const abortController = new AbortController();
      tusAbortRef.current = abortController;

      const fetchKinescopeOffset = async (): Promise<number | null> => {
        try {
          const headRes = await fetch(upload_url, {
            method: "HEAD",
            headers: { "Tus-Resumable": "1.0.0" },
            signal: abortController.signal,
          });
          if (!headRes.ok) return null;
          const off = headRes.headers.get("Upload-Offset");
          if (!off) return null;
          const parsed = parseInt(off, 10);
          return Number.isFinite(parsed) ? parsed : null;
        } catch { return null; }
      };

      while (offset < fileSize) {
        if (abortController.signal.aborted) throw new Error("Upload cancelled");

        const end = Math.min(offset + CHUNK_SIZE, fileSize);
        const chunk = file.slice(offset, end);

        const patchRes = await fetch(upload_url, {
          method: "PATCH",
          headers: {
            "Upload-Offset": String(offset),
            "Content-Type": "application/offset+octet-stream",
            "Tus-Resumable": "1.0.0",
          },
          body: chunk,
          signal: abortController.signal,
        });

        // Handle 409/410: server has different offset → resync via HEAD
        if (patchRes.status === 409 || patchRes.status === 410) {
          const serverOffset = await fetchKinescopeOffset();
          if (serverOffset !== null && serverOffset > offset && serverOffset <= fileSize) {
            console.warn(`[Kinescope TUS] resync ${offset} → ${serverOffset} (status ${patchRes.status})`);
            offset = serverOffset;
            setKinescopeUploadProgress(Math.round((offset / fileSize) * 100));
            setUploadedBytes(offset);
            continue;
          }
          const errBody = await patchRes.text().catch(() => "");
          throw new Error(`Загрузка прервана (${patchRes.status}). Попробуйте загрузить файл ещё раз. ${errBody}`);
        }

        if (!patchRes.ok) {
          const errBody = await patchRes.text().catch(() => "");
          throw new Error(`TUS PATCH failed (${patchRes.status}): ${errBody}`);
        }

        const newOffset = patchRes.headers.get("Upload-Offset");
        offset = newOffset ? parseInt(newOffset, 10) : end;
        setKinescopeUploadProgress(Math.round((offset / fileSize) * 100));
        setUploadedBytes(offset);
      }

      tusAbortRef.current = null;

      // 3. Save kinescope:{videoId} as content
      onUpdate({ content: `kinescope:${video_id}` });
      setUploadFinishTime(Date.now());
      toast.success("Видео загружено в Kinescope!");
      setKinescopeUploadProgress(null);
      if (kinescopeInputRef.current) kinescopeInputRef.current.value = '';
    } catch (error: any) {
      console.error("Kinescope upload error:", error);
      if (!error.message?.includes("cancelled")) {
        toast.error(`Ошибка загрузки: ${error.message}`);
      }
      setKinescopeUploadProgress(null);
      tusAbortRef.current = null;
      if (kinescopeInputRef.current) kinescopeInputRef.current.value = '';
    }
  }, [courseId, lessonId, onUpdate]);

  // AI content generation
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);

  const handleGenerateContent = useCallback(async (lessonTitle: string, lessonType: string, courseTitle: string, courseDescription: string, blocks?: ContentBlock[], mode: "text" | "image" | "full" = "full") => {
    setIsGeneratingContent(true);
    try {
      const { data, error } = await safeInvoke<any>("generate-lesson-content", {
        body: { lessonTitle, lessonType, courseTitle, courseDescription }
      });
      if (error) throw new Error(error.message || "Ошибка генерации");
      if (!data.success) throw new Error(data.error || "Ошибка генерации контента");

      if (lessonType === "test") {
        const questions = data.questions || [];
        if (questions.length > 0) {
          onUpdate({ content: JSON.stringify({ generatedQuestions: questions }) });
          toast.success(`Сгенерировано ${questions.length} вопросов`);
        }
      } else {
        const newBlocks: ContentBlock[] = (data.blocks || [])
          .filter((b: any) => {
            // Skip accordion blocks with no useful content
            if (b.type === "accordion" && !b.content?.trim() && !b.accordionTitle?.trim()) return false;
            return true;
          })
          .map((b: any) => ({
          id: crypto.randomUUID(), type: b.type,
          content: (b.type === "accordion" && !b.content?.trim() && b.accordionTitle?.trim()) ? b.accordionTitle : (b.content || ""),
          ...(b.accordionTitle ? { accordionTitle: b.accordionTitle } : {}),
          ...(b.imageSrc ? { imageSrc: b.imageSrc } : {}),
        }));
        if (newBlocks.length > 0) {
          // Generate hero image (non-blocking) — skip in "text" mode
          if (mode === "image" || mode === "full") try {
            const snippet = newBlocks
              .filter(b => b.type === "paragraph")
              .map(b => (b.content || "").replace(/<[^>]+>/g, ""))
              .join(" ")
              .slice(0, 200);
            const prompt = `Educational illustration for lesson "${lessonTitle}". ${snippet}. Professional, clean, suitable for online course.`;
            const { data: imgData } = await safeInvoke<any>("generate-image", {
              body: { prompt, provider: "gigachat" },
            });
            if (imgData?.url) {
              newBlocks.unshift({
                id: crypto.randomUUID(),
                type: "image",
                content: "",
                imageSrc: imgData.url,
                imageAlt: `Иллюстрация к уроку "${lessonTitle}"`,
              } as ContentBlock);
              toast.success("Изображение сгенерировано");
            }
          } catch (e) {
          }

          // Generate intro audio via SaluteSpeech (non-blocking) — only in "full" mode
          if (mode === "full") try {
            const firstPara = newBlocks.find(
              b => b.type === "paragraph" && b.content && b.content.replace(/<[^>]+>/g, "").trim().length > 50
            );
            if (firstPara) {
              const plainText = (firstPara.content || "").replace(/<[^>]+>/g, "").slice(0, 500);
              const response = await safeFetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/salutespeech-tts`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                    "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                  },
                  body: JSON.stringify({ text: plainText, voice: "natalya", format: "opus" }),
                }
              );
              if (response.ok) {
                const audioBlob = await response.blob();
                const storageClient = supabase;
                const fileName = `tts_${crypto.randomUUID()}.ogg`;
                const { error: uploadError } = await storageClient.storage
                  .from("course-files")
                  .upload(fileName, audioBlob, { contentType: "audio/ogg", cacheControl: "3600", upsert: true });
                if (!uploadError) {
                  const { data: urlData } = storageClient.storage.from("course-files").getPublicUrl(fileName);
                  if (urlData?.publicUrl) {
                    const insertIdx = newBlocks[0]?.type === "image" ? 1 : 0;
                    newBlocks.splice(insertIdx, 0, {
                      id: crypto.randomUUID(),
                      type: "audio",
                      content: plainText.slice(0, 200),
                      audioUrl: urlData.publicUrl,
                    } as ContentBlock);
                    toast.success("Аудио сгенерировано");
                  }
                }
              }
            }
          } catch (e) {
          }

          onUpdate({ blocks: newBlocks, content: blocksToJsonFn(newBlocks) });
          toast.success("Контент сгенерирован");

          // Log to generation history
          try {
            await supabase.from("generation_history").insert({
              course_id: courseId || null,
              course_title: courseTitle || "Без курса",
              action: "content",
              details: `Написать с AI: "${lessonTitle}" (${newBlocks.length} блоков)`,
              items_count: newBlocks.length,
            });
          } catch (_) {}
        } else toast.error("AI не вернул контент");
      }
    } catch (error: any) {
      console.error("Generate content error:", error);
      toast.error(error.message || "Ошибка генерации контента");
    } finally { setIsGeneratingContent(false); }
  }, [onUpdate]);

  return {
    // TTS
    isSpeaking, isSpeechPaused, handlePlayAudio, handleStopSpeech,
    // Video
    videoUploadProgress, compressionProgress, videoInputRef, handleVideoUpload, cancelVideoUpload,
    // Kinescope
    kinescopeUploadProgress, kinescopeInputRef, handleKinescopeUpload,
    // Upload tracking
    uploadStartTime, uploadFileSize, uploadedBytes, uploadFinishTime,
    // AI
    isGeneratingContent, handleGenerateContent,
  };
}
