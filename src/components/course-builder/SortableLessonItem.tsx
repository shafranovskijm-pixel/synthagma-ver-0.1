import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  GripVertical, FileText, Video, Image, FileQuestion,
  Trash2, Eye, Sparkles, Upload, ChevronDown, ChevronUp,
  Loader2, Headphones, Volume2, Pause, Play, Square,
  Presentation, FileSpreadsheet, FolderOpen, Bot, CheckCircle2,
  Lock,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { SALUTE_VOICES, getStoredTTSSettings, saveTTSSettings } from "@/components/student/TTSSettingsDialog";

import { toast } from "sonner";
import { MediaLibraryDialog } from "@/components/course-builder/MediaLibraryDialog";
import { BlockEditor, blocksToJson, ContentBlock } from "@/components/course-builder/BlockEditor";
import { TestQuestionEditor } from "@/components/course-builder/TestQuestionEditor";
import { TestImportDialog } from "@/components/course-builder/TestImportDialog";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { uploadToStorage } from "@/utils/courseBuilderHelpers";
import {
  type LessonType, type TestQuestionLocal, type Lesson, type GeneratedQuestion,
  lessonIcons, lessonColors,
} from "@/components/course-builder/LessonTypeConfig";
import { VideoPreviewInline } from "@/components/course-builder/VideoPreviewInline";
import { LazyMediaPreview } from "@/components/course-builder/LazyMediaPreview";
import { SliderLessonEditor } from "@/components/course-builder/SliderLessonEditor";
import { LessonAttachments } from "@/components/course-builder/LessonAttachments";
import { TestAnswersDialog } from "@/components/course-builder/TestAnswersDialog";
import { useLessonMedia } from "@/hooks/useLessonMedia";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useNavigate } from "react-router-dom";
import type { ParsedAnswer } from "@/utils/testAnswersExport";

interface SortableLessonProps {
  lesson: Lesson;
  index: number;
  onToggle: () => void;
  onUpdate: (updates: Partial<Lesson>) => void;
  onDelete: () => void;
  courseId: string | undefined;
  courseTitle: string;
  courseDescription: string;
  organizationId?: string;
  generatedQuestions?: GeneratedQuestion[];
  onQuestionsProcessed?: () => void;
}

