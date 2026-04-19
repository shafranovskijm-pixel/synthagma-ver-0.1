import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Mic, Clock, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { safeInvoke } from "@/utils/safeInvoke";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface Props {
  lesson: {
    id: string;
    title: string;
    ai_avatar_name?: string | null;
    ai_avatar_image_url?: string | null;
    ai_avatar_subject?: string | null;
    ai_avatar_greeting?: string | null;
    ai_avatar_session_minutes?: number | null;
  };
  onComplete: () => void;
  isMobile: boolean;
}

export function LessonAIAvatar({ lesson, onComplete, isMobile }: Props) {
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const minutes = lesson.ai_avatar_session_minutes || 5;
  const tutorName = lesson.ai_avatar_name || "ИИ-преподаватель";

  const handleStart = async () => {
    setStarting(true);
    try {
      const { data, error } = await safeInvoke<any>("livekit-ai-tutor-start", {
        body: { lessonId: lesson.id, topic: lesson.ai_avatar_subject || lesson.title },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      onComplete();
      navigate(`/webinar/ai-tutor/live?sessionId=${data.sessionId}`);
    } catch (e: any) {
      toast.error("Не удалось начать сессию", { description: e.message });
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div className="flex items-center gap-3 pb-3 md:pb-4 border-b border-border">
        <div className={cn(
          "rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br from-fuchsia-500/15 to-pink-500/15",
          isMobile ? "w-8 h-8" : "w-10 h-10"
        )}>
          <Sparkles className={cn(isMobile ? "w-4 h-4" : "w-5 h-5", "text-fuchsia-500")} />
        </div>
        <div className="min-w-0">
          <h1 className={cn("font-bold line-clamp-2", isMobile ? "text-lg" : "text-2xl")}>{lesson.title}</h1>
          <p className="text-xs md:text-sm text-muted-foreground">ИИ-преподаватель • {minutes} мин</p>
        </div>
      </div>

      <div className="rounded-3xl bg-gradient-to-br from-fuchsia-500/5 via-pink-500/5 to-transparent border border-fuchsia-500/20 p-6 md:p-8">
        <div className="flex flex-col md:flex-row gap-6 items-center md:items-start">
          <div className="w-32 h-32 md:w-40 md:h-40 rounded-3xl overflow-hidden bg-muted shrink-0 ring-4 ring-fuchsia-500/20">
            {lesson.ai_avatar_image_url ? (
              <img src={lesson.ai_avatar_image_url} alt={tutorName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-fuchsia-500/20 to-pink-500/20">
                <Sparkles className="w-12 h-12 text-fuchsia-500" />
              </div>
            )}
          </div>

          <div className="flex-1 text-center md:text-left space-y-3">
            <div>
              <h2 className="text-xl md:text-2xl font-bold">{tutorName}</h2>
              {lesson.ai_avatar_subject && (
                <p className="text-sm text-muted-foreground mt-1">{lesson.ai_avatar_subject}</p>
              )}
            </div>

            {lesson.ai_avatar_greeting && (
              <blockquote className="text-sm md:text-base text-foreground/80 italic border-l-2 border-fuchsia-500/40 pl-3 text-left">
                «{lesson.ai_avatar_greeting}»
              </blockquote>
            )}

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground justify-center md:justify-start">
              <span className="inline-flex items-center gap-1.5"><Mic className="w-3.5 h-3.5" /> Голосовой диалог</span>
              <span className="inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> До {minutes} минут</span>
            </div>

            <Button
              onClick={handleStart}
              disabled={starting}
              size="lg"
              className="gap-2 bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-600 hover:to-pink-600 text-white border-0 rounded-xl"
            >
              {starting ? <SigmaSpinner size="sm" /> : <PlayCircle className="w-5 h-5" />}
              {starting ? "Запуск…" : `Начать сессию (${minutes} мин)`}
            </Button>
          </div>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs md:text-sm text-amber-700 dark:text-amber-400 flex gap-2">
        <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <strong>Бета.</strong> ИИ-преподаватель в разработке. Сессия запустит виртуальную комнату; голосовой движок активируется в ближайшее время.
        </div>
      </div>
    </div>
  );
}
