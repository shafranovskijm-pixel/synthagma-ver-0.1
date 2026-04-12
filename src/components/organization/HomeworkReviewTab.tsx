import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookCheck, Loader2, Clock, CheckCircle2, AlertCircle, RotateCcw } from "lucide-react";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { HomeworkReviewDialog } from "./HomeworkReviewDialog";

interface Submission {
  id: string;
  lesson_id: string;
  student_id: string;
  course_id: string;
  content: string | null;
  attachments: any[];
  status: string;
  score: number | null;
  reviewer_comment: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  // joined
  student_name?: string;
  student_email?: string;
  lesson_title?: string;
  course_title?: string;
}

const statusOptions = [
  { value: "all", label: "Все статусы" },
  { value: "pending", label: "Ждёт проверки", icon: Clock },
  { value: "revision", label: "На доработке", icon: RotateCcw },
  { value: "approved", label: "Выполнено", icon: CheckCircle2 },
  { value: "rejected", label: "Незачёт", icon: AlertCircle },
];

const statusBadge: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  revision: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  approved: "bg-green-500/10 text-green-600 border-green-500/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

export function HomeworkReviewTab() {
  const d = useOrgDashboard();
  const organizationId = d.organizationId;
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [selected, setSelected] = useState<Submission | null>(null);

  useEffect(() => { if (organizationId) loadSubmissions(); }, [organizationId, statusFilter]);

  const loadSubmissions = async () => {
    setLoading(true);
    let q = supabase
      .from("homework_submissions")
      .select("*")
      .eq("organization_id", organizationId!)
      .order("submitted_at", { ascending: false })
      .limit(200);
    
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    
    const { data } = await q;
    const subs = (data as any[]) || [];

    // Enrich with student & lesson info
    if (subs.length > 0) {
      const studentIds = [...new Set(subs.map(s => s.student_id))];
      const lessonIds = [...new Set(subs.map(s => s.lesson_id))];
      const courseIds = [...new Set(subs.map(s => s.course_id))];

      const [{ data: profiles }, { data: lessons }, { data: courses }] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, email").in("user_id", studentIds),
        supabase.from("lessons").select("id, title").in("id", lessonIds),
        supabase.from("courses").select("id, title").in("id", courseIds),
      ]);

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
      const lessonMap = new Map((lessons || []).map(l => [l.id, l]));
      const courseMap = new Map((courses || []).map(c => [c.id, c]));

      subs.forEach(s => {
        const p = profileMap.get(s.student_id);
        s.student_name = p?.full_name || "—";
        s.student_email = p?.email || "";
        s.lesson_title = lessonMap.get(s.lesson_id)?.title || "—";
        s.course_title = courseMap.get(s.course_id)?.title || "—";
      });
    }

    setSubmissions(subs);
    setLoading(false);
  };

  const pendingCount = submissions.filter(s => s.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <BookCheck className="w-5 h-5 text-indigo-500" />
            Проверка заданий
            {statusFilter === "pending" && pendingCount > 0 && (
              <Badge variant="destructive" className="ml-2">{pendingCount}</Badge>
            )}
          </h2>
          <p className="text-sm text-muted-foreground">Домашние работы и задания учеников</p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {statusOptions.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : submissions.length === 0 ? (
        <div className="text-center py-12 max-w-lg mx-auto">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
            <BookCheck className="w-8 h-8 text-indigo-500" />
          </div>
          <p className="font-semibold text-lg mb-2">Проверка домашних заданий</p>
          <p className="text-sm text-muted-foreground mb-6">
            Здесь вы будете проверять ответы учеников на практические задания. Назначайте оценки, оставляйте комментарии и отправляйте на доработку — всё в одном месте.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
            <div className="bg-muted/50 rounded-xl p-3 border border-border/50">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-medium">Ждёт проверки</span>
              </div>
              <p className="text-xs text-muted-foreground">Новые ответы учеников попадают сюда автоматически</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3 border border-border/50">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-xs font-medium">Оценка и отзыв</span>
              </div>
              <p className="text-xs text-muted-foreground">Ставьте баллы и пишите комментарии к работам</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3 border border-border/50">
              <div className="flex items-center gap-2 mb-1">
                <RotateCcw className="w-4 h-4 text-orange-500" />
                <span className="text-xs font-medium">Доработка</span>
              </div>
              <p className="text-xs text-muted-foreground">Отправляйте работу на исправление с пояснениями</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">Чтобы получить задания, добавьте урок типа «Практическое задание» в конструкторе курса</p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ученик</TableHead>
                <TableHead>Задание</TableHead>
                <TableHead>Курс</TableHead>
                <TableHead>Дата</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map(s => (
                <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelected(s)}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{s.student_name}</p>
                      <p className="text-xs text-muted-foreground">{s.student_email}</p>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm">{s.lesson_title}</TableCell>
                  <TableCell className="max-w-[150px] truncate text-sm text-muted-foreground">{s.course_title}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(s.submitted_at).toLocaleDateString("ru-RU")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusBadge[s.status] || ""}>
                      {statusOptions.find(o => o.value === s.status)?.label || s.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" className="rounded-lg text-xs" onClick={(e) => { e.stopPropagation(); setSelected(s); }}>
                      Проверить
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selected && (
        <HomeworkReviewDialog
          submission={selected}
          open={!!selected}
          onOpenChange={(open) => !open && setSelected(null)}
          onUpdated={() => { setSelected(null); loadSubmissions(); }}
        />
      )}
    </div>
  );
}