export function SortableLessonItem({
  lesson, index, onToggle, onUpdate, onDelete,
  courseId, courseTitle, courseDescription,
  organizationId,
  generatedQuestions, onQuestionsProcessed,
}: SortableLessonProps) {
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [skipCompression, setSkipCompression] = useState(false);
  const navigate = useNavigate();
  const { limits } = useSubscriptionLimits(organizationId || null);
  const isKinescopeAvailable = limits.kinescopeEnabled;
  const [videoUploadTab, setVideoUploadTab] = useState<string>(isKinescopeAvailable ? "kinescope" : "server");
  const media = useLessonMedia(lesson.id, courseId, onUpdate);

  // SaluteSpeech TTS for course builder preview
  const [saluteVoice, setSaluteVoice] = useState(() => getStoredTTSSettings().saluteVoice);
  const [isSaluteSpeaking, setIsSaluteSpeaking] = useState(false);
  const [isSaluteLoading, setIsSaluteLoading] = useState(false);
  const saluteAudioRef = useRef<HTMLAudioElement | null>(null);
  const saluteCacheRef = useRef<Map<string, string>>(new Map());

  const extractTextFromBlocks = useCallback((blocks: ContentBlock[]): string => {
    return blocks
      .filter(b => ["heading1", "heading2", "quote", "bulletList", "numberedList", "paragraph"].includes(b.type))
      .map(b => (b.content || "").replace(/<[^>]+>/g, ""))
      .filter(t => t.trim())
      .join(". ");
  }, []);

  const stopSaluteTTS = useCallback(() => {
    if (saluteAudioRef.current) { saluteAudioRef.current.pause(); saluteAudioRef.current.src = ''; saluteAudioRef.current = null; }
    setIsSaluteSpeaking(false); setIsSaluteLoading(false);
  }, []);

  const handleSaluteTTS = useCallback(async (blocks: ContentBlock[]) => {
    if (isSaluteSpeaking || isSaluteLoading) { stopSaluteTTS(); return; }
    const text = extractTextFromBlocks(blocks);
    if (!text.trim()) { toast.error("Нет текста для озвучивания"); return; }

    const hashText = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return h.toString(36); };
    const cacheKey = `${saluteVoice}:${hashText(text)}`;
    const cached = saluteCacheRef.current.get(cacheKey);

    const playAudio = async (url: string, fromCache = false) => {
      const audio = new Audio(url);
      saluteAudioRef.current = audio;
      audio.onplay = () => { setIsSaluteLoading(false); setIsSaluteSpeaking(true); };
      audio.onended = () => { setIsSaluteSpeaking(false); };
      audio.onerror = () => { setIsSaluteSpeaking(false); setIsSaluteLoading(false); toast.error('Ошибка воспроизведения'); };
      setIsSaluteLoading(true);
      await audio.play();
    };

    if (cached) { await playAudio(cached, true); return; }

    setIsSaluteLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/salutespeech-tts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
          body: JSON.stringify({ text, voice: saluteVoice }),
        }
      );
      if (!response.ok) { const err = await response.json().catch(() => ({})); toast.error(err.error || `Ошибка: ${response.status}`); setIsSaluteLoading(false); return; }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      saluteCacheRef.current.set(cacheKey, url);
      await playAudio(url);
    } catch { toast.error('Ошибка озвучивания'); setIsSaluteLoading(false); }
  }, [saluteVoice, isSaluteSpeaking, isSaluteLoading, stopSaluteTTS, extractTextFromBlocks]);

  const handleVoiceChange = (voiceId: string) => {
    setSaluteVoice(voiceId);
    const settings = getStoredTTSSettings();
    saveTTSSettings({ ...settings, saluteVoice: voiceId, provider: 'salutespeech' });
  };

  useEffect(() => { return () => { stopSaluteTTS(); }; }, []);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lesson.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 1000 : 'auto' as const };
  const Icon = lessonIcons[lesson.type] || FileText;

  useEffect(() => { if (!isPreviewMode) media.handleStopSpeech(); }, [isPreviewMode]);

  const onGenerate = () => media.handleGenerateContent(lesson.title, lesson.type, courseTitle, courseDescription, lesson.blocks);

  return (
    <div ref={setNodeRef} style={style} className="border border-border rounded-xl overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-secondary/50 transition-colors" onClick={onToggle}>
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none" onClick={(e) => e.stopPropagation()}>
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
        <span className="text-sm font-medium text-muted-foreground w-8">{index + 1}.</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${lessonColors[lesson.type]}`}><Icon className="w-4 h-4" /></div>
        <textarea
          value={lesson.title}
          onChange={(e) => { e.stopPropagation(); onUpdate({ title: e.target.value }); }}
          onClick={(e) => e.stopPropagation()}
          rows={1}
          className="flex-1 border-0 bg-transparent focus-visible:outline-none focus-visible:ring-0 px-0 resize-none overflow-hidden min-h-[36px] text-sm font-medium py-2"
          onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
          ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
        />
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
        {lesson.expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </div>

      {lesson.expanded && (
        <div className="p-4 pt-0 border-t border-border">
          {/* Text / Lesson */}
          {(lesson.type === "text" || lesson.type === "lesson" || lesson.type === "practice") && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Button variant={isPreviewMode ? "outline" : "default"} size="sm" className="rounded-lg text-xs" onClick={() => setIsPreviewMode(false)}>Редактор</Button>
                  <Button variant={isPreviewMode ? "default" : "outline"} size="sm" className="rounded-lg text-xs gap-1" onClick={() => setIsPreviewMode(true)}><Eye className="w-3 h-3" />Предпросмотр</Button>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="rounded-lg text-xs gap-1" onClick={() => handleSaluteTTS(lesson.blocks || [])} disabled={isSaluteLoading}>
                    {isSaluteLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : isSaluteSpeaking ? <Square className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                    {isSaluteLoading ? '...' : isSaluteSpeaking ? 'Стоп' : 'Озвучить'}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="rounded-lg text-xs gap-1 px-2">
                        <span className="max-w-[70px] truncate">{SALUTE_VOICES.find(v => v.id === saluteVoice)?.name.split(' ')[0] || 'Голос'}</span>
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {SALUTE_VOICES.map(voice => (
                        <DropdownMenuItem key={voice.id} onClick={() => handleVoiceChange(voice.id)} className={saluteVoice === voice.id ? "bg-primary/10 font-medium" : ""}>
                          <Volume2 className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                          {voice.name}
                          {saluteVoice === voice.id && <CheckCircle2 className="w-3.5 h-3.5 ml-auto text-primary" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenuSeparator className="hidden" />
                  <Button variant="outline" size="sm" className="rounded-lg text-xs gap-1 border-primary text-primary hover:bg-primary/10" onClick={onGenerate} disabled={media.isGeneratingContent}>
                    {media.isGeneratingContent ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    {media.isGeneratingContent ? "Генерация..." : "Написать с AI"}
                  </Button>
                </div>
              </div>
              {isPreviewMode ? (
                <div className="relative">
                  <div className="bg-secondary/30 rounded-xl p-6 prose prose-sm dark:prose-invert max-w-none min-h-[200px]">
                    <BlockEditor blocks={lesson.blocks || []} onChange={() => {}} readOnly />
                  </div>
                </div>
              ) : (
                <BlockEditor blocks={lesson.blocks || []} onChange={(blocks) => onUpdate({ blocks, content: blocksToJson(blocks) })} courseTitle={courseTitle} lessonTitle={lesson.title} />
              )}
            </div>
          )}

          {/* Video */}
          {lesson.type === "video" && (
            <div className="space-y-4">
              {(lesson.thumbnailUrl || lesson.videoScript) && (
                <div className="bg-gradient-to-r from-sigma-purple/10 to-primary/10 rounded-xl p-4 border border-sigma-purple/20">
                  <h4 className="font-medium text-sm mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4 text-sigma-purple" />AI-сгенерированный контент</h4>
                  {lesson.thumbnailUrl && <div className="mb-3"><p className="text-xs text-muted-foreground mb-2">Превью:</p><img src={lesson.thumbnailUrl} alt="Превью видео" className="rounded-lg max-h-48 object-contain border border-border" /></div>}
                  {lesson.videoScript && <div><p className="text-xs text-muted-foreground mb-2">Сценарий:</p><div className="bg-background/50 rounded-lg p-3 text-sm max-h-40 overflow-y-auto">{lesson.videoScript}</div></div>}
                  <p className="text-xs text-muted-foreground mt-3">💡 Для создания видео используйте: Runway ML, Pika Labs, или загрузите готовое видео</p>
                </div>
              )}
              <Tabs value={videoUploadTab} onValueChange={setVideoUploadTab} className="w-full">
                <TabsList className="w-full mb-4">
                  <TabsTrigger value="kinescope" className="flex-1 text-xs">Kinescope (рекомендуется)</TabsTrigger>
                  <TabsTrigger value="server" className="flex-1 text-xs">На сервер (до 2 ГБ)</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-sigma-purple/50 transition-colors">
                {/* Kinescope upload progress */}
                {videoUploadTab === "kinescope" && media.kinescopeUploadProgress !== null ? (
                  <div className="space-y-4">
                    <Video className="w-10 h-10 mx-auto text-sigma-purple animate-pulse" />
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-sigma-purple" /><span className="text-sm font-medium">Загрузка в Kinescope...</span></div>
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
                      <div className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-sigma-purple" /><span className="text-sm font-medium">Сжатие видео...</span></div>
                      <div className="w-full max-w-xs mx-auto">
                        <div className="h-2 bg-secondary rounded-full overflow-hidden"><div className="h-full bg-sigma-orange transition-all duration-300 ease-out" style={{ width: `${media.compressionProgress}%` }} /></div>
                        <p className="text-sm text-muted-foreground mt-1">{media.compressionProgress}%</p>
                      </div>
                    </div>
                  </div>
                ) : media.videoUploadProgress !== null ? (
                  <div className="space-y-4">
                    <Video className="w-10 h-10 mx-auto text-sigma-purple animate-pulse" />
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-sigma-purple" /><span className="text-sm font-medium">Загрузка видео...</span></div>
                      <div className="w-full max-w-xs mx-auto">
                        <div className="h-2 bg-secondary rounded-full overflow-hidden"><div className="h-full bg-sigma-purple transition-all duration-300 ease-out" style={{ width: `${media.videoUploadProgress}%` }} /></div>
                        <p className="text-sm text-muted-foreground mt-1">{media.videoUploadProgress}%</p>
                      </div>
                      <Button variant="outline" size="sm" className="mt-2 gap-1 text-destructive hover:text-destructive border-destructive/50 hover:bg-destructive/10" onClick={media.cancelVideoUpload}><Trash2 className="w-3 h-3" />Отменить</Button>
                    </div>
                  </div>
                ) : videoUploadTab === "kinescope" && !isKinescopeAvailable ? (
                  <div className="space-y-3 py-2">
                    <Lock className="w-10 h-10 mx-auto text-muted-foreground" />
                    <p className="text-sm font-medium">Загрузка через Kinescope</p>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      Профессиональный видеохостинг с CDN и DRM-защитой доступен на тарифе «Профессиональный» и выше.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => navigate(organizationId ? `/organization/${organizationId}?tab=tariffs` : '/settings')}
                    >
                      Перейти к тарифам →
                    </Button>
                  </div>
                ) : videoUploadTab === "kinescope" ? (
                  <>
                    <Video className="w-10 h-10 mx-auto mb-3 text-sigma-purple" />
                    <p className="text-sm font-medium mb-1">Загрузить через Kinescope</p>
                    <p className="text-xs text-muted-foreground mb-4">Любой размер файла • CDN • Профессиональный плеер</p>
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-sigma-purple text-white rounded-lg cursor-pointer hover:bg-sigma-purple/90 transition-colors">
                      <Upload className="w-4 h-4" /><span className="text-sm font-medium">Выбрать файл</span>
                      <input ref={media.kinescopeInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) media.handleKinescopeUpload(file); }} />
                    </label>
                  </>
                ) : (
                  <>
                    <Video className="w-10 h-10 mx-auto mb-3 text-sigma-purple" />
                    <p className="text-sm font-medium mb-1">Загрузить видео на сервер</p>
                    <p className="text-xs text-muted-foreground mb-4">MP4, MOV, AVI и др. — до 2 ГБ</p>
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-sigma-purple text-white rounded-lg cursor-pointer hover:bg-sigma-purple/90 transition-colors">
                      <Upload className="w-4 h-4" /><span className="text-sm font-medium">Выбрать файл</span>
                      <input ref={media.videoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) media.handleVideoUpload(file, skipCompression); }} />
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none mt-1">
                      <input type="checkbox" checked={skipCompression} onChange={(e) => setSkipCompression(e.target.checked)} className="rounded border-border" />
                      Без сжатия (быстрее)
                    </label>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowMediaLibrary(true)}>
                      <FolderOpen className="w-4 h-4" />
                      Из загруженных
                    </Button>
                    <MediaLibraryDialog
                      open={showMediaLibrary}
                      onClose={() => setShowMediaLibrary(false)}
                      onSelect={(url) => onUpdate({ content: url })}
                      filter="video"
                    />
                  </>
                )}
              </div>
              <div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">или вставьте ссылку</span></div></div>
              <div className="space-y-2">
                <Label>Ссылка на видео или код для встраивания</Label>
                <Textarea value={lesson.content || ''} onChange={(e) => onUpdate({ content: e.target.value })} placeholder="Вставьте ссылку (YouTube, Vimeo, Rutube, VK Video, Дзен и др.) или код iframe для встраивания" className="rounded-xl min-h-[100px] font-mono text-sm" />
                <p className="text-xs text-muted-foreground">Поддерживаются: YouTube, Vimeo, Rutube, VK Video, Kinescope, Одноклассники, Mail.ru, Дзен, Яндекс Видео</p>
              </div>
              {lesson.content && (
                <div className="space-y-2">
                  <Label className="text-sm">Предпросмотр</Label>
                  {lesson.content.startsWith('kinescope:') ? (
                    <div className="relative">
                      <VideoPreviewInline content={lesson.content} />
                      <Button variant="ghost" size="sm" className="absolute top-2 right-2 h-8 text-destructive hover:text-destructive bg-background/80 backdrop-blur-sm" onClick={() => onUpdate({ content: '' })}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  ) : lesson.content.includes('supabase') || lesson.content.includes('.mp4') || lesson.content.includes('.webm') || lesson.content.includes('.mov') ? (
                    <div className="relative">
                      <LazyMediaPreview type="video">
                        <video controls preload="none" controlsList="nodownload" className="w-full rounded-xl border border-border" src={lesson.content}>Ваш браузер не поддерживает видео.</video>
                      </LazyMediaPreview>
                      <Button variant="ghost" size="sm" className="absolute top-2 right-2 h-8 text-destructive hover:text-destructive bg-background/80 backdrop-blur-sm" onClick={() => onUpdate({ content: '' })}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  ) : <VideoPreviewInline content={lesson.content} />}
                </div>
              )}
            </div>
          )}

          {/* Audio */}
          {lesson.type === "audio" && (
            <div className="space-y-3">
              <Input value={lesson.content} onChange={(e) => onUpdate({ content: e.target.value })} placeholder="Вставьте ссылку на аудио или загрузите файл" className="rounded-xl" />
              <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
                <Headphones className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Загрузите аудиофайл (MP3, WAV, OGG)</p>
                <input type="file" accept="audio/*" className="mt-3" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file && courseId) {
                    const toastId = toast.loading("Загрузка аудио...");
                    try {
                      const fileExt = file.name.split('.').pop();
                      const fileName = `audio_${lesson.id}_${Date.now()}.${fileExt}`;
                      const result = await uploadToStorage(file, 'course-files', `${courseId}/${fileName}`);
                      if (!result) throw new Error('Upload failed');
                      onUpdate({ content: result.url });
                      toast.success(result.storage === 'external' ? "Аудио загружено во внешнее хранилище!" : "Аудио загружено!", { id: toastId });
                    } catch (error: any) { toast.error(`Ошибка загрузки: ${error.message}`, { id: toastId }); }
                  }
                }} />
              </div>
              {lesson.content && lesson.content.startsWith('http') && (
                <LazyMediaPreview type="audio">
                  <audio controls preload="none" className="w-full mt-2"><source src={lesson.content} type="audio/mpeg" /><source src={lesson.content} type="audio/wav" /><source src={lesson.content} type="audio/ogg" /></audio>
                </LazyMediaPreview>
              )}
            </div>
          )}

          {/* Image */}
          {lesson.type === "image" && (
            <div className="space-y-3">
              <Input value={lesson.content} onChange={(e) => onUpdate({ content: e.target.value })} placeholder="Вставьте ссылку на изображение или загрузите файл" className="rounded-xl" />
              <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
                <Image className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Загрузите изображение (JPG, PNG, GIF, WebP)</p>
                <input type="file" accept="image/*" className="mt-3" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file && courseId) {
                    const toastId = toast.loading("Загрузка изображения...");
                    try {
                      const fileExt = file.name.split('.').pop();
                      const fileName = `image_${lesson.id}_${Date.now()}.${fileExt}`;
                      const result = await uploadToStorage(file, 'course-files', `${courseId}/${fileName}`);
                      if (!result) throw new Error('Upload failed');
                      onUpdate({ content: result.url });
                      toast.success(result.storage === 'external' ? "Изображение загружено во внешнее хранилище!" : "Изображение загружено!", { id: toastId });
                    } catch (error: any) { toast.error(`Ошибка загрузки: ${error.message}`, { id: toastId }); }
                  }
                }} />
              </div>
              {lesson.content && (lesson.content.startsWith('http') || lesson.content.startsWith('data:image')) && (
                <div className="mt-3 rounded-xl overflow-hidden border border-border"><img src={lesson.content} alt="Превью" className="w-full max-h-96 object-contain bg-secondary/20" /></div>
              )}
            </div>
          )}

          {/* Test */}
          {lesson.type === "test" && (
            <div className="space-y-4">
              <div className="bg-secondary/30 rounded-xl p-4 border border-border">
                <h4 className="font-medium text-sm mb-3 flex items-center gap-2"><FileQuestion className="w-4 h-4 text-sigma-orange" />Настройки теста</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm">Проходной балл (%)</Label>
                    <Input type="number" min={0} max={100} value={lesson.testPassingScore ?? 60} onChange={(e) => onUpdate({ testPassingScore: parseInt(e.target.value) || 60 })} className="rounded-lg" />
                    <p className="text-xs text-muted-foreground">Минимальный % правильных ответов для прохождения теста</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Показывать вопросов</Label>
                    <Input type="number" min={1} value={lesson.testQuestionsToShow ?? ''} onChange={(e) => { const val = e.target.value; onUpdate({ testQuestionsToShow: val ? parseInt(val) : null }); }} placeholder="Все" className="rounded-lg" />
                    <p className="text-xs text-muted-foreground">Оставьте пустым, чтобы показать все вопросы.</p>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 flex-wrap">
                <TestImportDialog onImport={(imported) => {
                  const newQuestions = imported.map((q) => ({ question: q.question, options: q.options, correctAnswer: q.correctAnswer, ...(q.explanation ? { explanation: q.explanation } : {}) }));
                  onUpdate({ content: JSON.stringify({ generatedQuestions: newQuestions }) });
                  toast.success(`Импортировано ${imported.length} вопросов`);
                }}>
                  <Button variant="outline" size="sm" className="rounded-lg text-xs gap-1"><FileSpreadsheet className="w-3 h-3" />Импорт из Excel / TXT</Button>
                </TestImportDialog>
                <TestAnswersDialog
                  questions={(lesson.questions as any[] || []).map((q: any) => ({ question: q.question, options: (q.options || []).map((o: any) => typeof o === 'string' ? o : (o?.text || o?.label || String(o))), correctAnswer: q.correct_answer }))}
                  courseTitle={courseTitle}
                  lessonTitle={lesson.title}
                  onApplyAnswers={(answers: ParsedAnswer[]) => {
                    const updated = [...(lesson.questions as any[] || [])];
                    answers.forEach(a => {
                      if (updated[a.questionNumber - 1]) {
                        updated[a.questionNumber - 1] = { ...updated[a.questionNumber - 1], correct_answer: a.answerIndex };
                      }
                    });
                    onUpdate({ questions: updated as TestQuestionLocal[] });
                  }}
                >
                  <Button variant="outline" size="sm" className="rounded-lg text-xs gap-1 border-primary/50 text-primary hover:bg-primary/10">
                    <Bot className="w-3 h-3" />Ответы через AI
                  </Button>
                </TestAnswersDialog>
                <Button variant="outline" size="sm" className="rounded-lg text-xs gap-1 border-primary text-primary hover:bg-primary/10" onClick={onGenerate} disabled={media.isGeneratingContent}>
                  {media.isGeneratingContent ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {media.isGeneratingContent ? "Генерация..." : "Сгенерировать вопросы с AI"}
                </Button>
              </div>
              <TestQuestionEditor
                lessonId={lesson.id} courseId={courseId}
                initialQuestions={lesson.questions as any}
                generatedQuestions={(() => { try { return JSON.parse(lesson.content || '{}').generatedQuestions; } catch { return undefined; } })()}
                onQuestionsProcessed={() => onUpdate({ content: '' })}
                onQuestionsChange={(questions) => onUpdate({ questions: questions as TestQuestionLocal[] })}
              />
            </div>
          )}

          {/* Slider */}
          {lesson.type === "slider" && <SliderLessonEditor lesson={lesson} courseId={courseId} onUpdate={onUpdate} />}

          {/* Feedback */}
          {lesson.type === "feedback" && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Вопрос для студента</Label>
              <Textarea
                value={lesson.content}
                onChange={(e) => onUpdate({ content: e.target.value })}
                placeholder="Введите вопрос, на который студент должен ответить. Его ответ будет отправлен в чат организации."
                className="rounded-xl min-h-[120px]"
              />
              <p className="text-xs text-muted-foreground">
                💬 Ответ студента автоматически отправится в чат от его лица. Организация увидит сообщение в разделе «Чат» карточки студента.
              </p>
            </div>
          )}

          {/* Homework */}
          {lesson.type === "homework" && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Описание задания</Label>
              <Textarea
                value={lesson.content}
                onChange={(e) => onUpdate({ content: e.target.value })}
                placeholder="Опишите задание, которое должен выполнить ученик. Ученик сможет отправить текстовый ответ и прикрепить файлы."
                className="rounded-xl min-h-[140px]"
              />
              <p className="text-xs text-muted-foreground">
                📝 Ответы учеников будут доступны во вкладке «Проверка заданий» в панели управления организацией.
              </p>
            </div>
          )}

          {/* Attachments for all lesson types */}
          <LessonAttachments
            lessonId={lesson.id}
            courseId={courseId}
            attachments={lesson.attachments || []}
            onAttachmentsChange={(attachments) => onUpdate({ attachments })}
          />
        </div>
      )}
    </div>
  );
}
