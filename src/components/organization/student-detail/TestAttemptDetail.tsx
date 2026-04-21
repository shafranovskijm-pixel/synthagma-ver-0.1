import { useState } from "react";
import { ChevronDown, ChevronUp, Download, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { generateTestAttemptPdf } from "@/utils/testAttemptPdf";

export interface QuestionData {
  id: string;
  question: string;
  options: string[];
  correct_answer: number | null;
  explanation?: string | null;
}

export interface EnrichedTestAttempt {
  id: string;
  lesson_id: string;
  lesson_title: string;
  course_title: string;
  score: number;
  max_score: number;
  completed_at: string;
  answers: Record<string, number>;
  shown_question_ids: string[] | null;
  passing_score: number;
  questions: QuestionData[];
}

interface TestAttemptDetailProps {
  attempt: EnrichedTestAttempt;
  studentName: string;
}

export function TestAttemptDetail({ attempt, studentName }: TestAttemptDetailProps) {
  const [open, setOpen] = useState(false);

  const percentage = attempt.max_score > 0 ? Math.round((attempt.score / attempt.max_score) * 100) : 0;
  const isPassed = percentage >= attempt.passing_score;

  const shownQuestions = attempt.shown_question_ids
    ? attempt.questions.filter((q) => attempt.shown_question_ids!.includes(q.id))
    : attempt.questions;

  const handleDownloadPdf = (e: React.MouseEvent) => {
    e.stopPropagation();
    void generateTestAttemptPdf({
      studentName,
      courseTitle: attempt.course_title,
      testTitle: attempt.lesson_title,
      completedAt: attempt.completed_at,
      score: attempt.score,
      maxScore: attempt.max_score,
      percentage,
      isPassed,
      passingScore: attempt.passing_score,
      questions: shownQuestions,
      answers: attempt.answers,
    });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center gap-4 p-3 rounded-xl bg-muted/50 border border-border cursor-pointer hover:bg-muted/80 transition-colors">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isPassed ? "bg-green-500/10" : "bg-destructive/10"}`}>
            {isPassed ? (
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            ) : (
              <XCircle className="w-5 h-5 text-destructive" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{attempt.lesson_title}</div>
            <div className="text-xs text-muted-foreground truncate">{attempt.course_title}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className={isPassed ? "bg-green-500/15 text-green-600 border-green-500/30 hover:bg-green-500/20" : "bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/20"}>
              {isPassed ? `${percentage}%` : "Не пройден"}
            </Badge>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDownloadPdf} title="Скачать PDF">
              <Download className="w-4 h-4" />
            </Button>
            {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-14 mr-3 mt-2 mb-3 space-y-3">
          <div className="text-xs text-muted-foreground">
            Результат: {attempt.score} из {attempt.max_score} ({percentage}%) · Проходной балл: {attempt.passing_score}%
          </div>
          {shownQuestions.map((q, idx) => {
            const studentAnswer = attempt.answers[q.id];
            const isCorrect = studentAnswer === q.correct_answer;
            return (
              <div key={q.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="text-sm font-medium">
                  {idx + 1}. {q.question}
                </div>
                <div className="space-y-1">
                  {q.options.map((opt, optIdx) => {
                    const isStudentChoice = studentAnswer === optIdx;
                    const isCorrectOption = q.correct_answer === optIdx;
                    let bg = "";
                    if (isStudentChoice && isCorrect) bg = "bg-green-500/10 border-green-500/30 text-green-700";
                    else if (isStudentChoice && !isCorrect) bg = "bg-destructive/10 border-destructive/30 text-destructive";
                    else if (isCorrectOption) bg = "bg-green-500/5 border-green-500/20 text-green-600";

                    return (
                      <div key={optIdx} className={`text-sm px-3 py-1.5 rounded-md border ${bg || "border-transparent"}`}>
                        {isStudentChoice && isCorrect && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5" />}
                        {isStudentChoice && !isCorrect && <XCircle className="w-3.5 h-3.5 inline mr-1.5" />}
                        {!isStudentChoice && isCorrectOption && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5 opacity-50" />}
                        {typeof opt === 'object' && opt !== null ? (opt as any).text : opt}
                      </div>
                    );
                  })}
                </div>
                {q.explanation && (
                  <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                    💡 {q.explanation}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
