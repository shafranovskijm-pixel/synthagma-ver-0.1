import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Video, HelpCircle, Plus, Trash2, Sparkles, Settings, Upload, FolderOpen, FileSpreadsheet, Lock } from "lucide-react";
import { BlockEditor } from "@/components/course-builder/BlockEditor";
import { TestImportDialog } from "@/components/course-builder/TestImportDialog";
import { MediaLibraryDialog } from "@/components/course-builder/MediaLibraryDialog";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { VideoPreviewInline } from "@/components/course-builder/VideoPreviewInline";
import { LazyMediaPreview } from "@/components/course-builder/LazyMediaPreview";
import { UploadProgressBlock } from "@/components/course-builder/UploadProgressBlock";
import { useLessonEditor, type TestQuestion } from "@/hooks/useLessonEditor";
import { useLessonMedia } from "@/hooks/useLessonMedia";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface Lesson {
  id: string;
  title: string;
  type: string;
  content: string | null;
  order_index: number;
  course_id?: string;
  test_questions_count?: number;
}

interface LessonEditorProps {
  lesson: Lesson | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    title: string;
    type: string;
    content: string;
    questions?: TestQuestion[];
    test_questions_count?: number;
  }) => void;
  existingQuestions?: TestQuestion[];
  courseId?: string;
  courseTitle?: string;
  courseDescription?: string;
  organizationId?: string;
}

