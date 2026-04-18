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
  const media = useLessonMedia(lessonIdForMedia, courseId, (updates: any) => {
    if (typeof updates?.content === "string") e.setVideoUrl(updates.content);
  });

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
                <BlockEditor blocks={e.blocks} onChange={e.setBlocks} />
              </div>
            )}

            {e.type === "video" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Ссылка на видео или embed код</Label>
                      <p className="text-xs text-muted-foreground">YouTube, Vimeo, Rutube, VK, Дзен, OK.ru, Mail.ru или &lt;iframe&gt;</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => e.setShowMediaLibrary(true)} className="gap-2"><FolderOpen className="w-4 h-4" />Из загруженных</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => e.videoInputRef.current?.click()} disabled={e.isUploading} className="gap-2">
                        {e.isUploading ? <SigmaSpinner size="sm" /> : <Upload className="w-4 h-4" />}
                        {e.isUploading ? "Загрузка..." : "Загрузить видео"}
                      </Button>
                      <input ref={e.videoInputRef} type="file" accept="video/*" className="hidden" onChange={async (ev) => {
                        const file = ev.target.files?.[0];
                        if (file) await e.handleVideoUpload(file);
                        ev.target.value = '';
                      }} />
                      <MediaLibraryDialog open={e.showMediaLibrary} onClose={() => e.setShowMediaLibrary(false)} onSelect={(url) => e.setVideoUrl(url)} filter="video" />
                    </div>
                    {e.videoUploadProgress !== null && (
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2"><SigmaSpinner size="sm" /><span className="font-medium">Загрузка видео...</span></div>
                          <span className="text-muted-foreground font-mono">{e.videoUploadProgress}%</span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-primary transition-all duration-300 ease-out rounded-full" style={{ width: `${e.videoUploadProgress}%` }} />
                        </div>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => { e.abortUpload(); e.setVideoUploadProgress(null); }}>
                          <Trash2 className="w-3 h-3 mr-1" />Отменить
                        </Button>
                      </div>
                    )}
                  </div>
                  <Textarea placeholder="https://youtube.com/watch?v=... или <iframe>...</iframe>" value={e.videoUrl} onChange={(ev) => e.setVideoUrl(ev.target.value)} className="min-h-[100px] resize-none" />
                </div>
                {e.videoUrl && (
                  e.videoUrl.startsWith('http') && !e.videoUrl.includes('youtube') && !e.videoUrl.includes('vimeo') && !e.videoUrl.includes('rutube') && !e.videoUrl.includes('vk.') && !e.videoUrl.includes('dzen') && !e.videoUrl.includes('ok.ru') && !e.videoUrl.includes('mail.ru') && !e.videoUrl.includes('<iframe') ? (
                    <video src={e.videoUrl} controls className="w-full aspect-video rounded-xl bg-black" />
                  ) : <VideoPreview videoUrl={e.videoUrl} />
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
