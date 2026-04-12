import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BookCheck, Send, Loader2, CheckCircle2, AlertCircle, RotateCcw, Paperclip, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { uploadToStorage } from "@/utils/courseBuilderHelpers";
import { Badge } from "@/components/ui/badge";

interface HomeworkSubmissionProps {
  lessonId: string;
  courseId: string;
  userId: string;
  taskDescription: string | null;
  isMobile: boolean;
  onComplete: () => void;
}

interface Submission {
  id: string;
  content: string | null;
  attachments: any[];
  status: string;
  score: number | null;
  reviewer_comment: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  pending: { label: "Ждёт проверки", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Clock },
  revision: { label: "На доработке", color: "bg-orange-500/10 text-orange-600 border-orange-500/20", icon: RotateCcw },
  approved: { label: "Выполнено", color: "bg-green-500/10 text-green-600 border-green-500/20", icon: CheckCircle2 },
  rejected: { label: "Незачёт", color: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertCircle },
};

export function HomeworkSubmission({ lessonId, courseId, userId, taskDescription, isMobile, onComplete }: HomeworkSubmissionProps) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<{ url: string; name: string; type: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadSubmissions();
  }, [lessonId]);

  const loadSubmissions = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("homework_submissions")
      .select("*")
      .eq("lesson_id", lessonId)
      .eq("student_id", userId)
      .order("submitted_at", { ascending: false });
    setSubmissions((data as any[]) || []);
    setLoading(false);
  };

  const latest = submissions[0];
  const canSubmit = !latest || latest.status === "revision" || latest.status === "rejected";

  // Auto-complete lesson when approved
  useEffect(() => {
    if (latest?.status === "approved") {
      onComplete();
    }
  }, [latest?.status]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `homework_${lessonId}_${Date.now()}.${ext}`;
      const result = await uploadToStorage(file, 'course-files', `${courseId}/${fileName}`);
      if (!result) throw new Error("Upload failed");
      setAttachments(prev => [...prev, { url: result.url, name: file.name, type: ext || "file" }]);
    } catch {
      toast.error("Ошибка загрузки файла");
    }
    setUploading(false);
    e.target.value = "";
  };

  const handleSubmit = async () => {
    if (!content.trim() && attachments.length === 0) return;
    setSending(true);

    // Get organization_id from course
    const { data: courseData } = await supabase.from("courses").select("organization_id").eq("id", courseId).single();

    const { error } = await supabase.from("homework_submissions").insert({
      lesson_id: lessonId,
      student_id: userId,
      course_id: courseId,
      organization_id: courseData?.organization_id || "",
      content: content.trim(),
      attachments: attachments as any,
      status: "pending",
    } as any);

    if (error) {
      toast.error("Ошибка отправки");
    } else {
      toast.success("Ответ отправлен!");
      setContent("");
      setAttachments([]);
      await loadSubmissions();
    }
    setSending(false);
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Task description */}
      {taskDescription && (
        <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-5">
          <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
            <BookCheck className="w-4 h-4 text-indigo-500" />
            Задание
          </h3>
          <div className="text-sm whitespace-pre-wrap">{taskDescription}</div>
        </div>
      )}

      {/* Latest submission status */}
      {latest && (
        <div className={cn("rounded-2xl border p-5", statusConfig[latest.status]?.color || "border-border")}>
          <div className="flex items-center gap-3 mb-3">
            {(() => { const Ic = statusConfig[latest.status]?.icon || Clock; return <Ic className="w-5 h-5" />; })()}
            <span className="font-semibold">{statusConfig[latest.status]?.label || latest.status}</span>
            {latest.score != null && (
              <Badge variant="outline" className="ml-auto">{latest.score} баллов</Badge>
            )}
          </div>
          {latest.reviewer_comment && (
            <div className="bg-background/50 rounded-xl p-3 text-sm mt-2">
              <span className="font-medium">Комментарий преподавателя: </span>
              {latest.reviewer_comment}
            </div>
          )}
          {latest.content && (
            <div className="mt-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Ваш ответ: </span>
              {latest.content.length > 200 ? latest.content.slice(0, 200) + "..." : latest.content}
            </div>
          )}
        </div>
      )}

      {/* Submission form */}
      {canSubmit && (
        <div className="space-y-4">
          <h3 className="font-semibold text-sm">
            {latest ? "Отправить доработку" : "Отправить ответ"}
          </h3>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Напишите ваш ответ..."
            className="rounded-xl min-h-[120px]"
          />
          <div className="flex items-center gap-3 flex-wrap">
            <label className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-xl cursor-pointer hover:bg-secondary/50 transition-colors text-sm">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
              Прикрепить файл
              <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
            </label>
            {attachments.map((att, i) => (
              <Badge key={i} variant="secondary" className="gap-1">
                {att.name}
                <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} className="ml-1 text-muted-foreground hover:text-destructive">×</button>
              </Badge>
            ))}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={sending || (!content.trim() && attachments.length === 0)}
            className="btn-gradient rounded-xl gap-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? "Отправка..." : "Отправить"}
          </Button>
        </div>
      )}

      {/* History */}
      {submissions.length > 1 && (
        <details className="group">
          <summary className="text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
            Предыдущие ответы ({submissions.length - 1})
          </summary>
          <div className="mt-3 space-y-3">
            {submissions.slice(1).map(sub => (
              <div key={sub.id} className="border border-border rounded-xl p-4 text-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className={statusConfig[sub.status]?.color}>
                    {statusConfig[sub.status]?.label || sub.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(sub.submitted_at).toLocaleDateString("ru-RU")}
                  </span>
                </div>
                {sub.content && <p className="text-muted-foreground line-clamp-2">{sub.content}</p>}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
