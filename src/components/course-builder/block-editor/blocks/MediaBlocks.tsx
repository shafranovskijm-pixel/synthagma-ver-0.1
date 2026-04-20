import { useState, useRef, useEffect } from "react";
import DOMPurify from "dompurify";
import { useNavigate } from "react-router-dom";
import { checkAiLimitGlobal, incrementAiLimitGlobal } from "@/hooks/useAiGenerationLimit";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useLessonMedia } from "@/hooks/useLessonMedia";
import { safeInvoke } from "@/utils/safeInvoke";
import { LazyMediaPreview } from "@/components/course-builder/LazyMediaPreview";
import { MediaLibraryDialog } from "../../MediaLibraryDialog";
import { UploadProgressBlock } from "@/components/course-builder/UploadProgressBlock";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Image as ImageIcon, Video, Upload, Headphones, BookOpen, FolderOpen, Play, Sparkles, Wand2, Trash2, Lock } from "lucide-react";
import type { ContentBlock } from "../types";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { HlsVideoPlayer } from "@/components/video/HlsVideoPlayer";

// ─── DirectVideoBlock ───────────────────────────────────────────
function DirectVideoBlockInner({ url }: { url: string }) {
  const [error, setError] = useState(false);
  if (error) {
    return (
      <div className="aspect-video not-prose rounded-lg bg-muted flex flex-col items-center justify-center gap-3">
        <Video className="w-12 h-12 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Браузер не может воспроизвести это видео</p>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <Play className="w-4 h-4" /> Открыть видео
        </a>
      </div>
    );
  }
  return (
    <div className="aspect-video not-prose">
      <HlsVideoPlayer src={url} className="w-full h-full rounded-lg bg-black" controls preload="none" controlsList="nodownload"
        onError={() => setError(true)} />
    </div>
  );
}

export function DirectVideoBlock({ url, lazy = true }: { url: string; lazy?: boolean }) {
  if (!lazy) return <DirectVideoBlockInner url={url} />;
  return (
    <LazyMediaPreview type="video">
      <DirectVideoBlockInner url={url} />
    </LazyMediaPreview>
  );
}

