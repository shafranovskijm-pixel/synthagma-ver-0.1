import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke, safeFetch } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { ContentBlock, blocksToJson as blocksToJsonFn } from "@/components/course-builder/BlockEditor";
import { initExternalSupabase, getExternalSupabase } from "@/integrations/external-supabase/client";

const SIZE_100MB = 100 * 1024 * 1024;
const SIZE_500MB = 500 * 1024 * 1024;
const SIZE_1GB = 1024 * 1024 * 1024;
const SIZE_2GB = 2 * 1024 * 1024 * 1024;

export function useLessonMedia(
  lessonId: string,
  courseId: string | undefined,
  onUpdate: (updates: any) => void
) {
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
  const videoUploadXhrRef = useRef<XMLHttpRequest | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const tusAbortRef = useRef<AbortController | null>(null);

  const getStorageConfig = useCallback(async () => {
    let externalConfig: { configured: boolean; url: string | null; key: string | null } | null = null;
    try { const { data } = await safeInvoke<any>('get-external-storage-config'); externalConfig = data; } catch {}

    const useExternal = externalConfig?.configured && externalConfig?.url && externalConfig?.key;
    const baseUrl = useExternal ? externalConfig!.url! : import.meta.env.VITE_SUPABASE_URL;
    const apiKey = useExternal ? externalConfig!.key! : import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const bucketName = useExternal ? 'course-videos' : 'course-files';

    let authToken = apiKey;
    if (!useExternal) {
      const { data: session } = await supabase.auth.getSession();
      authToken = session?.session?.access_token || apiKey;
    }

    return { baseUrl, apiKey, authToken, bucketName, useExternal: !!useExternal };
  }, []);

  const handleVideoUpload = useCallback(async (file: File, skipCompression = false) => {
    if (!courseId) { toast.error("Сначала сохраните курс"); return; }

    setVideoUploadProgress(0);
    try {
      let fileToUpload: File = file;

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
        toast.info("Большой файл — загрузка может занять время...", { duration: 6000 });
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

    const result = await tusUpload({
      file: fileToUpload,
      bucket: config.bucketName,
      path: filePath,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      authToken: config.authToken,
      onProgress: (percent) => setVideoUploadProgress(percent),
      onStall: () => {
        toast.warning("Загрузка замедлилась. Проверьте интернет-соединение.", { duration: 5000 });
      },
      signal: abortController.signal,
    });

    tusAbortRef.current = null;
    onUpdate({ content: result.url });
    toast.success(config.useExternal ? "Видео загружено во внешнее хранилище!" : "Видео загружено!");
    setVideoUploadProgress(null);
    if (videoInputRef.current) videoInputRef.current.value = '';
  }, [onUpdate]);

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
        if (event.lengthComputable) setVideoUploadProgress(Math.round((event.loaded / event.total) * 100));
      });
      xhr.addEventListener('load', () => {
        videoUploadXhrRef.current = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          const publicUrl = `${config.baseUrl}/storage/v1/object/public/${config.bucketName}/${filePath}`;
          onUpdate({ content: publicUrl });
          toast.success(config.useExternal ? "Видео загружено во внешнее хранилище!" : "Видео загружено!");
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
    if (videoInputRef.current) videoInputRef.current.value = '';
    toast.info("Загрузка отменена");
  }, []);

  // AI content generation
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);

  const handleGenerateContent = useCallback(async (lessonTitle: string, lessonType: string, courseTitle: string, courseDescription: string, blocks?: ContentBlock[]) => {
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
          // Generate hero image (non-blocking)
          try {
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
            console.warn("Hero image generation skipped:", e);
          }

          // Generate intro audio via SaluteSpeech (non-blocking)
          try {
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
                await initExternalSupabase();
                const storageClient = getExternalSupabase() || supabase;
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
            console.warn("Intro audio generation skipped:", e);
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
    // AI
    isGeneratingContent, handleGenerateContent,
  };
}
