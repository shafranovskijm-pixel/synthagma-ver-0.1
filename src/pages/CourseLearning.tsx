import { useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { 
  ArrowLeft, CheckCircle2, Circle, FileText, Video, ClipboardList, 
  ChevronLeft, ChevronRight, Trophy, Sparkles, Clock, Loader2, 
  Volume2, Square, MessageCircle, X, Send, List, Presentation, 
  Lock, RotateCcw, Settings2, Headphones, Download, FileText as FileTextIcon,
  FileSpreadsheet, Presentation as PresentationIcon, File, Eye, ChevronDown,
  MessageSquare
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, 
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { BlockRenderer } from "@/components/course-builder/BlockEditor";
import { cn } from "@/lib/utils";
import { TTSSettingsDialog, SALUTE_VOICES, saveTTSSettings } from "@/components/student/TTSSettingsDialog";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { VideoPlayerInline } from "@/components/course-learning/VideoPlayerInline";
import { SliderLessonViewer } from "@/components/course-learning/SliderLessonViewer";
import { useCourseLearning, getOptionText } from "@/hooks/useCourseLearning";
import { OfflineBanner } from "@/components/student/OfflineBanner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState as useReactState } from "react";
import { FilePreviewDialog } from "@/components/course-learning/FilePreviewDialog";

const CourseLearning = () => {
  const { courseId } = useParams();
  
  // Use the new hook for all logic
  const {
    user, navigate, isMobile, contentRef,
    course, lessons, currentLessonIndex, lessonProgress, loading,
    sidebarOpen, setSidebarOpen, isTransitioning,
    testQuestions, testSubmitted, testScore, testPassingScore, testExplanations, allBankQuestions,
    answers, setAnswers,
    isSpeaking, speakText, ttsSettingsOpen, setTtsSettingsOpen, ttsSettings, setTtsSettings, elevenLabsTTS,
    isChatOpen, setIsChatOpen, chatMessages, chatInput, setChatInput, isChatLoading, chatScrollRef, sendChatMessage,
    videoWatchProgress, setVideoWatchProgress, savedPosition, isVideoProgressLoading, saveVideoPosition,
    currentLesson, completedCount, progressPercent,
    feedbackAnswer, setFeedbackAnswer, feedbackSent, feedbackSending, submitFeedback,
    isLessonAccessible, isLessonCompleted,
    goToNextLesson, goToPrevLesson, goToLesson, markLessonComplete, resetCourseProgress,
    submitTest, retryTest,
    getLessonIcon, lessonButtonRefs, lessonAttachments,
    isOfflineMode, offlineCachedAt,
  } = useCourseLearning();

  const [previewFile, setPreviewFile] = useReactState<{ url: string; name: string; type: string | null } | null>(null);

  // Swipe gesture handlers
  const handleSwipeLeft = () => { if (currentLessonIndex < lessons.length - 1) goToNextLesson(); };
  const handleSwipeRight = () => { if (currentLessonIndex > 0) goToPrevLesson(); };
  const isTestActive = currentLesson?.type === 'test' && !testSubmitted;
  const [reviewOpen, setReviewOpen] = useReactState(false);

  // Auto-complete slider (presentation) lessons when opened
  useEffect(() => {
    if (currentLesson?.type === 'slider' && !isLessonCompleted(currentLesson.id)) {
      markLessonComplete(false);
    }
  }, [currentLesson?.id]);
  
  const swipeRef = useSwipeGesture<HTMLDivElement>({
    onSwipeLeft: isMobile && !isTestActive ? handleSwipeLeft : undefined,
    onSwipeRight: isMobile && !isTestActive ? handleSwipeRight : undefined,
    threshold: 100, minSwipeDistance: 70,
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Загрузка курса...</p>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Clock className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4">Курс не найден</h1>
          <Button onClick={() => navigate('/student')}>Вернуться в кабинет</Button>
        </div>
      </div>
    );
  }

  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      <div className="p-4 border-b border-border">
        <Button variant="ghost" size="sm" onClick={() => navigate('/student')} className="mb-4 hover:bg-secondary">
          <ArrowLeft className="w-4 h-4 mr-2" />Назад
        </Button>
        <h2 className="font-bold text-lg line-clamp-2">{course.title}</h2>
        <div className="mt-4">
          <div className="flex justify-between text-sm text-muted-foreground mb-2"><span>Прогресс</span><span className="font-medium">{completedCount}/{lessons.length}</span></div>
          <Progress value={progressPercent} className="h-2" />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {lessons.map((lesson, index) => {
            const Icon = getLessonIcon(lesson.type);
            const completed = isLessonCompleted(lesson.id);
            const isCurrent = index === currentLessonIndex;
            const isAccessible = isLessonAccessible(index);
            return (
              <button key={lesson.id} onClick={() => { goToLesson(index); onNavigate?.(); }} disabled={!isAccessible}
                className={cn("w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-200", isCurrent ? "bg-primary/10 text-primary shadow-sm" : isAccessible ? "hover:bg-muted" : "opacity-50 cursor-not-allowed")}>
                {completed ? <div className="w-8 h-8 rounded-full bg-sigma-green/10 flex items-center justify-center shrink-0"><CheckCircle2 className="w-5 h-5 text-sigma-green" /></div> : !isAccessible ? <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0"><Lock className="w-4 h-4 text-muted-foreground" /></div> : <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", isCurrent ? "bg-primary/10" : "bg-muted")}><Circle className={cn("w-5 h-5", isCurrent ? "text-primary" : "text-muted-foreground")} /></div>}
                <div className="flex-1 min-w-0"><div className="text-sm font-medium line-clamp-2">{lesson.title}</div><div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">{lesson.type === 'text' && 'Текст'}{lesson.type === 'video' && 'Видео'}{lesson.type === 'test' && 'Тест'}{lesson.type === 'audio' && 'Аудио'}{lesson.type === 'feedback' && 'Обратная связь'}{!isAccessible && <span className="ml-1">• Заблокировано</span>}</div></div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
      <div className="p-4 border-t border-border space-y-3">
        <div className="flex items-center gap-3 text-sm text-muted-foreground"><div className="flex items-center gap-1"><Clock className="w-4 h-4" /><span>{lessons.length} уроков</span></div><div className="flex items-center gap-1"><Trophy className="w-4 h-4 text-sigma-green" /><span>{completedCount} пройдено</span></div></div>
        {completedCount > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="outline" size="sm" className="w-full text-muted-foreground"><RotateCcw className="w-4 h-4 mr-2" />Сбросить прогресс</Button></AlertDialogTrigger>
            <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Сбросить прогресс курса?</AlertDialogTitle><AlertDialogDescription>Все результаты тестов и отметки о прохождении уроков будут удалены.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={resetCourseProgress}>Сбросить</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {!isMobile && <aside className="w-80 bg-card border-r border-border flex flex-col h-screen sticky top-0 shrink-0"><SidebarContent /></aside>}
      {isMobile && <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}><SheetContent side="left" className="w-[85%] max-w-sm p-0 flex flex-col"><SidebarContent onNavigate={() => setSidebarOpen(false)} /></SheetContent></Sheet>}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className={cn("border-b border-border bg-card flex items-center justify-between shrink-0 sticky top-0 z-10", isMobile ? "px-3 py-3" : "px-6 py-4")}>
          <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
            {isMobile && <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} className="shrink-0"><List className="w-5 h-5" /></Button>}
            {!isMobile && <><SigmaLogo size="sm" /><span className="text-muted-foreground">|</span></>}
            <span className={cn("font-medium truncate", isMobile ? "text-sm max-w-[140px]" : "max-w-md")}>{currentLesson?.title}</span>
          </div>
          <div className="flex items-center gap-1 md:gap-2 shrink-0">
            {(currentLesson?.type === 'text' || currentLesson?.type === 'test') && (
              <>
                <Button variant={isSpeaking ? "default" : "outline"} size="sm" onClick={speakText} disabled={elevenLabsTTS.isLoading} className={cn("rounded-lg", isSpeaking && "bg-primary text-primary-foreground", isMobile && "h-8 w-8 p-0")} title={isSpeaking ? "Стоп" : "Озвучить"}>
                  {elevenLabsTTS.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : isSpeaking ? <Square className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  {!isMobile && <span className="ml-1">{elevenLabsTTS.isLoading ? '...' : isSpeaking ? 'Стоп' : 'Озвучить'}</span>}
                </Button>
                {ttsSettings.provider === 'salutespeech' ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className={cn("rounded-lg gap-1", isMobile && "h-8 px-2")} title="Выбор голоса">
                        <Settings2 className="w-4 h-4" />
                        {!isMobile && <><span className="text-xs max-w-[80px] truncate">{SALUTE_VOICES.find(v => v.id === ttsSettings.saluteVoice)?.name.split(' ')[0] || 'Голос'}</span><ChevronDown className="w-3 h-3" /></>}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel className="text-xs text-muted-foreground">SaluteSpeech — голос</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {SALUTE_VOICES.map(voice => (
                        <DropdownMenuItem key={voice.id} onClick={() => { const updated = { ...ttsSettings, saluteVoice: voice.id }; setTtsSettings(updated); saveTTSSettings(updated); }} className={cn(ttsSettings.saluteVoice === voice.id && "bg-primary/10 font-medium")}>
                          <Volume2 className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                          {voice.name}
                          {ttsSettings.saluteVoice === voice.id && <CheckCircle2 className="w-3.5 h-3.5 ml-auto text-primary" />}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setTtsSettingsOpen(true)}>
                        <Settings2 className="w-3.5 h-3.5 mr-2" />Все настройки
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setTtsSettingsOpen(true)} className={cn("rounded-lg", isMobile && "h-8 w-8 p-0")} title="Настройки"><Settings2 className="w-4 h-4" /></Button>
                )}
              </>
            )}
            <Button variant="outline" size="sm" disabled={currentLessonIndex === 0} onClick={goToPrevLesson} className={cn("rounded-lg", isMobile && "h-8 w-8 p-0")}><ChevronLeft className="w-4 h-4" /></Button>
            <div className={cn("bg-secondary rounded-lg text-sm", isMobile ? "px-2 py-1" : "px-3 py-1")}><span className="font-medium">{currentLessonIndex + 1}</span><span className="text-muted-foreground">/{lessons.length}</span></div>
            <Button variant="outline" size="sm" disabled={currentLessonIndex === lessons.length - 1} onClick={goToNextLesson} className={cn("rounded-lg", isMobile && "h-8 w-8 p-0")}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </header>

        {isOfflineMode && <OfflineBanner cachedAt={offlineCachedAt} />}
        <ScrollArea className="flex-1" ref={contentRef}>
          <div 
            ref={swipeRef} 
            className={cn(
              "max-w-4xl mx-auto transition-all duration-300 min-h-full", 
              isMobile ? "p-4" : "p-8", 
              isTransitioning ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0",
              (course as any)?.landing_content?.copy_protection && "select-none"
            )}
            onContextMenu={(course as any)?.landing_content?.copy_protection ? (e: React.MouseEvent) => e.preventDefault() : undefined}
            onCopy={(course as any)?.landing_content?.copy_protection ? (e: React.ClipboardEvent) => e.preventDefault() : undefined}
          >
            {currentLesson?.type === 'text' && (
              <div className="space-y-4 md:space-y-6 animate-fade-in">
                <div className="flex items-center gap-3 pb-3 md:pb-4 border-b border-border">
                  <div className={cn("rounded-xl bg-primary/10 flex items-center justify-center shrink-0", isMobile ? "w-8 h-8" : "w-10 h-10")}><FileText className={cn(isMobile ? "w-4 h-4" : "w-5 h-5", "text-primary")} /></div>
                  <div className="min-w-0"><h1 className={cn("font-bold line-clamp-2", isMobile ? "text-lg" : "text-2xl")}>{currentLesson.title}</h1><p className="text-xs md:text-sm text-muted-foreground">Урок {currentLessonIndex + 1}</p></div>
                </div>
                {(() => { const blocks = currentLesson.content ? (() => { try { const p = JSON.parse(currentLesson.content); return Array.isArray(p) && p.every((x: any) => x.type && x.id) ? p : []; } catch { return []; } })() : []; return blocks.length > 0 ? <BlockRenderer blocks={blocks} /> : <div className="prose prose-lg max-w-none dark:prose-invert"><div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: currentLesson.content?.replace(/\n/g, '<br/>') || '' }} /></div>; })()}
              </div>
            )}

            {currentLesson?.type === 'video' && (
              <div className="space-y-4 md:space-y-6 animate-fade-in">
                <div className="flex items-center gap-3 pb-3 md:pb-4 border-b border-border">
                  <div className={cn("rounded-xl bg-red-500/10 flex items-center justify-center shrink-0", isMobile ? "w-8 h-8" : "w-10 h-10")}><Video className={cn(isMobile ? "w-4 h-4" : "w-5 h-5", "text-red-500")} /></div>
                  <div className="min-w-0"><h1 className={cn("font-bold line-clamp-2", isMobile ? "text-lg" : "text-2xl")}>{currentLesson.title}</h1><p className="text-xs md:text-sm text-muted-foreground">Видеоурок {currentLessonIndex + 1}</p></div>
                </div>
                <div className="aspect-video bg-muted rounded-2xl flex items-center justify-center overflow-hidden shadow-lg relative">
                  {isVideoProgressLoading ? <div className="flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div> : currentLesson.content ? (
                    <VideoPlayerInline key={`${currentLesson.id}-${course?.allow_video_seek !== false ? "seek" : "no-seek"}`} content={currentLesson.content} allowSeek={course?.allow_video_seek !== false} userId={user?.id} lessonId={currentLesson.id} savedPosition={savedPosition} onSavePosition={saveVideoPosition} onProgressChange={setVideoWatchProgress} onFinishLesson={() => markLessonComplete()} onVideoComplete={async () => { if (!isLessonCompleted(currentLesson.id)) markLessonComplete(); }} />
                  ) : <div className="text-center text-muted-foreground"><Video className="w-16 h-16 mx-auto mb-4" /><p>Видео не загружено</p></div>}
                  {(course as any)?.landing_content?.video_watermark && user?.email && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                      <span className="text-white/20 text-lg md:text-2xl font-bold rotate-[-30deg] select-none whitespace-nowrap">
                        {user.email}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentLesson?.type === 'slider' && (
              <SliderLessonViewer content={currentLesson.content} title={currentLesson.title} lessonIndex={currentLessonIndex} isMobile={!!isMobile} />
            )}

            {currentLesson?.type === 'audio' && (
              <div className="space-y-4 md:space-y-6 animate-fade-in">
                <div className="flex items-center gap-3 pb-3 md:pb-4 border-b border-border">
                  <div className={cn("rounded-xl bg-green-500/10 flex items-center justify-center shrink-0", isMobile ? "w-8 h-8" : "w-10 h-10")}><Headphones className={cn(isMobile ? "w-4 h-4" : "w-5 h-5", "text-green-500")} /></div>
                  <div className="min-w-0"><h1 className={cn("font-bold line-clamp-2", isMobile ? "text-lg" : "text-2xl")}>{currentLesson.title}</h1><p className="text-xs md:text-sm text-muted-foreground">Аудиолекция {currentLessonIndex + 1}</p></div>
                </div>
                <div className={cn("bg-card rounded-2xl border border-border", isMobile ? "p-4" : "p-6")}>
                  {currentLesson.content && currentLesson.content.startsWith('http') ? (
                    <audio controls preload="auto" className="w-full"><source src={currentLesson.content} type="audio/mpeg" />Ваш браузер не поддерживает аудио.</audio>
                  ) : <div className="text-center text-muted-foreground py-8"><Headphones className={cn(isMobile ? "w-12 h-12" : "w-16 h-16", "mx-auto mb-4 opacity-50")} /><p>Аудио не загружено</p></div>}
                </div>
              </div>
            )}

            {currentLesson?.type === 'feedback' && (
              <div className="space-y-4 md:space-y-6 animate-fade-in">
                <div className="flex items-center gap-3 pb-3 md:pb-4 border-b border-border">
                  <div className={cn("rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0", isMobile ? "w-8 h-8" : "w-10 h-10")}><MessageSquare className={cn(isMobile ? "w-4 h-4" : "w-5 h-5", "text-blue-500")} /></div>
                  <div className="min-w-0"><h1 className={cn("font-bold line-clamp-2", isMobile ? "text-lg" : "text-2xl")}>{currentLesson.title}</h1><p className="text-xs md:text-sm text-muted-foreground">Обратная связь • Урок {currentLessonIndex + 1}</p></div>
                </div>
                <div className={cn("bg-card rounded-2xl border border-border", isMobile ? "p-4" : "p-6")}>
                  {currentLesson.content && (
                    <div className="mb-6">
                      <p className="text-lg font-medium">{currentLesson.content}</p>
                    </div>
                  )}
                  {feedbackSent ? (
                    <div className="text-center py-8">
                      <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Ваш ответ отправлен</h3>
                      <p className="text-muted-foreground text-sm">Спасибо за обратную связь! Организация получит ваше сообщение в чате.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <textarea
                        value={feedbackAnswer}
                        onChange={(e) => setFeedbackAnswer(e.target.value)}
                        placeholder="Напишите ваш ответ..."
                        className="flex min-h-[120px] w-full rounded-xl border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        rows={5}
                      />
                      <Button
                        onClick={submitFeedback}
                        disabled={!feedbackAnswer.trim() || feedbackSending}
                        className="btn-gradient rounded-xl gap-2"
                      >
                        {feedbackSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {feedbackSending ? 'Отправка...' : 'Отправить ответ'}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentLesson?.type === 'test' && (
              <div className="space-y-4 md:space-y-6 animate-fade-in">
                <div className="flex items-center gap-3 pb-3 md:pb-4 border-b border-border">
                  <div className={cn("rounded-xl bg-sigma-purple/10 flex items-center justify-center shrink-0", isMobile ? "w-8 h-8" : "w-10 h-10")}><ClipboardList className={cn(isMobile ? "w-4 h-4" : "w-5 h-5", "text-sigma-purple")} /></div>
                  <div className="min-w-0"><h1 className={cn("font-bold line-clamp-2", isMobile ? "text-lg" : "text-2xl")}>{currentLesson.title}</h1><p className="text-xs md:text-sm text-muted-foreground">Тестирование • {testQuestions.length} вопросов • Проходной балл: {testPassingScore}%</p></div>
                </div>
                {testScore && (
                  <div className={cn("p-6 rounded-2xl border transition-all", ((testScore.score / testScore.max) * 100 >= testPassingScore) ? "bg-sigma-green/10 border-sigma-green/20" : "bg-destructive/10 border-destructive/20")}>
                    <div className="flex items-center gap-4">
                      <div className={cn("w-16 h-16 rounded-full flex items-center justify-center", ((testScore.score / testScore.max) * 100 >= testPassingScore) ? "bg-sigma-green/20" : "bg-destructive/20")}><Trophy className={cn("w-8 h-8", ((testScore.score / testScore.max) * 100 >= testPassingScore) ? "text-sigma-green" : "text-destructive")} /></div>
                      <div><h3 className="text-xl font-bold">{((testScore.score / testScore.max) * 100 >= testPassingScore) ? 'Тест пройден!' : 'Тест не пройден'}</h3><p className="text-muted-foreground">Результат: {testScore.score} из {testScore.max} ({Math.round(testScore.score / testScore.max * 100)}%)</p></div>
                    </div>
                    {!((testScore.score / testScore.max) * 100 >= testPassingScore) && <div className="mt-4 flex items-center gap-3"><Button onClick={retryTest}><Sparkles className="w-4 h-4 mr-2" />Попробовать снова</Button></div>}
                  </div>
                )}
                {testSubmitted && testScore && (
                  <Collapsible open={reviewOpen} onOpenChange={setReviewOpen}>
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" className="w-full rounded-xl">
                        <ClipboardList className="w-4 h-4 mr-2" />
                        {reviewOpen ? 'Скрыть разбор ответов' : 'Показать разбор ответов'}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 mt-4">
                      {testQuestions.map((q, i) => {
                        const options = Array.isArray(q.options) ? q.options : [];
                        const userAnswer = answers[q.id];
                        const correctAnswer = q.correct_answer;
                        const isCorrect = userAnswer === correctAnswer;
                        return (
                          <div key={q.id} className="bg-card rounded-2xl p-5 border border-border shadow-sm space-y-3">
                            <h3 className="font-semibold flex items-center gap-2">
                              <span className={cn("w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold", isCorrect ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400")}>{i + 1}</span>
                              {q.question}
                            </h3>
                            {(q as any).image_url && <img src={(q as any).image_url} alt="Вопрос" className="max-h-48 rounded-lg border border-border object-contain" />}
                            <div className="space-y-2">
                              {options.map((opt: any, oi: number) => {
                                const isCorrectOption = oi === correctAnswer;
                                const isUserWrong = oi === userAnswer && oi !== correctAnswer;
                                return (
                                  <div key={oi} className={cn("flex items-center gap-3 p-3 rounded-xl border transition-all text-sm",
                                    isCorrectOption ? "border-green-500 bg-green-50 dark:bg-green-900/20 dark:border-green-600" :
                                    isUserWrong ? "border-red-500 bg-red-50 dark:bg-red-900/20 dark:border-red-600" :
                                    "border-border"
                                  )}>
                                    <div className={cn("w-5 h-5 rounded-full border flex items-center justify-center shrink-0",
                                      isCorrectOption ? "border-green-500 bg-green-500" :
                                      isUserWrong ? "border-red-500 bg-red-500" :
                                      "border-muted-foreground"
                                    )}>
                                      {(isCorrectOption || isUserWrong) && <div className="w-2 h-2 rounded-full bg-white" />}
                                    </div>
                                    <span>{getOptionText(opt)}</span>
                                    {isCorrectOption && <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 ml-auto shrink-0" />}
                                    {isUserWrong && <X className="w-4 h-4 text-red-600 dark:text-red-400 ml-auto shrink-0" />}
                                  </div>
                                );
                              })}
                            </div>
                            {testExplanations[q.id] && (
                              <div className="mt-2 p-3 rounded-xl bg-muted/50 text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">Пояснение: </span>{testExplanations[q.id]}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </CollapsibleContent>
                  </Collapsible>
                )}
                {!testSubmitted && testQuestions.map((q, i) => (
                  <div key={q.id} className="bg-card rounded-2xl p-6 border border-border shadow-sm">
                    <h3 className="font-semibold mb-4 flex items-center gap-2"><span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">{i + 1}</span>{q.question}</h3>
                    {(q as any).image_url && <img src={(q as any).image_url} alt="Вопрос" className="max-h-64 rounded-lg border border-border object-contain mb-4" />}
                    <div className="space-y-2">{(Array.isArray(q.options) ? q.options : []).map((opt: any, oi: number) => (
                      <div key={oi} onClick={() => setAnswers(p => ({ ...p, [q.id]: oi }))} className={cn("flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all", answers[q.id] === oi ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:bg-muted")}>
                        <div className={cn("w-5 h-5 rounded-full border flex items-center justify-center shrink-0", answers[q.id] === oi ? "border-primary bg-primary" : "border-muted-foreground")}>{answers[q.id] === oi && <div className="w-2 h-2 rounded-full bg-white" />}</div>
                        <span className="text-sm">{opt.text || opt}</span>
                      </div>
                    ))}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Lesson Attachments */}
            {currentLesson && lessonAttachments[currentLesson.id] && lessonAttachments[currentLesson.id].length > 0 && (() => {
              const atts = lessonAttachments[currentLesson.id];
              const lectures = atts.filter(a => a.category === 'lecture');
              const materials = atts.filter(a => a.category === 'material');
              const others = atts.filter(a => a.category !== 'lecture' && a.category !== 'material');

              const getIcon = (ft: string | null) => {
                if (!ft) return File;
                const t = ft.toLowerCase();
                if (t === 'pdf') return FileTextIcon;
                if (['doc', 'docx', 'txt', 'rtf'].includes(t)) return FileTextIcon;
                if (['xls', 'xlsx'].includes(t)) return FileSpreadsheet;
                if (['ppt', 'pptx'].includes(t)) return PresentationIcon;
                return File;
              };

              const getColor = (ft: string | null) => {
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

              const renderFiles = (files: typeof atts) => (
                <div className="grid gap-3 sm:grid-cols-2">
                  {files.map(att => {
                    const Icon = getIcon(att.file_type);
                    const color = getColor(att.file_type);
                    return (
                      <button key={att.id} onClick={() => setPreviewFile({ url: att.file_url, name: att.name, type: att.file_type })}
                        className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-secondary/50 transition-colors group text-left">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{att.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {att.file_type?.toUpperCase()} {att.file_size ? `• ${formatSize(att.file_size)}` : ''}
                          </p>
                        </div>
                        <Eye className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                      </button>
                    );
                  })}
                </div>
              );

              return (
                <div className="mt-8 space-y-6 animate-fade-in">
                  {lectures.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">📄 Лекции</h3>
                      {renderFiles(lectures)}
                    </div>
                  )}
                  {materials.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">📚 Методические материалы</h3>
                      {renderFiles(materials)}
                    </div>
                  )}
                  {others.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">📎 Дополнительные файлы</h3>
                      {renderFiles(others)}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </ScrollArea>

        {isMobile && (
          <div className="border-t border-border bg-card px-4 py-2 flex overflow-x-auto no-scrollbar gap-2 shrink-0">
            {lessons.map((l, i) => {
              const completed = isLessonCompleted(l.id);
              const current = i === currentLessonIndex;
              return (
                <button key={l.id} ref={el => { lessonButtonRefs.current[i] = el; }} onClick={() => goToLesson(i)} className={cn("flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all", current && "ring-2 ring-primary scale-110", completed ? "bg-sigma-green text-white" : current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                  {completed ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                </button>
              );
            })}
          </div>
        )}

        <footer className={cn("border-t border-border bg-card flex justify-between items-center shrink-0", isMobile ? "px-3 py-3" : "px-6 py-4")}>
          <div className="text-sm text-muted-foreground">{isLessonCompleted(currentLesson?.id || '') && <span className="flex items-center gap-2 text-sigma-green font-medium"><CheckCircle2 className="w-4 h-4" />{!isMobile && "Урок завершён"}</span>}</div>
          <div className="flex gap-2 md:gap-3">
            {currentLesson?.type === 'test' && !testSubmitted && <Button onClick={submitTest} disabled={Object.keys(answers).length !== testQuestions.length} className={cn("btn-gradient rounded-xl", isMobile && "text-sm px-3")}>{isMobile ? "Отправить" : "Отправить ответы"}</Button>}
            {currentLesson?.type !== 'test' && currentLesson?.type !== 'feedback' && !isLessonCompleted(currentLesson?.id || '') && (currentLesson?.type !== 'video' || videoWatchProgress >= 90) && <Button onClick={() => markLessonComplete()} className={cn("btn-gradient rounded-xl", isMobile && "text-sm px-3")}>{isMobile ? "Завершить" : "Завершить урок"}<ChevronRight className="w-4 h-4 ml-1" /></Button>}
            {isLessonCompleted(currentLesson?.id || '') && currentLessonIndex < lessons.length - 1 && <Button onClick={goToNextLesson} className={cn("btn-gradient rounded-xl", isMobile && "text-sm px-3")}>{isMobile ? "Далее" : "Следующий урок"}<ChevronRight className="w-4 h-4 ml-1" /></Button>}
            {isLessonCompleted(currentLesson?.id || '') && currentLessonIndex === lessons.length - 1 && <Button onClick={() => navigate('/student')} className={cn("btn-gradient rounded-xl", isMobile && "text-sm px-3")}><Trophy className="w-4 h-4 mr-1" />{isMobile ? "Готово!" : "Курс завершён!"}</Button>}
          </div>
        </footer>
      </main>

      <Button onClick={() => setIsChatOpen(true)} className={cn("fixed shadow-lg z-40 bg-gradient-to-r from-primary to-primary/80 transition-transform hover:scale-105 rounded-full", isMobile ? "bottom-20 right-4 w-12 h-12" : "bottom-24 right-6 w-14 h-14", isChatOpen && "hidden")}><MessageCircle className={cn(isMobile ? "w-5 h-5" : "w-6 h-6")} /></Button>
      
      {isChatOpen && (
        <div className={cn("fixed bg-card border border-border shadow-2xl z-50 flex flex-col overflow-hidden animate-fade-in", isMobile ? "inset-0 rounded-none" : "bottom-24 right-6 w-96 h-[500px] rounded-2xl")}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-gradient-to-r from-primary to-primary/60 flex items-center justify-center"><Sparkles className="w-4 h-4 text-white" /></div><div><h3 className="font-semibold text-sm">ИИ-помощник</h3><p className="text-xs text-muted-foreground">Задайте вопрос по курсу</p></div></div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsChatOpen(false)}><X className="w-4 h-4" /></Button>
          </div>
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.map((msg, i) => (
              <div key={i} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[80%] rounded-2xl px-4 py-2 text-sm", msg.role === 'user' ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md")}><p className="whitespace-pre-wrap">{msg.content}</p></div>
              </div>
            ))}
            {isChatLoading && <div className="flex justify-start"><div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm text-muted-foreground">Печатает...</span></div></div>}
          </div>
          <div className={cn("border-t border-border bg-background", isMobile ? "p-3 pb-safe" : "p-3")}>
            <div className="flex gap-2">
              <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()} placeholder="Напишите сообщение..." className="flex-1 px-4 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/20" disabled={isChatLoading} />
              <Button onClick={sendChatMessage} disabled={!chatInput.trim() || isChatLoading} size="icon" className="rounded-xl"><Send className="w-4 h-4" /></Button>
            </div>
          </div>
        </div>
      )}

      <TTSSettingsDialog open={ttsSettingsOpen} onOpenChange={setTtsSettingsOpen} settings={ttsSettings} onSettingsChange={setTtsSettings} />
      {previewFile && (
        <FilePreviewDialog
          open={!!previewFile}
          onOpenChange={(open) => !open && setPreviewFile(null)}
          fileUrl={previewFile.url}
          fileName={previewFile.name}
          fileType={previewFile.type}
        />
      )}
    </div>
  );
};

export default CourseLearning;