// ─── ImageBlock ─────────────────────────────────────────────────
export function ImageBlock({ block, onUpdate }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void }) {
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [showAiInput, setShowAiInput] = useState(false);
  const [showEditInput, setShowEditInput] = useState(false);

  useEffect(() => {
    if (block.pendingAI === "ai-image" && !block.imageSrc) {
      setShowAiInput(true);
      onUpdate({ pendingAI: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.pendingAI]);

  const handleFileUpload = async (file: File) => {
    const { toast } = await import("sonner");
    if (!file.type.startsWith("image/")) {
      toast.error("Это не изображение", { description: "Поддерживаются JPG, PNG, GIF, WebP" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      const sizeMb = (file.size / 1024 / 1024).toFixed(1);
      toast.error(`Файл слишком большой (${sizeMb} МБ)`, { description: "Максимум 10 МБ. Сожмите изображение или используйте онлайн-конвертер." });
      return;
    }
    setIsUploading(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const fileExt = file.name.split(".").pop()?.toLowerCase() || "png";
      const fileName = `block-images/${block.id}-${Date.now()}.${fileExt}`;
      let externalConfig: { configured: boolean; url: string | null; key: string | null } | null = null;
      try { const { data } = await supabase.functions.invoke('get-external-storage-config'); externalConfig = data; } catch {}
      const useExternal = externalConfig?.configured && externalConfig?.url && externalConfig?.key;
      const bucket = 'course-files';
      const baseUrl = useExternal ? externalConfig!.url : import.meta.env.VITE_SUPABASE_URL;
      const apiKey = useExternal ? externalConfig!.key : import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      let authToken = apiKey;
      if (!useExternal) {
        const { data: session } = await supabase.auth.getSession();
        authToken = session?.session?.access_token || apiKey;
      }
      let uploadedViaInternal = false;
      const { error } = await supabase.storage.from(bucket).upload(fileName, file, { cacheControl: '3600', upsert: true });
      if (error) {
        const uploadUrl = `${baseUrl}/storage/v1/object/${bucket}/${fileName}`;
        const resp = await fetch(uploadUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${authToken}`, 'apikey': apiKey!, 'x-upsert': 'true' }, body: file });
        if (!resp.ok) throw new Error('Upload failed');
      } else { uploadedViaInternal = true; }
      const actualBaseUrl = uploadedViaInternal ? import.meta.env.VITE_SUPABASE_URL : baseUrl;
      const publicUrl = `${actualBaseUrl}/storage/v1/object/public/${bucket}/${fileName}`;
      onUpdate({ imageSrc: publicUrl, imageAlt: block.imageAlt || file.name.replace(/\.[^.]+$/, '') });
    } catch (err) {
      console.error("Image upload error:", err);
    } finally { setIsUploading(false); }
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    if (!(await checkAiLimitGlobal())) return;
    setIsGenerating(true);
    try {
      // Try Lovable AI Gateway first (Nano Banana), fallback to gigachat
      let url: string | null = null;
      let lastError: string | null = null;
      try {
        const { data, error } = await safeInvoke<any>("generate-block-image", { body: { prompt: aiPrompt.trim() } });
        if (!error && data?.url) url = data.url;
        else lastError = error?.message || data?.error || null;
      } catch (e) { lastError = e instanceof Error ? e.message : null; }
      if (!url) {
        const { data, error } = await safeInvoke<any>("generate-image", { body: { prompt: aiPrompt.trim(), provider: "gigachat", slotIndex: Date.now() } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!data?.url) throw new Error(lastError || "Изображение не было сгенерировано");
        url = data.url;
      }
      onUpdate({ imageSrc: url, imageAlt: aiPrompt.trim() });
      await incrementAiLimitGlobal();
      setAiPrompt(""); setShowAiInput(false);
    } catch (err) {
      console.error("AI image generation error:", err);
      const { toast } = await import("sonner");
      const message = err instanceof Error ? err.message : "Ошибка генерации изображения";
      if (message.includes("429")) toast.error("ИИ перегружен, повторите через 10–20 секунд");
      else if (message.includes("402")) toast.error("Лимит генерации исчерпан, повторите позже");
      else toast.error(message);
    } finally { setIsGenerating(false); }
  };

  const handleAiEdit = async () => {
    if (!editPrompt.trim() || !block.imageSrc) return;
    setIsEditing(true);
    try {
      const { data, error } = await safeInvoke<any>("generate-image", { body: { prompt: editPrompt.trim(), imageUrl: block.imageSrc, provider: "gigachat", slotIndex: Date.now() } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error("Изображение не было отредактировано");
      onUpdate({ imageSrc: data.url });
      setEditPrompt(""); setShowEditInput(false);
      const { toast } = await import("sonner");
      toast.success("Изображение отредактировано");
    } catch (err) {
      console.error("AI image edit error:", err);
      const { toast } = await import("sonner");
      const message = err instanceof Error ? err.message : "Ошибка редактирования изображения";
      if (message.includes("429")) toast.error("GigaChat перегружен, повторите попытку через 10–20 секунд");
      else if (message.includes("402")) toast.error("Лимит генерации исчерпан, повторите попытку позже");
      else toast.error(message);
    } finally { setIsEditing(false); }
  };

  return (
    <div className="py-2">
      {block.imageSrc ? (
        <div className="space-y-2">
          <div className="relative group/img">
            <img src={block.imageSrc} alt={block.imageAlt || ""} className="rounded-lg max-w-full h-auto max-h-[400px] object-contain" />
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
              <Button variant="secondary" size="sm" onClick={() => setShowEditInput(!showEditInput)} className={showEditInput ? "border-primary" : ""} disabled={isEditing}>
                <Wand2 className="w-3.5 h-3.5 mr-1" />Редактировать ИИ
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onUpdate({ imageSrc: "", imageAlt: "" })}>Удалить</Button>
            </div>
          </div>
          {showEditInput && (
            <div className="flex gap-2">
              <Input value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} placeholder="Опишите что исправить..." className="text-sm flex-1" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiEdit(); } }} disabled={isEditing} />
              <Button size="sm" disabled={!editPrompt.trim() || isEditing} onClick={handleAiEdit}>
                {isEditing ? <SigmaSpinner size="sm" /> : <Wand2 className="w-4 h-4" />}
              </Button>
            </div>
          )}
          <Input value={block.imageAlt || ""} onChange={(e) => onUpdate({ imageAlt: e.target.value })} placeholder="Подпись к изображению..." className="text-sm border-0 bg-secondary/30 focus-visible:ring-1 rounded-lg" />
        </div>
      ) : (
        <div className="bg-muted rounded-xl p-6 space-y-4">
          <div className="text-center">
            <ImageIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-3">Загрузите изображение или вставьте ссылку</p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="sm" disabled={isUploading || isGenerating} onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFileUpload(f); }; input.click(); }}>
                {isUploading ? <SigmaSpinner size="sm" className="mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
                {isUploading ? "Загрузка..." : "Загрузить файл"}
              </Button>
              <Button variant="outline" size="sm" disabled={isUploading || isGenerating} onClick={() => setShowAiInput(!showAiInput)} className={showAiInput ? "border-primary text-primary" : ""}>
                <Sparkles className="w-4 h-4 mr-1" />ИИ генерация
              </Button>
            </div>
          </div>
          {showAiInput && (
            <div className="space-y-2">
              <Input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Опишите изображение..." className="text-sm" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiGenerate(); } }} disabled={isGenerating} />
              <Button size="sm" disabled={!aiPrompt.trim() || isGenerating} onClick={handleAiGenerate} className="w-full">
                {isGenerating ? <><SigmaSpinner size="sm" className="mr-1" /> Генерация...</> : <><Wand2 className="w-4 h-4 mr-1" /> Сгенерировать</>}
              </Button>
            </div>
          )}
          <Input value={block.imageSrc || ""} onChange={(e) => onUpdate({ imageSrc: e.target.value })} placeholder="https://example.com/image.jpg" className="text-sm" />
        </div>
      )}
    </div>
  );
}

// ─── VideoBlock ─────────────────────────────────────────────────
export function VideoBlock({ block, onUpdate, organizationId, courseId, lessonId }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void; organizationId?: string; courseId?: string; lessonId?: string }) {
  const [showLibrary, setShowLibrary] = useState(false);
  const [skipCompression, setSkipCompression] = useState(false);

  const { limits } = useSubscriptionLimits(organizationId || null);
  const isKinescopeAvailable = !!limits?.kinescopeEnabled;
  const navigate = useNavigate();
  const [videoUploadTab, setVideoUploadTab] = useState<string>(isKinescopeAvailable ? "kinescope" : "server");

  const lessonIdForMedia = lessonId || block.id;
  const media = useLessonMedia(
    lessonIdForMedia,
    courseId,
    (updates: any) => {
      if (typeof updates?.content === "string") onUpdate({ videoUrl: updates.content });
    },
    { organizationId },
  );

  const isIframeEmbed = (content: string): boolean => content.trim().startsWith('<iframe') && content.includes('</iframe>');

  const getEmbedFromContent = (content: string): { type: 'iframe' | 'url' | 'direct' | null; value: string | null } => {
    if (!content) return { type: null, value: null };
    if (isIframeEmbed(content)) return { type: 'iframe', value: content };
    if (content.match(/\.(mp4|webm|ogg|mov|mkv|m4v)(\?.*)?$/i) || content.includes("selcdn.ru") || content.includes("selstorage")) return { type: 'direct', value: content };
    if (content.startsWith("kinescope:")) return { type: 'direct', value: content };
    const ytMatch = content.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (ytMatch) return { type: 'url', value: `https://www.youtube.com/embed/${ytMatch[1]}` };
    const vimeoMatch = content.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) return { type: 'url', value: `https://player.vimeo.com/video/${vimeoMatch[1]}` };
    const rutubeMatch = content.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
    if (rutubeMatch) return { type: 'url', value: `https://rutube.ru/play/embed/${rutubeMatch[1]}` };
    const vkMatch = content.match(/(?:vk\.com|vkvideo\.ru)\/video(-?\d+)_(\d+)/);
    if (vkMatch) return { type: 'url', value: `https://vk.com/video_ext.php?oid=${vkMatch[1]}&id=${vkMatch[2]}&hd=2` };
    const ktalkMatch = content.match(/([a-zA-Z0-9]+)\.ktalk\.ru\/recordings\/([a-zA-Z0-9_-]+)/);
    if (ktalkMatch) return { type: 'url', value: `https://${ktalkMatch[1]}.ktalk.ru/recordings/${ktalkMatch[2]}` };
    const dzenMatch = content.match(/dzen\.ru\/(?:video\/watch|embed)\/([a-zA-Z0-9_-]+)/);
    if (dzenMatch) return { type: 'url', value: `https://dzen.ru/embed/${dzenMatch[1]}` };
    const okMatch = content.match(/ok\.ru\/video\/(\d+)/);
    if (okMatch) return { type: 'url', value: `https://ok.ru/videoembed/${okMatch[1]}` };
    const mailMatch = content.match(/my\.mail\.ru\/(?:mail|bk|inbox|list)\/([^\/]+)\/video\/([^\/]+)\/(\d+)/);
    if (mailMatch) return { type: 'url', value: `https://my.mail.ru/video/embed/${mailMatch[3]}` };
    const yandexMatch = content.match(/yandex\.ru\/video\/preview\/(\d+)/);
    if (yandexMatch) return { type: 'url', value: `https://yandex.ru/video/preview/${yandexMatch[1]}` };
    if (content.match(/^https?:\/\/.*\/recordings?\//i) || content.match(/^https?:\/\/.*\/video\//i)) return { type: 'url', value: content };
    return { type: null, value: null };
  };

  const embedResult = getEmbedFromContent(block.videoUrl || "");
  const hasValidEmbed = embedResult.type !== null;

  return (
    <div className="py-2">
      {hasValidEmbed ? (
        <div className="space-y-2">
          {embedResult.type === 'direct' ? (
            <div className="relative group/video">
              {embedResult.value?.startsWith('kinescope:') ? (
                <div className="aspect-video not-prose rounded-lg overflow-hidden bg-black">
                  <iframe
                    src={`https://kinescope.io/embed/${embedResult.value.replace('kinescope:', '')}`}
                    className="w-full h-full border-0"
                    allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                    allowFullScreen
                  />
                </div>
              ) : (
                <DirectVideoBlock url={embedResult.value || ''} />
              )}
              <Button variant="secondary" size="sm" className="absolute top-2 right-2 opacity-0 group-hover/video:opacity-100 z-10" onClick={() => onUpdate({ videoUrl: "" })}>Удалить</Button>
            </div>
          ) : (
            <LazyMediaPreview type="iframe">
              <div className="relative group/video aspect-video bg-black rounded-lg overflow-hidden">
                {embedResult.type === 'iframe' ? (
                  <div className="w-full h-full [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:border-0"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(embedResult.value || '', { ALLOWED_TAGS: ['iframe'], ALLOWED_ATTR: ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'title', 'referrerpolicy'] }) }} />
                ) : (
                  <iframe src={embedResult.value || ""} className="w-full h-full border-0" allowFullScreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media" referrerPolicy="no-referrer-when-downgrade" />
                )}
                <Button variant="secondary" size="sm" className="absolute top-2 right-2 opacity-0 group-hover/video:opacity-100" onClick={() => onUpdate({ videoUrl: "" })}>Удалить</Button>
              </div>
            </LazyMediaPreview>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Tabs value={videoUploadTab} onValueChange={setVideoUploadTab} className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="kinescope" className="flex-1 text-xs">Видеосервис+ (рекомендуется)</TabsTrigger>
              <TabsTrigger value="server" className="flex-1 text-xs">На сервер (до 2 ГБ)</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-sigma-purple/50 transition-colors">
            {videoUploadTab === "kinescope" && media.kinescopeUploadProgress !== null ? (
              <div className="space-y-4">
                <Video className="w-10 h-10 mx-auto text-sigma-purple animate-pulse" />
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2"><SigmaSpinner size="sm" className="text-sigma-purple" /><span className="text-sm font-medium">Загрузка в Видеосервис+...</span></div>
                  <div className="w-full max-w-xs mx-auto">
                    <div className="h-2 bg-secondary rounded-full overflow-hidden"><div className="h-full bg-sigma-purple transition-all duration-300 ease-out" style={{ width: `${media.kinescopeUploadProgress}%` }} /></div>
                    <p className="text-sm text-muted-foreground mt-1">{media.kinescopeUploadProgress}%</p>
                  </div>
                  <Button variant="outline" size="sm" className="mt-2 gap-1 text-destructive hover:text-destructive border-destructive/50 hover:bg-destructive/10" onClick={media.cancelVideoUpload}><Trash2 className="w-3 h-3" />Отменить</Button>
                </div>
              </div>
            ) : media.compressionProgress !== null ? (
              <div className="space-y-4">
                <Video className="w-10 h-10 mx-auto text-sigma-purple animate-pulse" />
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2"><SigmaSpinner size="sm" className="text-sigma-purple" /><span className="text-sm font-medium">Сжатие видео...</span></div>
                  <div className="w-full max-w-xs mx-auto">
                    <div className="h-2 bg-secondary rounded-full overflow-hidden"><div className="h-full bg-sigma-orange transition-all duration-300 ease-out" style={{ width: `${media.compressionProgress}%` }} /></div>
                    <p className="text-sm text-muted-foreground mt-1">{media.compressionProgress}%</p>
                  </div>
                </div>
              </div>
            ) : media.videoUploadProgress !== null ? (
              <UploadProgressBlock
                label="Загрузка видео..."
                progress={media.videoUploadProgress}
                uploadStartTime={media.uploadStartTime}
                uploadedBytes={media.uploadedBytes}
                uploadFileSize={media.uploadFileSize}
                onCancel={media.cancelVideoUpload}
              />
            ) : videoUploadTab === "kinescope" && !isKinescopeAvailable ? (
              <div className="space-y-3 py-2">
                <Lock className="w-10 h-10 mx-auto text-muted-foreground" />
                <p className="text-sm font-medium">Загрузка через Видеосервис+</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Профессиональный видеохостинг с CDN и DRM-защитой доступен на тарифе «Профессиональный» и выше.
                </p>
                <Button variant="outline" size="sm" className="gap-2"
                  onClick={() => navigate(organizationId ? `/organization/${organizationId}?tab=tariffs` : '/settings')}>
                  Перейти к тарифам →
                </Button>
              </div>
            ) : videoUploadTab === "kinescope" ? (
              <div key="kinescope-upload">
                <Video className="w-10 h-10 mx-auto mb-3 text-sigma-purple" />
                <p className="text-sm font-medium mb-1">Загрузить через Видеосервис+</p>
                <p className="text-xs text-muted-foreground mb-4">Любой размер файла • CDN • Профессиональный плеер</p>
                <input ref={media.kinescopeInputRef} type="file" accept="video/*,.ts,.m2ts,.mts,.mpg,.mpeg,video/mp2t" className="hidden"
                  onChange={(ev) => { const file = ev.target.files?.[0]; if (file) media.handleKinescopeUpload(file); }} />
                <Button type="button" className="gap-2 bg-sigma-purple text-white hover:bg-sigma-purple/90"
                  onClick={(ev) => { ev.stopPropagation(); ev.preventDefault(); const inp = media.kinescopeInputRef.current; if (inp) { inp.value = ''; inp.click(); } }}>
                  <Upload className="w-4 h-4" />Выбрать файл
                </Button>
              </div>
            ) : (
              <div key="server-upload" className="space-y-3">
                <Video className="w-10 h-10 mx-auto mb-3 text-sigma-purple" />
                <p className="text-sm font-medium mb-1">Загрузить видео на сервер</p>
                <p className="text-xs text-muted-foreground mb-4">MP4, MOV, AVI, .TS / .M2TS — до 2 ГБ</p>
                <input ref={media.videoInputRef} type="file" accept="video/*,.ts,.m2ts,.mts,.mpg,.mpeg,video/mp2t" className="hidden"
                  onChange={(ev) => { const file = ev.target.files?.[0]; if (file) media.handleVideoUpload(file, skipCompression); }} />
                <div className="flex flex-col items-center gap-2">
                  <Button type="button" className="gap-2 bg-sigma-purple text-white hover:bg-sigma-purple/90"
                    onClick={(ev) => { ev.stopPropagation(); ev.preventDefault(); const inp = media.videoInputRef.current; if (inp) { inp.value = ''; inp.click(); } }}>
                    <Upload className="w-4 h-4" />Выбрать файл
                  </Button>
                  <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                    <input type="checkbox" checked={skipCompression} onChange={(ev) => setSkipCompression(ev.target.checked)} className="rounded border-border" />
                    Без сжатия (быстрее)
                  </label>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowLibrary(true)}>
                    <FolderOpen className="w-4 h-4" />Из загруженных
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">или вставьте ссылку</span></div>
          </div>

          <Textarea value={block.videoUrl || ""} onChange={(e) => onUpdate({ videoUrl: e.target.value })} placeholder="https://youtube.com/watch?v=... или <iframe>...</iframe>" className="text-sm min-h-[80px] resize-none" />
          <p className="text-xs text-muted-foreground">Поддерживаются: YouTube, Vimeo, Rutube, VK Video, Видеосервис+, Одноклассники, Mail.ru, Дзен, Яндекс Видео</p>
        </div>
      )}
      <MediaLibraryDialog open={showLibrary} onClose={() => setShowLibrary(false)} onSelect={(url) => onUpdate({ videoUrl: url })} filter="video" organizationId={organizationId} />
    </div>
  );
}

// ─── AudioBlock ─────────────────────────────────────────────────
export function AudioBlock({ block, onUpdate }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void }) {
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingTts, setIsGeneratingTts] = useState(false);
  const [showTts, setShowTts] = useState(false);
  const [ttsText, setTtsText] = useState("");
  const [ttsVoice, setTtsVoice] = useState("Nec_24000");
  const audioUrl = block.audioUrl || "";

  useEffect(() => {
    if (block.pendingAI === "ai-audio" && !block.audioUrl) {
      setShowTts(true);
      onUpdate({ pendingAI: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.pendingAI]);

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith("audio/") || file.size > 50 * 1024 * 1024) return;
    setIsUploading(true);
    try {
      const fileName = `audio_${crypto.randomUUID()}.${file.name.split('.').pop() || 'mp3'}`;
      const { data: configData } = await (await import("@/integrations/supabase/client")).supabase.functions.invoke('get-external-storage-config');
      const useExternal = configData?.configured && configData?.url && configData?.key;
      const bucket = useExternal ? 'course-videos' : 'course-files';
      const supabaseClient = (await import("@/integrations/supabase/client")).supabase;
      let uploadedViaInternal = false;
      const { error } = await supabaseClient.storage.from(bucket).upload(fileName, file, { upsert: true });
      if (!error) uploadedViaInternal = true;
      const baseUrl = uploadedViaInternal ? import.meta.env.VITE_SUPABASE_URL : configData?.url;
      const publicUrl = `${baseUrl}/storage/v1/object/public/${bucket}/${fileName}`;
      onUpdate({ audioUrl: publicUrl });
    } catch (e) {
      console.error("Audio upload error:", e);
    } finally { setIsUploading(false); }
  };

  const handleGenerateTts = async () => {
    const text = ttsText.trim();
    if (!text) return;
    if (!(await checkAiLimitGlobal())) return;
    setIsGeneratingTts(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.functions.invoke("salutespeech-tts", {
        body: { text, voice: ttsVoice },
      });
      if (error) throw error;
      const audioBase64: string | undefined = data?.audio || data?.audioContent;
      if (!audioBase64) throw new Error("Озвучка не получена");
      // Convert base64 → Blob → upload to storage
      const bin = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
      const fileName = `ai-audio/${crypto.randomUUID()}.mp3`;
      const { error: upErr } = await supabase.storage.from("course-files").upload(fileName, bin, { contentType: "audio/mpeg", upsert: true });
      if (upErr) throw upErr;
      const publicUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/course-files/${fileName}`;
      onUpdate({ audioUrl: publicUrl });
      await incrementAiLimitGlobal();
      setShowTts(false);
      const { toast } = await import("sonner");
      toast.success("Аудио сгенерировано");
    } catch (e) {
      console.error("TTS generation error:", e);
      const { toast } = await import("sonner");
      toast.error(e instanceof Error ? e.message : "Ошибка генерации озвучки");
    } finally { setIsGeneratingTts(false); }
  };

  return (
    <div className="py-2">
      {audioUrl ? (
        <div className="space-y-2">
          <LazyMediaPreview type="audio"><audio controls preload="none" src={audioUrl} className="w-full rounded-lg" /></LazyMediaPreview>
          <div className="flex gap-2">
            <Input value={audioUrl} onChange={(e) => onUpdate({ audioUrl: e.target.value })} className="text-xs flex-1" />
            <Button variant="ghost" size="sm" onClick={() => onUpdate({ audioUrl: "" })}><Trash2 className="w-4 h-4" /></Button>
          </div>
        </div>
      ) : (
        <div className="bg-muted rounded-xl p-6 space-y-4">
          <div className="text-center">
            <Headphones className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-2">Добавьте аудио</p>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 justify-center flex-wrap">
              <Button variant="outline" size="sm" onClick={() => document.getElementById(`audio-upload-${block.id}`)?.click()} disabled={isUploading || isGeneratingTts}>
                {isUploading ? <SigmaSpinner size="sm" className="mr-2" /> : <Upload className="w-4 h-4 mr-2" />}Загрузить файл
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowTts(!showTts)} disabled={isUploading || isGeneratingTts} className={showTts ? "border-primary text-primary" : ""}>
                <Sparkles className="w-4 h-4 mr-2" />ИИ озвучка
              </Button>
            </div>
            <input id={`audio-upload-${block.id}`} type="file" accept="audio/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }} />
            {showTts && (
              <div className="space-y-2 p-3 rounded-lg bg-background border border-border">
                <Textarea value={ttsText} onChange={(e) => setTtsText(e.target.value)} placeholder="Введите текст для озвучки..." className="text-sm min-h-[80px]" disabled={isGeneratingTts} />
                <div className="flex gap-2 items-center">
                  <select value={ttsVoice} onChange={(e) => setTtsVoice(e.target.value)} disabled={isGeneratingTts} className="text-xs px-2 py-1.5 rounded-md border border-input bg-background flex-shrink-0">
                    <option value="Nec_24000">Наталья (ж)</option>
                    <option value="Bys_24000">Борис (м)</option>
                    <option value="May_24000">Майя (ж)</option>
                    <option value="Tur_24000">Тарас (м)</option>
                    <option value="Ost_24000">Остап (м)</option>
                    <option value="Pon_24000">Полина (ж)</option>
                  </select>
                  <Button size="sm" onClick={handleGenerateTts} disabled={!ttsText.trim() || isGeneratingTts} className="flex-1">
                    {isGeneratingTts ? <><SigmaSpinner size="sm" className="mr-1" /> Генерация...</> : <><Wand2 className="w-4 h-4 mr-1" /> Озвучить</>}
                  </Button>
                </div>
              </div>
            )}
            <div className="text-center text-xs text-muted-foreground">или</div>
            <Input value={audioUrl} onChange={(e) => onUpdate({ audioUrl: e.target.value })} placeholder="https://example.com/audio.mp3" className="text-sm" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DocumentBlock ──────────────────────────────────────────────
export function DocumentBlock({ block, onUpdate }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void }) {
  const [isUploading, setIsUploading] = useState(false);
  const documentUrl = block.documentUrl || "";
  const documentName = block.documentName || "";

  const handleFileUpload = async (file: File) => {
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!allowedTypes.includes(file.type) && !['pdf', 'doc', 'docx'].includes(ext || '')) {
      const { toast } = await import("sonner"); toast.error("Поддерживаются только PDF и Word файлы"); return;
    }
    if (file.size > 50 * 1024 * 1024) { const { toast } = await import("sonner"); toast.error("Максимальный размер файла — 50 МБ"); return; }
    setIsUploading(true);
    try {
      const fileName = `doc_${crypto.randomUUID()}.${ext || 'pdf'}`;
      const supabaseClient = (await import("@/integrations/supabase/client")).supabase;
      const { error } = await supabaseClient.storage.from('course-files').upload(fileName, file, { upsert: true });
      if (error) throw error;
      const publicUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/course-files/${fileName}`;
      onUpdate({ documentUrl: publicUrl, documentName: file.name });
    } catch (e) {
      console.error("Document upload error:", e);
      const { toast } = await import("sonner"); toast.error("Ошибка загрузки документа");
    } finally { setIsUploading(false); }
  };

  const docExt = documentName.split('.').pop()?.toLowerCase();
  const isPdf = docExt === 'pdf';

  return (
    <div className="py-2">
      {documentUrl ? (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 overflow-hidden">
          <div className="flex items-center gap-3 p-3 border-b border-indigo-500/20">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center"><BookOpen className="w-4 h-4 text-indigo-500" /></div>
            <span className="font-medium text-sm truncate flex-1">{documentName || 'Документ'}</span>
            <div className="flex gap-1">
              <a href={documentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-500 hover:underline px-2 py-1">Скачать</a>
              <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => onUpdate({ documentUrl: "", documentName: "" })}><Trash2 className="w-4 h-4" /></Button>
            </div>
          </div>
          <LazyMediaPreview type="document" className="aspect-[4/3]">
            <div className="aspect-[4/3]">
              <iframe src={isPdf ? `https://docs.google.com/gview?url=${encodeURIComponent(documentUrl)}&embedded=true` : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(documentUrl)}`} className="w-full h-full border-0" />
            </div>
          </LazyMediaPreview>
        </div>
      ) : (
        <div className="bg-muted rounded-xl p-6 space-y-4">
          <div className="text-center">
            <BookOpen className="w-8 h-8 mx-auto mb-2 text-indigo-500" />
            <p className="text-sm text-muted-foreground mb-2">Загрузите документ PDF или Word</p>
            <p className="text-xs text-muted-foreground/70">Поддерживаются форматы: .pdf, .doc, .docx (до 50 МБ)</p>
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="outline" size="sm" className="mx-auto" onClick={() => document.getElementById(`doc-upload-${block.id}`)?.click()} disabled={isUploading}>
              {isUploading ? <SigmaSpinner size="sm" className="mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
              {isUploading ? "Загрузка..." : "Загрузить файл"}
            </Button>
            <input id={`doc-upload-${block.id}`} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }} />
            <div className="text-center text-xs text-muted-foreground">или вставьте ссылку</div>
            <div className="flex gap-2">
              <Input value={documentUrl} onChange={(e) => onUpdate({ documentUrl: e.target.value })} placeholder="https://example.com/document.pdf" className="text-sm flex-1" />
              {!documentName && documentUrl && <Button size="sm" variant="outline" onClick={() => onUpdate({ documentName: documentUrl.split('/').pop() || 'document' })}>OK</Button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
