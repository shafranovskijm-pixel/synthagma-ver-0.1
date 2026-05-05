import { useState } from "react";
import DOMPurify from "dompurify";
import { useNavigate } from "react-router-dom";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useLessonMedia } from "@/hooks/useLessonMedia";
import { LazyMediaPreview } from "@/components/course-builder/LazyMediaPreview";
import { MediaLibraryDialog } from "../../../MediaLibraryDialog";
import { UploadProgressBlock } from "@/components/course-builder/UploadProgressBlock";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Video, Upload, FolderOpen, Trash2, Lock, ExternalLink, Download } from "lucide-react";
import type { ContentBlock } from "../../types";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { DirectVideoBlock } from "./DirectVideoBlock";

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