export const LessonEditor = ({
  lesson, isOpen, onClose, onSave,
  existingQuestions = [], courseId = "", courseTitle = "", courseDescription = "",
  organizationId,
}: LessonEditorProps) => {
  const e = useLessonEditor({ lesson, isOpen, existingQuestions, courseId, courseTitle, courseDescription, onSave });
  const navigate = useNavigate();
  const { limits } = useSubscriptionLimits(organizationId || null);
  const isKinescopeAvailable = limits.kinescopeEnabled;
  const [videoUploadTab, setVideoUploadTab] = useState<string>(isKinescopeAvailable ? "kinescope" : "server");
  const [skipCompression, setSkipCompression] = useState(false);

  const lessonIdForMedia = useMemo(() => lesson?.id || `new-${Date.now()}`, [lesson?.id]);
  const media = useLessonMedia(
    lessonIdForMedia,
    courseId,
    (updates: any) => {
      if (typeof updates?.content === "string") e.setVideoUrl(updates.content);
    },
    {
      courseTitle,
      lessonTitle: e.title || lesson?.title || "Урок",
      organizationId,
    },
  );

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{lesson ? "Редактировать урок" : "Новый урок"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Название урока *</Label>
                <Input placeholder="Введите название" value={e.title} onChange={(ev) => e.setTitle(ev.target.value)} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label>Тип урока</Label>
                <Select value={e.type} onValueChange={e.setType}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text"><div className="flex items-center gap-2"><FileText className="w-4 h-4" />Текстовый урок</div></SelectItem>
                    <SelectItem value="video"><div className="flex items-center gap-2"><Video className="w-4 h-4" />Видео урок</div></SelectItem>
                    <SelectItem value="test"><div className="flex items-center gap-2"><HelpCircle className="w-4 h-4" />Тест</div></SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {e.type === "text" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Содержание урока</Label>
                  <Button type="button" variant="outline" size="sm" onClick={e.handleGenerateContent} disabled={e.isGenerating || !e.title.trim()} className="gap-2">
                    {e.isGenerating ? <SigmaSpinner size="sm" /> : <Sparkles className="w-4 h-4" />}
                    {e.isGenerating ? "Генерация..." : "Сгенерировать ИИ"}
                  </Button>
                </div>
                <BlockEditor blocks={e.blocks} onChange={e.setBlocks} organizationId={organizationId} courseId={courseId} lessonId={lesson?.id} />
              </div>
            )}

            {e.type === "video" && (
              <div className="space-y-4">
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
                        onClick={(ev) => { ev.stopPropagation(); ev.preventDefault(); const inp = media.kinescopeInputRef.current; if (inp) { inp.value = ''; inp.click(); } else { toast.error("Не удалось открыть выбор файла"); } }}>
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
                          onClick={(ev) => { ev.stopPropagation(); ev.preventDefault(); const inp = media.videoInputRef.current; if (inp) { inp.value = ''; inp.click(); } else { toast.error("Не удалось открыть выбор файла"); } }}>
                          <Upload className="w-4 h-4" />Выбрать файл
                        </Button>
                        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                          <input type="checkbox" checked={skipCompression} onChange={(ev) => setSkipCompression(ev.target.checked)} className="rounded border-border" />
                          Без сжатия (быстрее)
                        </label>
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => e.setShowMediaLibrary(true)}>
                          <FolderOpen className="w-4 h-4" />Из загруженных
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <MediaLibraryDialog open={e.showMediaLibrary} onClose={() => e.setShowMediaLibrary(false)} onSelect={(url) => e.setVideoUrl(url)} filter="video" />

                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">или вставьте ссылку</span></div>
                </div>

                <div className="space-y-2">
                  <Label>Ссылка на видео или код для встраивания</Label>
                  <Textarea
                    value={e.videoUrl}
                    onChange={(ev) => e.setVideoUrl(ev.target.value)}
                    placeholder="Вставьте ссылку (YouTube, Vimeo, Rutube, VK Video, Дзен и др.) или код iframe для встраивания"
                    className="rounded-xl min-h-[100px] font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Поддерживаются: YouTube, Vimeo, Rutube, VK Video, Видеосервис+, Одноклассники, Mail.ru, Дзен, Яндекс Видео</p>
                </div>

                {e.videoUrl && (
                  <div className="space-y-2">
                    <Label className="text-sm">Предпросмотр</Label>
                    {e.videoUrl.startsWith('kinescope:') ? (
                      <div className="relative">
                        <VideoPreviewInline content={e.videoUrl} />
                        <Button variant="ghost" size="sm" className="absolute top-2 right-2 h-8 text-destructive hover:text-destructive bg-background/80 backdrop-blur-sm" onClick={() => e.setVideoUrl('')}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    ) : (e.videoUrl.includes('supabase') || /\.(mp4|webm|mov|m4v|mkv|ts|m2ts|mts|m3u8)(\?|$)/i.test(e.videoUrl)) ? (
                      <div className="relative">
                        <LazyMediaPreview type="video">
                          <HlsVideoPlayer src={e.videoUrl} controls preload="none" controlsList="nodownload" className="w-full rounded-xl border border-border bg-black" />
                        </LazyMediaPreview>
                        <Button variant="ghost" size="sm" className="absolute top-2 right-2 h-8 text-destructive hover:text-destructive bg-background/80 backdrop-blur-sm" onClick={() => e.setVideoUrl('')}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    ) : <VideoPreviewInline content={e.videoUrl} />}
                  </div>
                )}
              </div>
            )}

            {e.type === "test" && (
              <div className="space-y-4">
                <div className="p-4 bg-muted/30 rounded-xl border border-border space-y-4">
                  <div className="flex items-center gap-2"><Settings className="w-4 h-4 text-muted-foreground" /><Label className="text-sm font-semibold">Настройки банка вопросов</Label></div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground mb-2">Система будет случайным образом выбирать вопросы из банка. При повторной попытке — новые вопросы.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Вопросов в тесте:</Label>
                      <Input type="number" min={1} max={50} value={e.testQuestionsCount} onChange={(ev) => e.setTestQuestionsCount(Math.max(1, Math.min(50, parseInt(ev.target.value) || 1)))} className="w-20 h-9" />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Банк вопросов ({e.questions.length})</Label>
                  <div className="flex items-center gap-2">
                    <TestImportDialog onImport={(imported) => {
                      const newQ = imported.map((q, idx) => ({ question: q.question, options: q.options, correct_answer: q.correctAnswer, order_index: e.questions.length + idx }));
                      e.setQuestions([...e.questions, ...newQ]);
                    }}>
                      <Button type="button" variant="outline" size="sm" className="gap-2"><FileSpreadsheet className="w-4 h-4" />Импорт из Excel / TXT</Button>
                    </TestImportDialog>
                    <Button type="button" variant="outline" size="sm" onClick={e.handleGenerateContent} disabled={e.isGenerating || !e.title.trim()} className="gap-2">
                      {e.isGenerating ? <SigmaSpinner size="sm" /> : <Sparkles className="w-4 h-4" />}
                      {e.isGenerating ? "Генерация..." : "Сгенерировать ИИ"}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={e.handleAddQuestion} className="gap-2"><Plus className="w-4 h-4" />Добавить вопрос</Button>
                  </div>
                </div>

                {e.questions.length === 0 ? (
                  <div className="text-center py-12 bg-muted/30 rounded-xl border-2 border-dashed border-border">
                    <HelpCircle className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">Добавьте вопросы для теста</p>
                    <p className="text-sm text-muted-foreground/70 mt-1">Нажмите кнопку выше чтобы создать первый вопрос</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {e.questions.map((q, qIndex) => (
                      <div key={qIndex} className="border border-border rounded-xl p-5 space-y-4 bg-card">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <Label className="text-sm font-medium">Вопрос {qIndex + 1}</Label>
                            <Input placeholder="Введите вопрос" value={q.question} onChange={(ev) => e.handleUpdateQuestion(qIndex, "question", ev.target.value)} className="h-11" />
                          </div>
                          <Button type="button" variant="ghost" size="icon" onClick={() => e.handleRemoveQuestion(qIndex)} className="text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></Button>
                        </div>
                        <div className="space-y-3">
                          <Label className="text-sm">Варианты ответов</Label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {q.options.map((option, oIndex) => (
                              <div key={oIndex} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${q.correct_answer === oIndex ? "border-green-500 bg-green-500/5" : "border-border"}`}>
                                <input type="radio" name={`correct-${qIndex}`} checked={q.correct_answer === oIndex} onChange={() => e.handleUpdateQuestion(qIndex, "correct_answer", oIndex)} className="w-4 h-4 accent-green-500" />
                                <Input placeholder={`Вариант ${oIndex + 1}`} value={option} onChange={(ev) => e.handleUpdateQuestion(qIndex, "option", { optionIndex: oIndex, text: ev.target.value })} className="flex-1 border-0 bg-transparent p-0 h-auto focus-visible:ring-0" />
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground">✓ Выберите правильный ответ</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t border-border">
              <Button variant="outline" onClick={onClose} className="flex-1 h-11">Отмена</Button>
              <Button onClick={e.handleSave} className="flex-1 btn-gradient h-11" disabled={!e.title.trim()}>{lesson ? "Сохранить изменения" : "Создать урок"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
