import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Info, AlertCircle, Scale, ClipboardCheck, Bug, Lightbulb, CheckCircle2, X, Wand2, Loader2 } from "lucide-react";
import type { ReviewFinding, ReviewResult } from "@/hooks/useCourseReview";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

const typeConfig = {
  legislation: { label: "Законодательство", icon: Scale, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30" },
  test: { label: "Тест", icon: ClipboardCheck, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-950/30" },
  error: { label: "Ошибка", icon: Bug, color: "text-destructive", bg: "bg-destructive/5" },
  suggestion: { label: "Предложение", icon: Lightbulb, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/30" } };

const severityConfig = {
  critical: { label: "Критично", variant: "destructive" as const, icon: AlertCircle },
  warning: { label: "Внимание", variant: "secondary" as const, icon: AlertTriangle },
  info: { label: "Инфо", variant: "outline" as const, icon: Info } };

interface CourseReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isReviewing: boolean;
  reviewResult: ReviewResult | null;
  activeFindings: ReviewFinding[];
  dismissedCount: number;
  appliedCount?: number;
  applyingId?: string | null;
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
  onApply?: (finding: ReviewFinding) => void;
}

function describePatch(finding: ReviewFinding): string | null {
  if (!finding.patch || !finding.target_kind || finding.target_kind === "none") return null;
  const p = finding.patch as Record<string, unknown>;
  const parts: string[] = [];
  if (finding.target_kind === "lesson_title" && typeof p.title === "string") {
    parts.push(`Название урока → «${p.title}»`);
  }
  if (finding.target_kind === "test_question") {
    if (typeof p.question === "string") parts.push("Текст вопроса");
    if (Array.isArray(p.options)) parts.push(`Варианты ответа (${p.options.length})`);
    if (typeof p.correct_answer === "number") parts.push(`Правильный ответ → №${(p.correct_answer as number) + 1}`);
    if (typeof p.explanation === "string") parts.push("Пояснение");
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

function FindingCard({
  finding,
  onDismiss,
  onApply,
  isApplying,
}: {
  finding: ReviewFinding;
  onDismiss: () => void;
  onApply?: () => void;
  isApplying?: boolean;
}) {
  const type = typeConfig[finding.type];
  const severity = severityConfig[finding.severity];
  const TypeIcon = type.icon;
  const canApply = !!onApply && !!finding.target_kind && finding.target_kind !== "none" && !!finding.target_id && !!finding.patch && Object.keys(finding.patch).length > 0;
  const patchDesc = describePatch(finding);

  return (
    <div className={`rounded-xl border p-4 space-y-2 ${type.bg}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <TypeIcon className={`w-4 h-4 ${type.color}`} />
          <span className={`text-sm font-medium ${type.color}`}>{type.label}</span>
          <Badge variant={severity.variant} className="text-[10px] h-5">{severity.label}</Badge>
          <span className="text-xs text-muted-foreground">· {finding.lesson_title}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onDismiss} title="Отклонить" disabled={isApplying}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      <p className="text-sm">{finding.description}</p>
      <div className="bg-background/60 rounded-lg p-3 border border-border/50">
        <p className="text-xs text-muted-foreground mb-1 font-medium">Рекомендация:</p>
        <p className="text-sm">{finding.suggestion}</p>
        {canApply && patchDesc && (
          <p className="text-xs text-muted-foreground mt-2">
            <span className="font-medium">Будет изменено:</span> {patchDesc}
          </p>
        )}
      </div>
      {canApply && (
        <div className="flex justify-end pt-1">
          <Button size="sm" onClick={onApply} disabled={isApplying} className="gap-1.5">
            {isApplying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            Применить
          </Button>
        </div>
      )}
    </div>
  );
}

export function CourseReviewDialog({
  open,
  onOpenChange,
  isReviewing,
  reviewResult,
  activeFindings,
  dismissedCount,
  onDismiss,
  onDismissAll }: CourseReviewDialogProps) {
  const totalFindings = reviewResult?.findings.length || 0;

  const criticalCount = activeFindings.filter(f => f.severity === "critical").length;
  const warningCount = activeFindings.filter(f => f.severity === "warning").length;
  const infoCount = activeFindings.filter(f => f.severity === "info").length;

  // Group by lesson
  const groupedFindings: Record<string, ReviewFinding[]> = {};
  for (const f of activeFindings) {
    const key = f.lesson_title;
    if (!groupedFindings[key]) groupedFindings[key] = [];
    groupedFindings[key].push(f);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-primary" />
            AI Проверка курса
          </DialogTitle>
          <DialogDescription>
            Анализ содержания, законодательства и тестов
          </DialogDescription>
        </DialogHeader>

        {isReviewing && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <SigmaSpinner size="xl" />
            <p className="text-muted-foreground text-center">
              ИИ анализирует курс...<br />
              <span className="text-xs">Проверка законодательства, тестов и содержания</span>
            </p>
          </div>
        )}

        {!isReviewing && reviewResult && (
          <>
            {/* Summary */}
            <div className="bg-muted/50 rounded-xl p-4 space-y-2">
              <p className="text-sm">{reviewResult.summary}</p>
              <div className="flex items-center gap-3 text-xs">
                {criticalCount > 0 && (
                  <span className="flex items-center gap-1 text-destructive">
                    <AlertCircle className="w-3 h-3" /> {criticalCount} критичных
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-3 h-3" /> {warningCount} предупреждений
                  </span>
                )}
                {infoCount > 0 && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Info className="w-3 h-3" /> {infoCount} инфо
                  </span>
                )}
                {dismissedCount > 0 && (
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="w-3 h-3" /> {dismissedCount} отклонено
                  </span>
                )}
              </div>
            </div>

            {/* Findings */}
            {activeFindings.length > 0 ? (
              <>
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" onClick={onDismissAll} className="text-xs">
                    Отклонить все ({activeFindings.length})
                  </Button>
                </div>
                <ScrollArea className="flex-1 max-h-[50vh] pr-2">
                  <div className="space-y-6">
                    {Object.entries(groupedFindings).map(([lessonTitle, findings]) => (
                      <div key={lessonTitle} className="space-y-2">
                        <h4 className="text-sm font-semibold text-muted-foreground px-1">{lessonTitle}</h4>
                        {findings.map(f => (
                          <FindingCard key={f.id} finding={f} onDismiss={() => onDismiss(f.id)} />
                        ))}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <CheckCircle2 className="w-12 h-12 text-green-500" />
                <p className="text-muted-foreground">
                  {totalFindings === 0 ? "Замечаний не найдено!" : "Все замечания обработаны"}
                </p>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
