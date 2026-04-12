import { BookOpen, FileSpreadsheet, CheckCircle, CalendarIcon, Save, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { getStatusBadge } from "./StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { format } from "date-fns";

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
  organizationId: string;
  studentUserId: string;
}

interface StudentGroup {
  id: string;
  name: string;
  color: string | null;
}

export function CoursesTab({ enrollments, h, organizationId, studentUserId }: CoursesTabProps) {
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [savingDateId, setSavingDateId] = useState<string | null>(null);

  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);
  const [savingGroup, setSavingGroup] = useState(false);

  useEffect(() => {
    if (!organizationId || !studentUserId) return;
    const load = async () => {
      const [groupsRes, profileRes] = await Promise.all([
        supabase.from("student_groups").select("id, name, color").eq("organization_id", organizationId).order("name"),
        supabase.from("profiles").select("student_group_id").eq("user_id", studentUserId).single(),
      ]);
      setGroups(groupsRes.data || []);
      setCurrentGroupId((profileRes.data as any)?.student_group_id || null);
    };
    load();
  }, [organizationId, studentUserId]);

  const handleGroupChange = async (groupId: string) => {
    const value = groupId === "__none__" ? null : groupId;
    setSavingGroup(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ student_group_id: value } as any)
        .eq("user_id", studentUserId);
      if (error) throw error;
      setCurrentGroupId(value);
      toast.success(value ? "Ученик добавлен в группу" : "Ученик удалён из группы");
      h.onStudentUpdated?.();
    } catch (e: any) {
      toast.error("Ошибка: " + e.message);
    } finally {
      setSavingGroup(false);
    }
  };

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

  const handleStartEditDate = (enrollment: CoursesTabProps["enrollments"][0]) => {
    setEditingDateId(enrollment.id);
    const date = enrollment.completed_at ? new Date(enrollment.completed_at) : new Date();
    setEditDate(format(date, "yyyy-MM-dd'T'HH:mm"));
  };

  const handleSaveDate = async (enrollmentId: string) => {
    setSavingDateId(enrollmentId);
    try {
      const newDate = new Date(editDate).toISOString();
      const { error } = await supabase
        .from("enrollments")
        .update({ completed_at: newDate })
        .eq("id", enrollmentId);
      if (error) throw error;
      toast.success("Дата завершения обновлена для ФРДО");
      setEditingDateId(null);
      h.onStudentUpdated?.();
    } catch (e: any) {
      toast.error("Ошибка: " + e.message);
    } finally {
      setSavingDateId(null);
    }
  };

  const currentGroup = groups.find(g => g.id === currentGroupId);

  return (
    <div className="space-y-4">
      {/* Group selector */}
      {groups.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <span className="font-semibold text-sm">Группа</span>
              {currentGroup && (
                <Badge variant="outline" className="ml-1" style={currentGroup.color ? { borderColor: currentGroup.color, color: currentGroup.color } : {}}>
                  {currentGroup.name}
                </Badge>
              )}
            </div>
            <Select
              value={currentGroupId || "__none__"}
              onValueChange={handleGroupChange}
              disabled={savingGroup}
            >
              <SelectTrigger className="w-[220px] h-9 rounded-lg text-sm">
                <SelectValue placeholder="Выберите группу" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Без группы</SelectItem>
                {groups.map(g => (
                  <SelectItem key={g.id} value={g.id}>
                    <span className="flex items-center gap-2">
                      {g.color && <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: g.color }} />}
                      {g.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Courses */}
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
                  {e.completed_at && editingDateId !== e.id && (
                    <button
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer underline decoration-dotted underline-offset-2"
                      onClick={() => handleStartEditDate(e)}
                      title="Нажмите, чтобы изменить дату для ФРДО"
                    >
                      <CalendarIcon className="w-3.5 h-3.5" />
                      Завершён: {h.formatDate(e.completed_at)}
                    </button>
                  )}
                </div>

                {editingDateId === e.id && (
                  <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-accent/5 border border-accent/20">
                    <Input
                      type="datetime-local"
                      value={editDate}
                      onChange={(ev) => setEditDate(ev.target.value)}
                      className="h-8 text-sm rounded-lg w-auto"
                    />
                    <Button size="sm" variant="default" className="h-8 rounded-lg gap-1.5 text-xs" onClick={() => handleSaveDate(e.id)} disabled={savingDateId === e.id}>
                      <Save className="w-3.5 h-3.5" />
                      {savingDateId === e.id ? "..." : "Сохранить для ФРДО"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 rounded-lg text-xs" onClick={() => setEditingDateId(null)}>Отмена</Button>
                  </div>
                )}

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
    </div>
  );
}
