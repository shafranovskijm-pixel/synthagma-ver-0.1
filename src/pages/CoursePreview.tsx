import { useState } from "react";
import DOMPurify from "dompurify";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { FilePreviewDialog } from "@/components/course-learning/FilePreviewDialog";
import { ContentBlock, jsonToBlocks, BlockRenderer } from "@/components/course-builder/BlockEditor";
import { cn, getAdminAwareBackPath } from "@/lib/utils";
import { useCoursePreview } from "@/hooks/useCoursePreview";
import type { Lesson } from "@/hooks/useCoursePreview";
import {
  ArrowLeft, Circle, FileText, Video, ClipboardList, ChevronLeft, ChevronRight,
  Eye, BookOpen, Clock, Edit, Headphones, Image, Play, Presentation,
  Download, FileSpreadsheet, File, FileText as FileTextIcon, Presentation as PresentationIcon,
  MessageSquare, Lock
} from "lucide-react";

// ---- Helpers ----
function parseContentToBlocks(content: string): ContentBlock[] {
  try { const parsed = JSON.parse(content); return Array.isArray(parsed) ? parsed : jsonToBlocks(content); }
  catch { return jsonToBlocks(content); }
}

const canEmbedInIframe = (url: string): boolean => {
  const noEmbed = [/ktalk\.ru/i, /zoom\.us/i, /teams\.microsoft/i, /meet\.google/i];
  return !noEmbed.some(p => p.test(url));
};

const getVideoEmbedUrl = (content: string): { url: string; canEmbed: boolean } | null => {
  if (!content) return null;
  const iframeSrc = content.match(/<iframe[^>]*src=["']([^"']+)["']/i);
  if (iframeSrc) return { url: iframeSrc[1], canEmbed: true };
  const yt = content.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (yt) return { url: `https://www.youtube.com/embed/${yt[1]}`, canEmbed: true };
  const vim = content.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vim) return { url: `https://player.vimeo.com/video/${vim[1]}`, canEmbed: true };
  const rt = content.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
  if (rt) return { url: `https://rutube.ru/play/embed/${rt[1]}`, canEmbed: true };
  const vk = content.match(/(?:vk\.com|vkvideo\.ru)\/video(-?\d+)_(\d+)/);
  if (vk) return { url: `https://vk.com/video_ext.php?oid=${vk[1]}&id=${vk[2]}&hd=2`, canEmbed: true };
  const kt = content.match(/([a-zA-Z0-9]+)\.ktalk\.ru\/recordings\/([a-zA-Z0-9_-]+)/);
  if (kt) return { url: content, canEmbed: false };
  const ok = content.match(/ok\.ru\/video\/(\d+)/);
  if (ok) return { url: `https://ok.ru/videoembed/${ok[1]}`, canEmbed: true };
  const dz = content.match(/dzen\.ru\/video\/watch\/([a-zA-Z0-9]+)/);
  if (dz) return { url: `https://dzen.ru/embed/${dz[1]}`, canEmbed: true };
  if (content.match(/^https?:\/\/.+/i)) return { url: content, canEmbed: canEmbedInIframe(content) };
  return null;
};

// ---- Video Preview ----
const VideoPreview = ({ content }: { content: string }) => {
  if (!content) return null;
  if (content.trim().startsWith('<iframe')) {
    const sanitized = DOMPurify.sanitize(content, { ADD_TAGS: ['iframe'], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'src', 'width', 'height', 'title', 'referrerpolicy'] });
    return <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black" dangerouslySetInnerHTML={{ __html: sanitized }} />;
  }
  const result = getVideoEmbedUrl(content);
  if (result) {
    if (!result.canEmbed) return (
      <div className="aspect-video w-full rounded-2xl overflow-hidden bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 flex flex-col items-center justify-center gap-4">
        <Video className="w-16 h-16 text-primary/60" />
        <div className="text-center px-4">
          <p className="text-sm font-medium text-foreground mb-1">Видеозапись</p>
          <p className="text-xs text-muted-foreground mb-3">Этот сервис не поддерживает встраивание</p>
          <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            <Play className="w-4 h-4" />Открыть видео
          </a>
        </div>
      </div>
    );
    return <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black"><iframe src={result.url} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>;
  }
  return <div className="aspect-video w-full rounded-2xl overflow-hidden bg-muted flex items-center justify-center"><p className="text-sm text-muted-foreground">Неподдерживаемый формат видео</p></div>;
};

