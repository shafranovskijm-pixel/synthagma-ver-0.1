import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Plus, ClipboardList, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
interface Employee {
  user_id: string;
  full_name: string;
}

interface Course {
  id: string;
  title: string;
}

interface TrainingPlan {
  id: string;
  user_id: string;
  course_id: string | null;
  course_name: string | null;
  planned_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  employee_name?: string;
  course_title?: string;
}

interface Props {
  companyId: string;
  organizationId: string;
  employees: Employee[];
}

const statusConfig: Record<string, { label: string; color: string }> = {
  planned: { label: "Запланировано", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  enrolled: { label: "Зачислен", color: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  completed: { label: "Завершено", color: "bg-green-500/10 text-green-500 border-green-500/20" },
  overdue: { label: "Просрочено", color: "bg-destructive/10 text-destructive border-destructive/20" } };

export function TrainingPlansTab({ companyId, organizationId, employees }: Props) {
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Form state
  const [formUserId, setFormUserId] = useState("");
  const [formCourseId, setFormCourseId] = useState("");
  const [formCourseName, setFormCourseName] = useState("");
  const [formDate, setFormDate] = useState<Date>();
  const [formNotes, setFormNotes] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, coursesRes] = await Promise.all([
        supabase.from("training_plans").select("*").eq("company_id", companyId).order("planned_date", { ascending: true }),
        supabase.from("courses").select("id, title").eq("organization_id", organizationId).eq("is_published", true),
      ]);

      const plansData = (plansRes.data || []).map((p) => {
        const emp = employees.find((e) => e.user_id === p.user_id);
        const course = (coursesRes.data || []).find((c) => c.id === p.course_id);
        return { ...p, employee_name: emp?.full_name || "—", course_title: course?.title || p.course_name || "—" };
      });

      setPlans(plansData);
      setCourses(coursesRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [companyId, organizationId, employees]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAdd = async () => {
    if (!formUserId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("training_plans").insert({
        company_id: companyId,
        organization_id: organizationId,
        user_id: formUserId,
        course_id: formCourseId || null,
        course_name: formCourseName || null,
        planned_date: formDate ? format(formDate, "yyyy-MM-dd") : null,
        notes: formNotes || null,
        status: "planned" });
      if (error) throw error;
      toast.success("План добавлен");
      setShowAdd(false);
      setFormUserId(""); setFormCourseId(""); setFormCourseName(""); setFormDate(undefined); setFormNotes("");
      loadData();
    } catch (err: any) {
      toast.error("Ошибка", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const filteredPlans = filterStatus === "all" ? plans : plans.filter((p) => p.status === filterStatus);

  const isOverdue = (plan: TrainingPlan) =>
    plan.status === "planned" && plan.planned_date && new Date(plan.planned_date) < new Date();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <SigmaSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <ClipboardList className="w-5 h-5" />
          Планирование обучения
        </h2>
        <div className="flex items-center gap-3">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="planned">Запланировано</SelectItem>
              <SelectItem value="enrolled">Зачислен</SelectItem>
              <SelectItem value="completed">Завершено</SelectItem>
              <SelectItem value="overdue">Просрочено</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" className="gap-2" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4" />
            Добавить план
          </Button>
        </div>
      </div>

      {filteredPlans.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Нет планов обучения</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Сотрудник</TableHead>
                <TableHead>Курс</TableHead>
                <TableHead>Плановая дата</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Примечание</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPlans.map((plan) => {
                const overdue = isOverdue(plan);
                const st = overdue ? statusConfig.overdue : statusConfig[plan.status] || statusConfig.planned;
                return (
                  <TableRow key={plan.id} className={overdue ? "bg-destructive/5" : ""}>
                    <TableCell className="font-medium">{plan.employee_name}</TableCell>
                    <TableCell>{plan.course_title}</TableCell>
                    <TableCell>
                      {plan.planned_date ? (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-muted-foreground" />
                          {format(new Date(plan.planned_date), "dd.MM.yyyy")}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={st.color}>
                        {overdue && <AlertCircle className="w-3 h-3 mr-1" />}
                        {st.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{plan.notes || "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Plan Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый план обучения</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Сотрудник *</Label>
              <Select value={formUserId} onValueChange={setFormUserId}>
                <SelectTrigger><SelectValue placeholder="Выберите сотрудника" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.user_id} value={e.user_id}>{e.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Курс</Label>
              <Select value={formCourseId} onValueChange={setFormCourseId}>
                <SelectTrigger><SelectValue placeholder="Выберите курс" /></SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!formCourseId && (
              <div className="space-y-2">
                <Label>Или укажите название курса</Label>
                <Input placeholder="Название курса" value={formCourseName} onChange={(e) => setFormCourseName(e.target.value)} />
              </div>
            )}
            <div className="space-y-2">
              <Label>Плановая дата</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formDate && "text-muted-foreground")}>
                    <Calendar className="mr-2 h-4 w-4" />
                    {formDate ? format(formDate, "PPP", { locale: ru }) : "Выберите дату"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent mode="single" selected={formDate} onSelect={setFormDate} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Примечание</Label>
              <Input placeholder="Комментарий" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
            </div>
            <Button className="w-full" onClick={handleAdd} disabled={!formUserId || saving}>
              {saving ? <SigmaSpinner size="sm" className="mr-2" /> : null}
              Добавить план
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
