import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { CalendarIcon, Users, UserPlus, Loader2, Check, Plus, Link as LinkIcon, Copy } from "lucide-react";

interface StudentGroup {
  id: string;
  name: string;
  color: string | null;
  organization_id: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

interface CourseGroupsTabProps {
  courseId: string;
  organizationId: string;
  onRefreshStudents?: () => void;
}

const GROUP_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6",
  "#8b5cf6", "#ef4444", "#14b8a6", "#f97316", "#06b6d4",
];

export function CourseGroupsTab({ courseId, organizationId, onRefreshStudents }: CourseGroupsTabProps) {
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrollingGroupId, setEnrollingGroupId] = useState<string | null>(null);
  const [groupStudentCounts, setGroupStudentCounts] = useState<Record<string, number>>({});
  const [enrolledCounts, setEnrolledCounts] = useState<Record<string, number>>({});
  const [groupLinks, setGroupLinks] = useState<Record<string, string>>({});

  // Add students to group state
  const [showAddStudentsDialog, setShowAddStudentsDialog] = useState(false);
  const [selectedGroupForAdd, setSelectedGroupForAdd] = useState<StudentGroup | null>(null);
  const [unassignedStudents, setUnassignedStudents] = useState<{ user_id: string; full_name: string | null; email: string | null }[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [addingStudents, setAddingStudents] = useState(false);

  // Create group state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState(GROUP_COLORS[0]);
  const [newGroupStartDate, setNewGroupStartDate] = useState<Date | undefined>();
  const [newGroupEndDate, setNewGroupEndDate] = useState<Date | undefined>();
  const [isCreating, setIsCreating] = useState(false);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("student_groups")
        .select("*")
        .eq("organization_id", organizationId)
        .order("name");

      const groupsList = (data as any[] || []) as StudentGroup[];
      setGroups(groupsList);

      if (groupsList.length > 0) {
        const groupIds = groupsList.map(g => g.id);

        // Load registration links for groups
        const { data: links } = await supabase
          .from("registration_links")
          .select("token, student_group_id")
          .in("student_group_id", groupIds);

        const linksMap: Record<string, string> = {};
        for (const l of (links as any[] || [])) {
          if (l.student_group_id) {
            linksMap[l.student_group_id] = `${window.location.origin}/join/${l.token}`;
          }
        }
        setGroupLinks(linksMap);

        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, student_group_id")
          .eq("organization_id", organizationId)
          .not("student_group_id", "is", null);

        const counts: Record<string, number> = {};
        const usersByGroup: Record<string, string[]> = {};
        for (const p of (profiles as any[]) || []) {
          const gid = p.student_group_id;
          counts[gid] = (counts[gid] || 0) + 1;
          if (!usersByGroup[gid]) usersByGroup[gid] = [];
          usersByGroup[gid].push(p.user_id);
        }
        setGroupStudentCounts(counts);

        const allUserIds = (profiles as any[] || []).map((p: any) => p.user_id);
        if (allUserIds.length > 0) {
          const { data: enrollments } = await supabase
            .from("enrollments")
            .select("user_id")
            .eq("course_id", courseId)
            .in("user_id", allUserIds);

          const enrolledSet = new Set((enrollments || []).map((e: any) => e.user_id));
          const eCounts: Record<string, number> = {};
          for (const [gid, users] of Object.entries(usersByGroup)) {
            eCounts[gid] = users.filter(uid => enrolledSet.has(uid)).length;
          }
          setEnrolledCounts(eCounts);
        }
      }
    } catch (e) {
      console.error("Error loading groups:", e);
    } finally {
      setLoading(false);
    }
  }, [organizationId, courseId]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      toast.error("Введите название группы");
      return;
    }
    setIsCreating(true);
    try {
      const startDate = newGroupStartDate ? format(newGroupStartDate, "yyyy-MM-dd") : null;
      const endDate = newGroupEndDate ? format(newGroupEndDate, "yyyy-MM-dd") : null;

      const { data: groupData, error } = await supabase
        .from("student_groups")
        .insert({
          name: newGroupName.trim(),
          color: newGroupColor,
          organization_id: organizationId,
          start_date: startDate,
          end_date: endDate,
        } as any)
        .select("id")
        .single();
      if (error) throw error;

      const groupId = (groupData as any).id;

      // Auto-create registration link for this group
      const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
      await supabase.from("registration_links").insert({
        organization_id: organizationId,
        course_id: courseId,
        token,
        name: `Группа: ${newGroupName.trim()}`,
        student_group_id: groupId,
        expires_at: endDate ? new Date(endDate + "T23:59:59").toISOString() : null,
      } as any);

      const link = `${window.location.origin}/join/${token}`;
      await navigator.clipboard.writeText(link);
      toast.success("Группа создана, ссылка скопирована");

      setShowCreateDialog(false);
      setNewGroupName("");
      setNewGroupColor(GROUP_COLORS[0]);
      setNewGroupStartDate(undefined);
      setNewGroupEndDate(undefined);
      loadGroups();
    } catch (e) {
      toast.error("Ошибка создания группы");
    } finally {
      setIsCreating(false);
    }
  };

  const handleEnrollGroup = async (groupId: string) => {
    setEnrollingGroupId(groupId);
    try {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("student_group_id", groupId);

      const userIds = (profiles as any[] || []).map((p: any) => p.user_id);
      if (userIds.length === 0) {
        toast.warning("В группе нет учеников");
        return;
      }

      const { data: existing } = await supabase
        .from("enrollments")
        .select("user_id")
        .eq("course_id", courseId)
        .in("user_id", userIds);

      const existingSet = new Set((existing || []).map((e: any) => e.user_id));
      const toEnroll = userIds.filter((uid: string) => !existingSet.has(uid));

      if (toEnroll.length === 0) {
        toast.info("Все ученики группы уже зачислены на этот курс");
        return;
      }

      const enrollments = toEnroll.map((uid: string) => ({
        user_id: uid,
        course_id: courseId,
        status: "active",
        progress: 0,
        time_spent: 0,
      }));

      const { error } = await supabase.from("enrollments").insert(enrollments);
      if (error) throw error;

      toast.success(`Зачислено ${toEnroll.length} уч. из группы`);
      onRefreshStudents?.();
      loadGroups();
    } catch (e) {
      toast.error("Ошибка зачисления группы");
    } finally {
      setEnrollingGroupId(null);
    }
  };

  const handleUpdateDate = async (groupId: string, field: "start_date" | "end_date", date: Date | undefined) => {
    try {
      const value = date ? format(date, "yyyy-MM-dd") : null;
      const { error } = await supabase
        .from("student_groups")
        .update({ [field]: value } as any)
        .eq("id", groupId);
      if (error) throw error;
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, [field]: value } : g));
      toast.success("Дата обновлена");
    } catch (e) {
      toast.error("Ошибка обновления даты");
    }
  };

  const handleCopyLink = async (groupId: string) => {
    const link = groupLinks[groupId];
    if (link) {
      await navigator.clipboard.writeText(link);
      toast.success("Ссылка скопирована");
    }
  };

  const handleOpenAddStudents = async (group: StudentGroup) => {
    setSelectedGroupForAdd(group);
    setSelectedStudentIds(new Set());
    setShowAddStudentsDialog(true);
    setLoadingStudents(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .eq("organization_id", organizationId)
        .is("student_group_id", null);
      setUnassignedStudents((data as any[] || []).map((p: any) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        email: p.email,
      })));
    } catch {
      toast.error("Ошибка загрузки учеников");
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleAddStudentsToGroup = async () => {
    if (!selectedGroupForAdd || selectedStudentIds.size === 0) return;
    setAddingStudents(true);
    try {
      const ids = Array.from(selectedStudentIds);
      for (const uid of ids) {
        await supabase
          .from("profiles")
          .update({ student_group_id: selectedGroupForAdd.id } as any)
          .eq("user_id", uid);
      }
      toast.success(`${ids.length} уч. добавлено в группу`);
      setShowAddStudentsDialog(false);
      loadGroups();
      onRefreshStudents?.();
    } catch {
      toast.error("Ошибка добавления учеников");
    } finally {
      setAddingStudents(false);
    }
  };

  const toggleStudent = (uid: string) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  };

  const addStudentsDialog = (
    <Dialog open={showAddStudentsDialog} onOpenChange={setShowAddStudentsDialog}>
      <DialogContent className="rounded-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Добавить учеников в «{selectedGroupForAdd?.name}»</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-1 py-2">
          {loadingStudents ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : unassignedStudents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Нет учеников без группы</p>
          ) : (
            unassignedStudents.map(s => (
              <label key={s.user_id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer">
                <Checkbox
                  checked={selectedStudentIds.has(s.user_id)}
                  onCheckedChange={() => toggleStudent(s.user_id)}
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{s.full_name || "Без имени"}</div>
                  {s.email && <div className="text-xs text-muted-foreground truncate">{s.email}</div>}
                </div>
              </label>
            ))
          )}
        </div>
        {unassignedStudents.length > 0 && (
          <Button
            className="w-full btn-gradient rounded-xl mt-2"
            disabled={selectedStudentIds.size === 0 || addingStudents}
            onClick={handleAddStudentsToGroup}
          >
            {addingStudents ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
            Добавить ({selectedStudentIds.size})
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );

  const createGroupDialog = (
    <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Создать группу</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Название группы</label>
            <Input
              placeholder="Например: Группа А-2026"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Цвет</label>
            <div className="flex gap-2 flex-wrap">
              {GROUP_COLORS.map((c) => (
                <button
                  key={c}
                  className={cn(
                    "w-8 h-8 rounded-full transition-all border-2",
                    newGroupColor === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setNewGroupColor(c)}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Дата начала набора</label>
              <DatePicker
                date={newGroupStartDate}
                onChange={setNewGroupStartDate}
                placeholder="Начало"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Дата окончания набора</label>
              <DatePicker
                date={newGroupEndDate}
                onChange={setNewGroupEndDate}
                placeholder="Конец"
              />
            </div>
          </div>
          <div className="p-3 rounded-xl bg-muted/50 border border-border/50">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <LinkIcon className="w-3.5 h-3.5" />
              Ссылка для регистрации будет создана автоматически
            </div>
          </div>
          <Button
            className="w-full btn-gradient rounded-xl"
            onClick={handleCreateGroup}
            disabled={isCreating || !newGroupName.trim()}
          >
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            Создать группу
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        {createGroupDialog}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-16 px-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-blue-500" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Группы учеников</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
            Группы позволяют массово зачислять учеников на курс и управлять расписанием обучения. Создайте группу и добавляйте в неё учеников.
          </p>
          <Button
            className="btn-gradient rounded-xl gap-2"
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="w-4 h-4" />
            Создать группу
          </Button>
        </div>
        {createGroupDialog}
      </>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Группы организации</h3>
        <Button
          size="sm"
          variant="outline"
          className="rounded-xl gap-1.5"
          onClick={() => setShowCreateDialog(true)}
        >
          <Plus className="w-4 h-4" />
          Создать группу
        </Button>
      </div>
      <div className="space-y-2">
        {groups.map(group => {
          const total = groupStudentCounts[group.id] || 0;
          const enrolled = enrolledCounts[group.id] || 0;
          const available = total - enrolled;
          const allEnrolled = total > 0 && enrolled >= total;
          const isEnrolling = enrollingGroupId === group.id;
          const hasLink = !!groupLinks[group.id];

          return (
            <div key={group.id} className="flex items-center justify-between p-4 bg-muted/50 rounded-xl border border-border/50">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: group.color || "#6366f1" }} />
                <div className="min-w-0">
                  <div className="font-medium text-sm">{group.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {total} уч. · {enrolled} зачислено
                    {available > 0 && <span className="text-primary font-medium"> · {available} доступно</span>}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <DatePicker
                  date={group.start_date ? new Date(group.start_date) : undefined}
                  onChange={(d) => handleUpdateDate(group.id, "start_date", d)}
                  placeholder="Начало"
                />
                <span className="text-muted-foreground text-xs">—</span>
                <DatePicker
                  date={group.end_date ? new Date(group.end_date) : undefined}
                  onChange={(d) => handleUpdateDate(group.id, "end_date", d)}
                  placeholder="Конец"
                />

                {hasLink && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-xl gap-1.5 text-xs"
                    onClick={() => handleCopyLink(group.id)}
                    title="Скопировать ссылку регистрации"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Ссылка
                  </Button>
                )}

                <Button
                  size="sm"
                  className="rounded-xl gap-1.5 ml-1"
                  disabled={isEnrolling || allEnrolled}
                  onClick={() => handleEnrollGroup(group.id)}
                >
                  {isEnrolling ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : allEnrolled ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  {allEnrolled ? "Зачислены" : "Зачислить"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {createGroupDialog}
    </div>
  );
}

function DatePicker({ date, onChange, placeholder }: { date?: Date; onChange: (d: Date | undefined) => void; placeholder: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "w-[120px] justify-start text-left font-normal text-xs rounded-lg h-8",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="w-3 h-3 mr-1" />
          {date ? format(date, "dd.MM.yy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onChange}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}
