import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BlockRenderer } from "@/components/course-builder/block-editor/BlockRenderer";
import { VideoPreviewInline } from "@/components/course-builder/VideoPreviewInline";
import { HlsVideoPlayer } from "@/components/video/HlsVideoPlayer";
import { Eye, FileText, Video, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ContentBlock } from "@/components/course-builder/BlockEditor";
import type { TestQuestion } from "@/hooks/useLessonEditor";

interface LessonPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  type: string;
  blocks: ContentBlock[];
  videoUrl: string;
  questions: TestQuestion[];
}

export function LessonPreviewDialog({ open, onClose, title, type, blocks, videoUrl, questions }: LessonPreviewDialogProps) {
  const typeIcon = type === "video" ? Video : type === "test" ? HelpCircle : FileText;
  const TypeIcon = typeIcon;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Eye className="w-3.5 h-3.5" />
            <span>Превью студенческим взглядом</span>
            <Badge variant="outline" className="ml-auto gap-1 text-[10px]">
              <TypeIcon className="w-3 h-3" />
              {type === "video" ? "Видео-урок" : type === "test" ? "Тест" : type === "ai_avatar" ? "ИИ-аватар" : "Текстовый урок"}
            </Badge>
          </div>
          <DialogTitle className="font-display text-2xl">{title || "Без названия"}</DialogTitle>
          <DialogDescription className="sr-only">Предпросмотр урока в формате студенческого плеера</DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border/60 bg-background p-6 min-h-[300px]">
          {type === "text" && (
            blocks.length === 0 ? (
              <p className="text-center text-muted-foreground py-12 text-sm">Нет контента для предпросмотра</p>
            ) : <BlockRenderer blocks={blocks} />
          )}

          {type === "video" && (
            videoUrl ? (
              videoUrl.startsWith("kinescope:") ? <VideoPreviewInline content={videoUrl} eager />
              : (videoUrl.includes("supabase") || /\.(mp4|webm|mov|m4v|mkv|ts|m2ts|mts|m3u8)(\?|$)/i.test(videoUrl))
                ? <HlsVideoPlayer src={videoUrl} controls className="w-full rounded-xl border border-border bg-black" />
                : <VideoPreviewInline content={videoUrl} eager />
            ) : <p className="text-center text-muted-foreground py-12 text-sm">Видео не указано</p>
          )}

          {type === "test" && (
            questions.length === 0 ? (
              <p className="text-center text-muted-foreground py-12 text-sm">Вопросы не добавлены</p>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Будет показано {Math.min(questions.length, questions.length)} вопросов из банка ({questions.length} всего).
                </p>
                {questions.slice(0, 3).map((q, i) => (
                  <div key={i} className="rounded-xl border border-border p-4 bg-card space-y-3">
                    <p className="font-medium text-sm">{i + 1}. {q.question || <span className="text-muted-foreground">[пустой вопрос]</span>}</p>
                    <div className="space-y-2">
                      {q.options.map((opt, oi) => (
                        <label key={oi} className="flex items-center gap-2 text-sm p-2 rounded-md hover:bg-muted/40 cursor-pointer">
                          <input type="radio" name={`preview-${i}`} disabled />
                          <span>{opt || <span className="text-muted-foreground">[пустой вариант]</span>}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {questions.length > 3 && <p className="text-xs text-muted-foreground text-center">… и ещё {questions.length - 3} вопросов</p>}
              </div>
            )
          )}

          {type === "ai_avatar" && (
            <p className="text-center text-muted-foreground py-12 text-sm">
              ИИ-аватар отображается студенту как интерактивная сессия — превью недоступно.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
