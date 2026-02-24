import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ContentBlock } from "@/components/course-builder/BlockEditor";

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

  const handleVideoUpload = useCallback(async (file: File) => {
    const maxSize = 2 * 1024 * 1024 * 1024; // 2 GB
    if (file.size > maxSize) { toast.error("Файл слишком большой. Максимум 2 ГБ"); return; }
    if (!courseId) { toast.error("Сначала сохраните курс"); return; }

    setVideoUploadProgress(0);
    try {
      const compressionThreshold = 500 * 1024 * 1024; // 500 MB
      let fileToUpload = file;

      if (file.size > compressionThreshold) {
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
      }

      const fileExt = fileToUpload.name.split('.').pop()?.toLowerCase() || 'mp4';
      const fileName = `video_${lessonId}_${Date.now()}.${fileExt}`;
      const filePath = `${courseId}/${fileName}`;

      let externalConfig: { configured: boolean; url: string | null; key: string | null } | null = null;
      try { const { data } = await supabase.functions.invoke('get-external-storage-config'); externalConfig = data; } catch {}

      const useExternal = externalConfig?.configured && externalConfig?.url && externalConfig?.key;
      const baseUrl = useExternal ? externalConfig!.url : import.meta.env.VITE_SUPABASE_URL;
      const apiKey = useExternal ? externalConfig!.key : import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const bucketName = useExternal ? 'course-videos' : 'course-files';

      let authToken = apiKey;
      if (!useExternal) {
        const { data: session } = await supabase.auth.getSession();
        authToken = session?.session?.access_token || apiKey;
      }

      const xhr = new XMLHttpRequest();
      videoUploadXhrRef.current = xhr;
      const uploadUrl = `${baseUrl}/storage/v1/object/${bucketName}/${filePath}`;

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) setVideoUploadProgress(Math.round((event.loaded / event.total) * 100));
      });
      xhr.addEventListener('load', () => {
        videoUploadXhrRef.current = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          const publicUrl = `${baseUrl}/storage/v1/object/public/${bucketName}/${filePath}`;
          onUpdate({ content: publicUrl });
          toast.success(useExternal ? "Видео загружено во внешнее хранилище!" : "Видео загружено!");
        } else toast.error(`Ошибка загрузки: ${xhr.statusText || 'Неизвестная ошибка'}`);
        setVideoUploadProgress(null);
        if (videoInputRef.current) videoInputRef.current.value = '';
      });
      xhr.addEventListener('error', () => { videoUploadXhrRef.current = null; toast.error("Ошибка соединения при загрузке"); setVideoUploadProgress(null); if (videoInputRef.current) videoInputRef.current.value = ''; });
      xhr.addEventListener('abort', () => { videoUploadXhrRef.current = null; setVideoUploadProgress(null); if (videoInputRef.current) videoInputRef.current.value = ''; });

      xhr.open('POST', uploadUrl, true);
      xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
      xhr.setRequestHeader('apikey', apiKey!);
      xhr.setRequestHeader('x-upsert', 'true');
      xhr.send(file);
    } catch (error: any) {
      console.error("Video upload error:", error);
      toast.error(`Ошибка загрузки: ${error.message}`);
      setVideoUploadProgress(null); videoUploadXhrRef.current = null;
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  }, [courseId, lessonId, onUpdate]);

  const cancelVideoUpload = useCallback(() => {
    if (videoUploadXhrRef.current) { videoUploadXhrRef.current.abort(); videoUploadXhrRef.current = null; }
    setVideoUploadProgress(null);
    if (videoInputRef.current) videoInputRef.current.value = '';
    toast.info("Загрузка отменена");
  }, []);

  // AI content generation
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);

  const handleGenerateContent = useCallback(async (lessonTitle: string, lessonType: string, courseTitle: string, courseDescription: string, blocks?: ContentBlock[]) => {
    setIsGeneratingContent(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-lesson-content", {
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
        const newBlocks: ContentBlock[] = (data.blocks || []).map((b: any) => ({
          id: crypto.randomUUID(), type: b.type, content: b.content
        }));
        if (newBlocks.length > 0) {
          const { blocksToJson } = await import("@/components/course-builder/BlockEditor");
          onUpdate({ blocks: newBlocks, content: blocksToJson(newBlocks) });
          toast.success("Контент сгенерирован");
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
