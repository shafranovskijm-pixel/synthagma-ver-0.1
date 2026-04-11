import { BookOpen, FileSpreadsheet, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStatusBadge } from "./StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";

interface CoursesTabProps {
  enrollments: {
    id: string;
    course_id: string;
    course_title: string;
    progress: number;
    status: string;
    started_at: string;
    completed_at?: string | null;
    time_spent: number;
  }[];
  h: any;
}

export function CoursesTab({ enrollments, h }: CoursesTabProps) {
  const [completingId, setCompletingId] = useState<string | null>(null);

  const handleManualComplete = async (enrollmentId: string) => {
    setCompletingId(enrollmentId);
    try {
      const { error } = await supabase
        .from("enrollments")
        .update({ status: "completed", completed_at: new Date().toISOString(), progress: 100 })
        .eq("id", enrollmentId);
      if (error) throw error;
      toast.success("Курс отмечен как завершённый");
      h.onStudentUpdated?.();
    } catch (e: any) {
      toast.error("Ошибка: " + e.message);
    } finally {
      setCompletingId(null);
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-6">
      <h3 className="font-semibold mb-4 flex items-center gap-2"><BookOpen className="w-5 h-5 text-primary" />Курсы ({enrollments.length})</h3>
      {enrollments.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground"><BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Ученик не зачислен на курсы</p></div>
      ) : (
        <div className="space-y-3">
          {enrollments.map((e) => (
            <div key={e.id} className="p-4 rounded-xl bg-muted/50">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">{e.course_title}</h4>
                {getStatusBadge(e.status)}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>Прогресс: {e.progress}%</span>
                <span>Время: {h.formatDuration(e.time_spent)}</span>
                {e.completed_at && <span>Завершён: {h.formatDate(e.completed_at)}</span>}
              </div>
              <div className="w-full bg-muted rounded-full h-2 mt-2">
                <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${Math.min(e.progress, 100)}%` }} />
              </div>
              <div className="flex gap-2 mt-3">
                {e.status !== "completed" && (
                  <Button size="sm" variant="outline" className="rounded-lg gap-2" onClick={() => handleManualComplete(e.id)} disabled={completingId === e.id}>
                    <CheckCircle className="w-4 h-4" />
                    {completingId === e.id ? "Завершение..." : "Завершить курс"}
                  </Button>
                )}
                {e.status === "completed" && (
                  <Button size="sm" variant="outline" className="rounded-lg gap-2" onClick={() => { h.setSelectedEnrollmentForFRDO(e); h.setIsFRDODialogOpen(true); }}>
                    <FileSpreadsheet className="w-4 h-4" />Экспорт ФРДО
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
