import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BookCheck, Send, CheckCircle2, AlertCircle, RotateCcw, Paperclip, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { uploadToStorage } from "@/utils/courseBuilderHelpers";
import { Badge } from "@/components/ui/badge";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { HOMEWORK_TEXT_LIMIT, homeworkContextKey, isReportForContext, type PreparedHomeworkReport } from "@/lib/homeworkReport";

interface HomeworkSubmissionProps {
  organizationId: string;
  lessonId: string;
  courseId: string;
  userId: string;
  taskDescription: string | null;
  isMobile: boolean;
  onComplete: () => void;
  readOnly?: boolean;
  allowAttachments?: boolean;
  preparedReport?: PreparedHomeworkReport;
}

interface Submission {
  id: string;
  organization_id: string;
  course_id: string;
  lesson_id: string;
  student_id: string;
  content: string | null;
  attachments: unknown;
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
  rejected: { label: "Незачёт", color: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertCircle } };

export function HomeworkSubmission(props: HomeworkSubmissionProps) {
  // Remount before rendering another context: no previous answer, status or late callback is reused.
  return <ScopedHomeworkSubmission key={`${homeworkContextKey(props)}:${!!props.readOnly}`} {...props} />;
}

function ScopedHomeworkSubmission({ organizationId, lessonId, courseId, userId, taskDescription, onComplete, readOnly = false, allowAttachments = true, preparedReport }: HomeworkSubmissionProps) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<{ url: string; name: string; type: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [confirmReplacement, setConfirmReplacement] = useState<PreparedHomeworkReport | null>(null);
  const [transferNotice, setTransferNotice] = useState(false);
  const alive = useRef(false);
  const loadSequence = useRef(0);
  const submitting = useRef(false);
  const completedSubmission = useRef<string | null>(null);
  const context = { organizationId, courseId, lessonId, userId };

  const loadSubmissions = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setLoadError(false);
    try {
      if (!organizationId || !courseId || !lessonId || !userId) throw new Error('Missing context');
      const { data, error } = await supabase
        .from("homework_submissions")
        .select("id, organization_id, course_id, lesson_id, student_id, content, attachments, status, score, reviewer_comment, submitted_at, reviewed_at")
        .eq("organization_id", organizationId)
        .eq("course_id", courseId)
        .eq("lesson_id", lessonId)
        .eq("student_id", userId)
        .order("submitted_at", { ascending: false });
      if (!alive.current || sequence !== loadSequence.current) return;
      if (error || !Array.isArray(data) || data.some(row => row.organization_id !== organizationId || row.course_id !== courseId || row.lesson_id !== lessonId || row.student_id !== userId)) throw new Error('History not confirmed');
      setSubmissions(data as Submission[]);
    } catch {
      if (alive.current && sequence === loadSequence.current) {
        setSubmissions([]);
        setLoadError(true);
      }
    } finally {
      if (alive.current && sequence === loadSequence.current) setLoading(false);
    }
  }, [organizationId, courseId, lessonId, userId]);

  useEffect(() => {
    alive.current = true;
    void loadSubmissions();
    return () => { alive.current = false; };
  }, [loadSubmissions]);

  const latest = submissions[0];
  const canSubmit = !readOnly && !loading && !loadError && (!latest || latest.status === "revision" || latest.status === "rejected");

  // Auto-complete lesson when approved
  useEffect(() => {
    if (!readOnly && !loading && !loadError && latest?.status === "approved" && completedSubmission.current !== latest.id) {
      completedSubmission.current = latest.id;
      onComplete();
    }
  }, [latest?.status, latest?.id, loading, loadError, onComplete, readOnly]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const input = e.target;
    if (!file || !allowAttachments || !canSubmit || sending || uploading) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `homework_${lessonId}_${Date.now()}.${ext}`;
      const result = await uploadToStorage(file, 'course-files', `${courseId}/${fileName}`);
      if (!alive.current) return;
      if (!result) throw new Error("Upload failed");
      setAttachments(prev => [...prev, { url: result.url, name: file.name, type: ext || "file" }]);
    } catch {
      if (alive.current) toast.error("Ошибка загрузки файла");
    }
    if (alive.current) { setUploading(false); input.value = ""; }
  };

  const handleSubmit = async () => {
    if (submitting.current || !canSubmit || uploading || content.length > HOMEWORK_TEXT_LIMIT || (!content.trim() && (!allowAttachments || attachments.length === 0))) return;
    submitting.current = true;
    setSending(true);
    try {
      const { data: courseData, error: courseError } = await supabase.from("courses").select("organization_id").eq("id", courseId).single();
      if (!alive.current) return;
      if (courseError || courseData?.organization_id !== organizationId) throw new Error('Course context not confirmed');
      const { data: lessonData, error: lessonError } = await supabase.from("lessons")
        .select("id, course_id").eq("id", lessonId).eq("course_id", courseId).single();
      if (!alive.current) return;
      if (lessonError || lessonData?.id !== lessonId || lessonData.course_id !== courseId) throw new Error('Lesson context not confirmed');
      const { data: saved, error } = await supabase.from("homework_submissions").insert({
      lesson_id: lessonId,
      student_id: userId,
      course_id: courseId,
      organization_id: organizationId,
      content: content.trim(),
      attachments: allowAttachments ? attachments : [],
      status: "pending" }).select("id, organization_id, course_id, lesson_id, student_id, status").single();
      if (!alive.current) return;
      if (error || !saved?.id || saved.organization_id !== organizationId || saved.course_id !== courseId || saved.lesson_id !== lessonId || saved.student_id !== userId || saved.status !== 'pending') throw new Error('Save not confirmed');
      toast.success("Ответ сохранён и ждёт проверки преподавателя. Это ещё не зачёт.");
      setContent("");
      setAttachments([]);
      setTransferNotice(false);
      await loadSubmissions();
    } catch {
      if (alive.current) {
        toast.error("Сохранение не подтверждено. Обновите историю перед повторной отправкой; текст ответа сохранён в форме.");
        setLoadError(true);
      }
    } finally {
      submitting.current = false;
      if (alive.current) setSending(false);
    }
  };

  const applyReport = (report: PreparedHomeworkReport) => {
    if (!canSubmit || sending || !isReportForContext(report, context)) return;
    setContent(report.text);
    setConfirmReplacement(null);
    setTransferNotice(true);
  };

  if (loading) return <div className="flex justify-center py-8"><SigmaSpinner /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      {readOnly && <p role="status">Режим просмотра: отправка, загрузка файлов и завершение урока недоступны.</p>}
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
      {loadError && <div role="alert" className="rounded-xl border border-destructive/30 p-4 space-y-2">
        <p>Не удалось подтвердить историю ответов. Отправка временно недоступна; черновик не удалён.</p>
        {content && <Textarea aria-label="Сохранённый черновик, отправка не подтверждена" value={content} readOnly />}
        <Button variant="outline" onClick={() => void loadSubmissions()} disabled={sending}>Обновить историю</Button>
      </div>}
      {canSubmit && (
        <div className="space-y-4">
          <h3 className="font-semibold text-sm">
            {latest ? "Отправить доработку" : "Отправить ответ"}
          </h3>
          {isReportForContext(preparedReport, context) && <div className="space-y-2 rounded-xl border p-3">
            <p className="text-sm">Подготовлен учебный отчёт. Перенос в форму не отправляет его преподавателю.</p>
            <Button variant="outline" disabled={sending} onClick={() => {
              if (!preparedReport) return;
              if (content.trim() && content !== preparedReport.text) setConfirmReplacement(preparedReport);
              else applyReport(preparedReport);
            }}>Перенести отчёт в ответ</Button>
          </div>}
          {confirmReplacement && <div role="alert" className="space-y-2 rounded-xl border p-3">
            <p>В форме уже есть ваш текст. Заменить его отчётом редакции {confirmReplacement.revision}?</p>
            <Button disabled={sending} onClick={() => applyReport(confirmReplacement)}>Заменить мой текст отчётом</Button>
            <Button variant="outline" onClick={() => setConfirmReplacement(null)}>Оставить мой текст</Button>
          </div>}
          {transferNotice && <p role="status" className="text-sm">Отчёт перенесён в черновик. Для отправки нажмите «Отправить».</p>}
          <Textarea
            aria-label="Ответ на практическое задание"
            disabled={sending}
            maxLength={HOMEWORK_TEXT_LIMIT}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setTransferNotice(false);
              setConfirmReplacement(null);
            }}
            placeholder="Напишите ваш ответ..."
            className="rounded-xl min-h-[120px]"
          />
          {allowAttachments ? <div className="flex items-center gap-3 flex-wrap">
            <label className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-xl cursor-pointer hover:bg-secondary/50 transition-colors text-sm">
              {uploading ? <SigmaSpinner size="sm" /> : <Paperclip className="w-4 h-4" />}
              Прикрепить файл
              <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading || sending} />
            </label>
            {attachments.map((att, i) => (
              <Badge key={i} variant="secondary" className="gap-1">
                {att.name}
                <button disabled={sending} onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} className="ml-1 text-muted-foreground hover:text-destructive">×</button>
              </Badge>
            ))}
          </div> : <p className="text-sm text-muted-foreground">Для этого курса ответ передаётся текстом. Файлы с персональными данными сюда не загружайте.</p>}
          <Button
            onClick={handleSubmit}
            disabled={sending || uploading || content.length > HOMEWORK_TEXT_LIMIT || (!content.trim() && (!allowAttachments || attachments.length === 0))}
            className="btn-gradient rounded-xl gap-2"
          >
            {sending ? <SigmaSpinner size="sm" /> : <Send className="w-4 h-4" />}
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