// ---- Slider ----
interface SliderSlide { id: string; content: string; title?: string; imageUrl?: string; }
const parseSliderContent = (content: string | null) => {
  try {
    if (!content) return { slides: [] as SliderSlide[], pptxFileUrl: undefined };
    const p = JSON.parse(content);
    if (Array.isArray(p)) return { slides: p, pptxFileUrl: undefined };
    if (typeof p === 'object' && p) return { slides: Array.isArray(p.slides) ? p.slides : [], pptxFileUrl: p.pptxFileUrl };
    return { slides: [], pptxFileUrl: undefined };
  } catch { return { slides: [] as SliderSlide[], pptxFileUrl: undefined }; }
};

const InlineSliderPreview = ({ slides, title }: { slides: SliderSlide[]; title: string }) => {
  const [idx, setIdx] = useState(0);
  const s = slides[idx];
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center"><Presentation className="w-6 h-6 text-amber-500" /></div>
        <div className="flex-1"><h3 className="font-display font-bold text-lg">{title}</h3><p className="text-sm text-muted-foreground">{slides.length} слайдов</p></div>
      </div>
      <div className="rounded-2xl border border-amber-500/30 bg-card overflow-hidden shadow-lg">
        <div className="p-6 min-h-[350px]">
          {s && <div className="space-y-4">
            {s.imageUrl && <div className="rounded-lg overflow-hidden border border-border bg-secondary/20"><img src={s.imageUrl} alt={s.title || 'Слайд'} className="w-full max-h-[500px] object-contain" /></div>}
            <h3 className="text-lg font-semibold">{s.title}</h3>
            {s.content && <div className="text-sm text-muted-foreground whitespace-pre-wrap">{s.content}</div>}
          </div>}
        </div>
        <div className="flex items-center justify-between p-3 border-t border-amber-500/20 bg-amber-500/5">
          <Button variant="ghost" size="sm" onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0} className="gap-1"><ChevronLeft className="w-4 h-4" /> Назад</Button>
          <div className="flex gap-1.5">{slides.map((_, i) => <button key={i} onClick={() => setIdx(i)} className={`w-2.5 h-2.5 rounded-full transition-colors ${i === idx ? "bg-amber-500" : "bg-amber-500/30 hover:bg-amber-500/50"}`} />)}</div>
          <Button variant="ghost" size="sm" onClick={() => setIdx(i => Math.min(slides.length - 1, i + 1))} disabled={idx === slides.length - 1} className="gap-1">Далее <ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  );
};

