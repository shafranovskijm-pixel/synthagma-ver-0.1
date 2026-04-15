import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send, Paperclip, ExternalLink, Clock, CheckCircle2, AlertCircle, RotateCcw } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface Submission {
  id: string;
  content: string | null;
  attachments: any[];
  status: string;
  score: number | null;
  reviewer_comment: string | null;
  submitted_at: string;
  student_name?: string;
  student_email?: string;
  lesson_title?: string;
  course_title?: string;
}

interface Props {
  submission: Submission;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "Ждёт проверки", color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  revision: { label: "На доработке", color: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
  approved: { label: "Выполнено", color: "bg-green-500/10 text-green-600 border-green-500/20" },
  rejected: { label: "Незачёт", color: "bg-destructive/10 text-destructive border-destructive/20" } };

export function HomeworkReviewDialog({ submission, open, onOpenChange, onUpdated }: Props) {
  const [comment, setComment] = useState(submission.reviewer_comment || "");
  const [score, setScore] = useState<string>(submission.score?.toString() || "");
  const [newStatus, setNewStatus] = useState(submission.status === "pending" ? "approved" : submission.status);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("homework_submissions")
      .update({
        status: newStatus,
        reviewer_comment: comment.trim() || null,
        score: score ? parseInt(score) : null,
        reviewer_id: (await supabase.auth.getUser()).data.user?.id,
        reviewed_at: new Date().toISOString() } as any)
      .eq("id", submission.id);

    if (error) {
      toast.error("Ошибка сохранения");
    } else {
      toast.success("Проверка сохранена");
      onUpdated();
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            Проверка задания
            <Badge variant="outline" className={statusConfig[submission.status]?.color}>
              {statusConfig[submission.status]?.label || submission.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Student info */}
          <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-xl">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
              {(submission.student_name || "?")[0].toUpperCase()}
            </div>
            <div>
              <p className="font-medium">{submission.student_name}</p>
              <p className="text-xs text-muted-foreground">{submission.student_email}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-sm font-medium">{submission.lesson_title}</p>
              <p className="text-xs text-muted-foreground">{submission.course_title}</p>
            </div>
          </div>

          {/* Student's answer */}
          <div>
            <Label className="text-sm font-semibold mb-2 block">Ответ ученика</Label>
            <div className="bg-card border border-border rounded-xl p-4 text-sm whitespace-pre-wrap min-h-[80px]">
              {submission.content || <span className="text-muted-foreground italic">Текст не предоставлен</span>}
            </div>
            {Array.isArray(submission.attachments) && submission.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {submission.attachments.map((att: any, i: number) => (
                  <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs hover:bg-secondary/50 transition-colors">
                    <Paperclip className="w-3 h-3" />
                    {att.name}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Отправлено: {new Date(submission.submitted_at).toLocaleString("ru-RU")}
            </p>
          </div>

          {/* Review form */}
          <div className="space-y-4 border-t border-border pt-4">
            <div className="space-y-2">
              <Label>Комментарий преподавателя</Label>
              <Textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Напишите комментарий к работе ученика..."
                className="rounded-xl min-h-[100px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Статус</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">✅ Выполнено</SelectItem>
                    <SelectItem value="revision">🔄 На доработку</SelectItem>
                    <SelectItem value="rejected">❌ Незачёт</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Балл (необязательно)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={score}
                  onChange={e => setScore(e.target.value)}
                  placeholder="0-100"
                  className="rounded-xl"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={handleSubmit} disabled={saving} className="btn-gradient gap-2">
            {saving ? <SigmaSpinner size="sm" /> : <Send className="w-4 h-4" />}
            Отправить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
