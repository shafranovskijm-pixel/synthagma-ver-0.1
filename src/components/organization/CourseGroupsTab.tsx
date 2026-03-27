import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { CalendarIcon, Users, UserPlus, Loader2, Check } from "lucide-react";

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

export function CourseGroupsTab({ courseId, organizationId, onRefreshStudents }: CourseGroupsTabProps) {
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrollingGroupId, setEnrollingGroupId] = useState<string | null>(null);
  const [groupStudentCounts, setGroupStudentCounts] = useState<Record<string, number>>({});
  const [enrolledCounts, setEnrolledCounts] = useState<Record<string, number>>({});

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
        // Count students per group
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

        // Count already enrolled students per group for this course
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

  const handleEnrollGroup = async (groupId: string) => {
    setEnrollingGroupId(groupId);
    try {
      // Get all students in the group
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("student_group_id" as any, groupId);

      const userIds = (profiles as any[] || []).map((p: any) => p.user_id);
      if (userIds.length === 0) {
        toast.warning("В группе нет учеников");
        return;
      }

      // Check existing enrollments
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

      // Enroll new students
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p className="font-medium">Нет групп</p>
        <p className="text-sm mt-1">Создайте группы в разделе «Ученики»</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Группы организации</h3>
      <div className="space-y-2">
        {groups.map(group => {
          const total = groupStudentCounts[group.id] || 0;
          const enrolled = enrolledCounts[group.id] || 0;
          const allEnrolled = total > 0 && enrolled >= total;
          const isEnrolling = enrollingGroupId === group.id;

          return (
            <div key={group.id} className="flex items-center justify-between p-4 bg-muted/50 rounded-xl border border-border/50">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: group.color || "#6366f1" }} />
                <div className="min-w-0">
                  <div className="font-medium text-sm">{group.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {total} уч. · {enrolled} зачислено
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Start date */}
                <DatePicker
                  date={group.start_date ? new Date(group.start_date) : undefined}
                  onChange={(d) => handleUpdateDate(group.id, "start_date", d)}
                  placeholder="Начало"
                />
                <span className="text-muted-foreground text-xs">—</span>
                {/* End date */}
                <DatePicker
                  date={group.end_date ? new Date(group.end_date) : undefined}
                  onChange={(d) => handleUpdateDate(group.id, "end_date", d)}
                  placeholder="Конец"
                />

                <Button
                  size="sm"
                  className="rounded-xl gap-1.5 ml-2"
                  disabled={isEnrolling || allEnrolled || total === 0}
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