const SliderPreview = ({ content, title }: { content: string | null; title: string }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [viewerError, setViewerError] = useState(false);
  const { slides, pptxFileUrl } = parseSliderContent(content);
  if (pptxFileUrl) {
    const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(pptxFileUrl)}`;
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center"><Presentation className="w-6 h-6 text-amber-500" /></div>
          <div className="flex-1"><h3 className="font-display font-bold text-lg">{title}</h3><p className="text-sm text-muted-foreground">{slides.length} слайдов</p></div>
          <a href={pptxFileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-amber-500/10 text-amber-600 rounded-lg hover:bg-amber-500/20 transition-colors"><FileText className="w-3.5 h-3.5" />Скачать</a>
        </div>
        <div className="rounded-2xl border border-amber-500/30 bg-card overflow-hidden shadow-lg">
          <div className="relative w-full" style={{ minHeight: '600px' }}>
            {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-secondary/50 z-10"><div className="flex flex-col items-center gap-3"><SigmaSpinner size="lg" className="text-amber-500" /><p className="text-sm text-muted-foreground">Загрузка презентации...</p></div></div>}
            {viewerError ? <div className="absolute inset-0 flex items-center justify-center"><div className="text-center p-6"><Presentation className="w-16 h-16 mx-auto mb-4 text-amber-500/50" /><p className="text-muted-foreground mb-4">Не удалось загрузить просмотрщик</p><a href={pptxFileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"><FileText className="w-4 h-4" />Скачать презентацию</a></div></div>
            : <iframe src={viewerUrl} className="w-full h-full border-0" style={{ minHeight: '600px' }} onLoad={() => setIsLoading(false)} onError={() => { setIsLoading(false); setViewerError(true); }} title={title} allowFullScreen />}
          </div>
        </div>
      </div>
    );
  }
  if (slides.length > 0) return <InlineSliderPreview slides={slides} title={title} />;
  return <div className="space-y-6"><div className="rounded-2xl border-2 border-dashed border-border p-8 flex items-center justify-center min-h-[300px]"><div className="text-center text-muted-foreground"><Presentation className="w-12 h-12 mx-auto mb-4 opacity-50" /><p>Презентация не загружена</p></div></div></div>;
};

// ---- Helpers for icons ----
const getLessonIcon = (type: string) => {
  switch (type) { case 'video': return Video; case 'test': return ClipboardList; case 'audio': return Headphones; case 'image': return Image; case 'slider': return Presentation; default: return FileText; }
};
const getLessonTypeName = (type: string) => {
  switch (type) { case 'video': return 'Видео'; case 'test': return 'Тест'; case 'audio': return 'Аудио'; case 'image': return 'Изображение'; case 'slider': return 'Презентация'; default: return 'Текст'; }
};

// ---- File helpers ----
const getFileIcon = (ft: string | null) => {
  if (!ft) return File;
  const t = ft.toLowerCase();
  if (t === 'pdf') return FileTextIcon;
  if (['doc', 'docx', 'txt', 'rtf'].includes(t)) return FileTextIcon;
  if (['xls', 'xlsx'].includes(t)) return FileSpreadsheet;
  if (['ppt', 'pptx'].includes(t)) return PresentationIcon;
  return File;
};
const getFileColor = (ft: string | null) => {
  if (!ft) return 'text-muted-foreground bg-muted';
  const t = ft.toLowerCase();
  if (t === 'pdf') return 'text-red-500 bg-red-500/10';
  if (['doc', 'docx'].includes(t)) return 'text-blue-500 bg-blue-500/10';
  if (['xls', 'xlsx'].includes(t)) return 'text-green-500 bg-green-500/10';
  if (['ppt', 'pptx'].includes(t)) return 'text-orange-500 bg-orange-500/10';
  return 'text-muted-foreground bg-muted';
};
const formatSize = (bytes: number | null) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
};

// ======== Main Component ========
const CoursePreview = () => {
  const h = useCoursePreview();
  const {
    course, lessons, currentLesson, currentLessonIndex, loading, isTransitioning,
    testQuestions, selectedAnswers, setSelectedAnswers, lessonAttachments, courseDocuments,
    showDocumentsView, previewFile, setPreviewFile, contentRef, fromStore,
    goToNextLesson, goToPrevLesson, goToLesson, goToDocumentsView,
    navigateBack, navigateToEditor, fetchTestQuestions, courseId,
  } = h;

  const contentBlocks: ContentBlock[] = currentLesson?.content ? parseContentToBlocks(currentLesson.content) : [];

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center"><SigmaSpinner size="xl" className="mx-auto mb-4" /><p className="text-muted-foreground">Загрузка курса...</p></div>
    </div>
  );

  if (!course) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center"><BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" /><h1 className="text-2xl font-bold mb-4">Курс не найден</h1><Button onClick={navigateBack}>Вернуться в панель</Button></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-80 bg-card border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <Button variant="ghost" size="sm" onClick={navigateBack} className="mb-4 hover:bg-secondary">
            <ArrowLeft className="w-4 h-4 mr-2" />{fromStore ? 'Назад в магазин' : 'Назад в редактор'}
          </Button>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="gap-1 text-primary border-primary/30 bg-primary/5"><Eye className="w-3 h-3" />Предпросмотр</Badge>
            {!fromStore && !course.is_published && <Badge variant="secondary" className="text-muted-foreground">Черновик</Badge>}
          </div>
          <h2 className="font-display font-bold text-lg line-clamp-2">{course.title}</h2>
          {course.description && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{course.description}</p>}
          <div className="mt-4">
            <div className="flex justify-between text-sm text-muted-foreground mb-2"><span>Структура курса</span><span className="font-medium">{lessons.length} уроков</span></div>
            <Progress value={(currentLessonIndex + 1) / lessons.length * 100} className="h-2" />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {lessons.map((lesson, index) => {
              const Icon = getLessonIcon(lesson.type);
              const isCurrent = index === currentLessonIndex;
              return (
                <button key={lesson.id} onClick={() => goToLesson(index)} className={cn("w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-200", isCurrent ? "bg-primary/10 text-primary shadow-sm" : "hover:bg-muted")}>
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", isCurrent ? "bg-primary/10" : "bg-muted")}><span className={cn("text-sm font-medium", isCurrent ? "text-primary" : "text-muted-foreground")}>{index + 1}</span></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-medium line-clamp-2">{lesson.title}{lesson.is_locked && <Lock className="w-3.5 h-3.5 shrink-0 text-amber-500" />}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1"><Icon className="w-3 h-3" />{getLessonTypeName(lesson.type)}{lesson.is_locked && <span className="ml-1 text-amber-500">• Заблокирован</span>}</div>
                  </div>
                </button>
              );
            })}
            {courseDocuments.length > 0 && <>
              <div className="px-3 pt-4 pb-1"><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Материалы курса</p></div>
              <button onClick={goToDocumentsView} className={cn("w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-200", showDocumentsView ? "bg-primary/10 text-primary shadow-sm" : "hover:bg-muted")}>
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", showDocumentsView ? "bg-primary/10" : "bg-muted")}><BookOpen className={cn("w-4 h-4", showDocumentsView ? "text-primary" : "text-muted-foreground")} /></div>
                <div className="flex-1 min-w-0"><div className="text-sm font-medium">Материалы</div><div className="text-xs text-muted-foreground mt-0.5">{courseDocuments.length} {courseDocuments.length === 1 ? 'файл' : courseDocuments.length < 5 ? 'файла' : 'файлов'}</div></div>
              </button>
            </>}
          </div>
        </ScrollArea>
        <div className="p-4 border-t border-border space-y-3">
          <div className="flex items-center gap-3 text-sm text-muted-foreground"><div className="flex items-center gap-1"><Clock className="w-4 h-4" /><span>{lessons.length} уроков</span></div></div>
          {!fromStore && <Button onClick={navigateToEditor} className="w-full gap-2" variant="outline"><Edit className="w-4 h-4" />Редактировать</Button>}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col">
        <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <SigmaLogo size="sm" /><span className="text-muted-foreground">|</span>
            <Badge variant="outline" className="gap-1 text-sigma-cyan border-sigma-cyan/30"><Eye className="w-3 h-3" />Режим предпросмотра</Badge>
            <span className="font-medium truncate max-w-md">{showDocumentsView ? 'Материалы курса' : currentLesson?.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={currentLessonIndex === 0} onClick={goToPrevLesson} className="rounded-lg"><ChevronLeft className="w-4 h-4" /></Button>
            <div className="px-3 py-1 bg-secondary rounded-lg text-sm"><span className="font-medium">{currentLessonIndex + 1}</span><span className="text-muted-foreground"> / {lessons.length}</span></div>
            <Button variant="outline" size="sm" disabled={currentLessonIndex === lessons.length - 1} onClick={goToNextLesson} className="rounded-lg"><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </header>

        <ScrollArea className="flex-1" ref={contentRef}>
          <div className={cn("max-w-4xl mx-auto p-8 transition-all duration-300", isTransitioning ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0")}>
            {/* Documents View */}
            {showDocumentsView && (
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center"><BookOpen className="w-6 h-6 text-primary" /></div>
                  <div><h2 className="font-display font-bold text-xl">Материалы курса</h2><p className="text-sm text-muted-foreground">{courseDocuments.length} {courseDocuments.length === 1 ? 'документ' : courseDocuments.length < 5 ? 'документа' : 'документов'}</p></div>
                </div>
                <div className="space-y-4">
                  {courseDocuments.map((doc: any) => {
                    const ext = doc.type?.toLowerCase() || doc.name?.split('.').pop()?.toLowerCase() || '';
                    const isVideo = ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext);
                    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
                    const isAudio = ['mp3', 'wav', 'ogg', 'aac', 'flac'].includes(ext);
                    const allowDownload = course?.allow_materials_download !== false;
                    const DocIcon = isVideo ? Video : isImage ? Image : isAudio ? Headphones : ext === 'pdf' ? FileTextIcon : ['xls', 'xlsx'].includes(ext) ? FileSpreadsheet : ['ppt', 'pptx'].includes(ext) ? PresentationIcon : File;
                    const docColor = isVideo ? 'text-purple-500 bg-purple-500/10' : isImage ? 'text-pink-500 bg-pink-500/10' : isAudio ? 'text-green-500 bg-green-500/10' : ext === 'pdf' ? 'text-red-500 bg-red-500/10' : ['doc', 'docx'].includes(ext) ? 'text-blue-500 bg-blue-500/10' : ['xls', 'xlsx'].includes(ext) ? 'text-green-500 bg-green-500/10' : ['ppt', 'pptx'].includes(ext) ? 'text-orange-500 bg-orange-500/10' : 'text-muted-foreground bg-muted';
                    return (
                      <div key={doc.id} className="rounded-xl border border-border bg-card overflow-hidden">
                        <div className="flex items-center gap-3 p-4">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${docColor}`}><DocIcon className="w-5 h-5" /></div>
                          <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{doc.name}</p><p className="text-xs text-muted-foreground">{isVideo ? 'Видео' : isImage ? 'Изображение' : isAudio ? 'Аудио' : ext?.toUpperCase() || 'Файл'}</p></div>
                          <div className="flex items-center gap-2 shrink-0">
                            {allowDownload && doc.file_url && <a href={doc.file_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}><Button variant="ghost" size="icon" className="h-8 w-8"><Download className="w-4 h-4" /></Button></a>}
                            {!isVideo && !isImage && !isAudio && doc.file_url && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreviewFile({ url: doc.file_url, name: doc.name, type: ext || null })}><Eye className="w-4 h-4" /></Button>}
                          </div>
                        </div>
                        {isVideo && doc.file_url && <div className="px-4 pb-4"><video controls controlsList={allowDownload ? undefined : "nodownload"} className="w-full rounded-lg bg-black" preload="metadata"><source src={doc.file_url} />Ваш браузер не поддерживает видео.</video></div>}
                        {isImage && doc.file_url && <div className="px-4 pb-4"><img src={doc.file_url} alt={doc.name} className="w-full rounded-lg max-h-[600px] object-contain bg-secondary/20" /></div>}
                        {isAudio && doc.file_url && <div className="px-4 pb-4"><audio controls controlsList={allowDownload ? undefined : "nodownload"} className="w-full" preload="metadata"><source src={doc.file_url} />Ваш браузер не поддерживает аудио.</audio></div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Text lesson */}
            {currentLesson?.type === 'text' && (
              <div className="prose prose-lg dark:prose-invert max-w-none">
                {contentBlocks.length > 0 ? <BlockRenderer blocks={contentBlocks} /> : <div className="text-center py-12 text-muted-foreground"><FileText className="w-12 h-12 mx-auto mb-4 opacity-50" /><p>Контент урока пуст</p><p className="text-sm">Добавьте содержимое в редакторе</p></div>}
              </div>
            )}

            {/* Video lesson */}
            {currentLesson?.type === 'video' && (
              <div className="space-y-6">
                {currentLesson.content ? <VideoPreview content={currentLesson.content} /> : <div className="aspect-video rounded-2xl border-2 border-dashed border-border flex items-center justify-center"><div className="text-center text-muted-foreground"><Video className="w-12 h-12 mx-auto mb-4 opacity-50" /><p>Видео не добавлено</p></div></div>}
              </div>
            )}

            {/* Audio lesson */}
            {currentLesson?.type === 'audio' && (
              <div className="space-y-6">
                {currentLesson.content && currentLesson.content.startsWith('http') ? (
                  <div className="bg-card rounded-2xl border border-border p-6">
                    <div className="flex items-center gap-4 mb-4"><div className="w-16 h-16 rounded-xl bg-green-500/10 flex items-center justify-center"><Headphones className="w-8 h-8 text-green-500" /></div><div><h3 className="font-semibold">{currentLesson.title}</h3><p className="text-sm text-muted-foreground">Аудиолекция</p></div></div>
                    <audio controls preload="auto" className="w-full"><source src={currentLesson.content} type="audio/mpeg" /><source src={currentLesson.content} type="audio/wav" /><source src={currentLesson.content} type="audio/ogg" />Ваш браузер не поддерживает аудио.</audio>
                  </div>
                ) : <div className="aspect-[3/1] rounded-2xl border-2 border-dashed border-border flex items-center justify-center"><div className="text-center text-muted-foreground"><Headphones className="w-12 h-12 mx-auto mb-4 opacity-50" /><p>Аудио не добавлено</p></div></div>}
              </div>
            )}

            {currentLesson?.type === 'image' && <div className="space-y-6"><div className="rounded-2xl border-2 border-dashed border-border p-8 flex items-center justify-center min-h-[300px]"><div className="text-center text-muted-foreground"><Image className="w-12 h-12 mx-auto mb-4 opacity-50" /><p>Изображение не добавлено</p></div></div></div>}
            {currentLesson?.type === 'slider' && <SliderPreview content={currentLesson.content} title={currentLesson.title} />}

            {/* Feedback */}
            {currentLesson?.type === 'feedback' && (
              <div className="space-y-6">
                <div className="bg-gradient-to-r from-blue-500/10 to-primary/10 rounded-2xl p-6 border border-blue-500/20">
                  <div className="flex items-center gap-4"><div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center"><MessageSquare className="w-6 h-6 text-blue-500" /></div><div><h3 className="font-display font-bold text-lg">Обратная связь</h3><p className="text-sm text-muted-foreground">Ответ студента будет отправлен в чат организации</p></div></div>
                </div>
                {currentLesson.content && <div className="bg-card rounded-2xl border border-border p-6"><p className="text-lg font-medium mb-6">{currentLesson.content}</p><textarea disabled placeholder="Студент напишет ответ здесь..." className="flex min-h-[120px] w-full rounded-xl border border-input bg-muted/50 px-4 py-3 text-sm placeholder:text-muted-foreground opacity-60 cursor-not-allowed" rows={4} /><p className="text-xs text-muted-foreground mt-3">💬 В реальном курсе ответ будет отправлен в чат от лица студента</p></div>}
              </div>
            )}

            {/* Test */}
            {currentLesson?.type === 'test' && (
              <div className="space-y-6">
                <div className="bg-gradient-to-r from-sigma-orange/10 to-primary/10 rounded-2xl p-6 border border-sigma-orange/20">
                  <div className="flex items-center gap-4"><div className="w-12 h-12 rounded-xl bg-sigma-orange/10 flex items-center justify-center"><ClipboardList className="w-6 h-6 text-sigma-orange" /></div><div><h3 className="font-display font-bold text-lg">Тест: {currentLesson.title}</h3><p className="text-sm text-muted-foreground">{testQuestions.length} {testQuestions.length === 1 ? 'вопрос' : testQuestions.length < 5 ? 'вопроса' : 'вопросов'}</p></div></div>
                </div>
                {testQuestions.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    {currentLesson.test_questions_count && currentLesson.test_questions_count > 0 ? <><p>Вопросы загружаются...</p><button onClick={() => fetchTestQuestions(currentLesson.id)} className="mt-3 text-sm text-primary hover:underline">Обновить вопросы</button></> : <><p>Вопросы не добавлены</p><p className="text-sm">Добавьте вопросы в редакторе</p></>}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {testQuestions.map((question, qIndex) => {
                      const options = Array.isArray(question.options) ? question.options : [];
                      return (
                        <div key={question.id} className="bg-card rounded-2xl border border-border p-6">
                          <div className="flex items-start gap-4 mb-4"><div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><span className="text-sm font-bold text-primary">{qIndex + 1}</span></div><h4 className="font-medium text-lg">{question.question}</h4></div>
                          {question.image_url && <img src={question.image_url} alt="Изображение к вопросу" className="rounded-lg max-h-64 object-contain border border-border mt-2 mb-4 ml-12" />}
                          <div className="space-y-3 ml-12">
                            {options.map((option: unknown, oIndex: number) => {
                              const optionText = typeof option === 'object' && option !== null && 'text' in option ? (option as { text: string }).text : String(option);
                              return (
                                <button key={oIndex} onClick={() => setSelectedAnswers(prev => ({ ...prev, [question.id]: oIndex }))} className={cn("w-full p-4 rounded-xl border text-left transition-all", selectedAnswers[question.id] === oIndex ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50")}>
                                  <div className="flex items-center gap-3">
                                    <div className={cn("w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all", selectedAnswers[question.id] === oIndex ? "border-primary bg-primary" : "border-muted-foreground/40")}>{selectedAnswers[question.id] === oIndex && <div className="w-2 h-2 rounded-full bg-primary-foreground" />}</div>
                                    <span>{optionText}</span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Attachments */}
            {currentLesson && lessonAttachments[currentLesson.id] && lessonAttachments[currentLesson.id].length > 0 && (() => {
              const atts = lessonAttachments[currentLesson.id];
              const lectures = atts.filter((a: any) => a.category === 'lecture');
              const materials = atts.filter((a: any) => a.category === 'material');
              const renderFiles = (files: typeof atts) => (
                <div className="grid gap-3 sm:grid-cols-2">
                  {files.map((att: any) => {
                    const Icon = getFileIcon(att.file_type);
                    const color = getFileColor(att.file_type);
                    return (
                      <button key={att.id} onClick={() => setPreviewFile({ url: att.file_url, name: att.name, type: att.file_type })} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-secondary/50 transition-colors group text-left">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}><Icon className="w-5 h-5" /></div>
                        <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{att.name}</p><p className="text-xs text-muted-foreground">{att.file_type?.toUpperCase()} {att.file_size ? `• ${formatSize(att.file_size)}` : ''}</p></div>
                        <Eye className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                      </button>
                    );
                  })}
                </div>
              );
              return (
                <div className="mt-8 space-y-6 animate-fade-in">
                  {lectures.length > 0 && <div><h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">📄 Лекции</h3>{renderFiles(lectures)}</div>}
                  {materials.length > 0 && <div><h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">📎 Методические материалы</h3>{renderFiles(materials)}</div>}
                </div>
              );
            })()}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-12 pt-6 border-t border-border">
              <Button variant="outline" onClick={goToPrevLesson} disabled={currentLessonIndex === 0} className="gap-2"><ChevronLeft className="w-4 h-4" />Предыдущий</Button>
              {currentLessonIndex < lessons.length - 1 ? <Button onClick={goToNextLesson} className="gap-2 btn-gradient">Следующий<ChevronRight className="w-4 h-4" /></Button>
              : fromStore ? <Button onClick={navigateBack} className="gap-2"><ArrowLeft className="w-4 h-4" />Назад в магазин</Button>
              : <Button onClick={navigateToEditor} className="gap-2"><Edit className="w-4 h-4" />Вернуться в редактор</Button>}
            </div>
          </div>
        </ScrollArea>
      </main>
      {previewFile && <FilePreviewDialog open={!!previewFile} onOpenChange={open => !open && setPreviewFile(null)} fileUrl={previewFile.url} fileName={previewFile.name} fileType={previewFile.type} allowDownload={course?.allow_materials_download !== false} />}
    </div>
  );
};

export default CoursePreview;
