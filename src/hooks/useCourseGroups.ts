import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

export interface StudentGroup {
  id: string;
  name: string;
  color: string | null;
  organization_id: string;
  course_id: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export const GROUP_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6",
  "#8b5cf6", "#ef4444", "#14b8a6", "#f97316", "#06b6d4",
];

export interface CourseGroupRefreshCallbacks {
  onEnrollmentChanged?: () => void;
  onGroupingChanged?: () => void;
  onStudentPopulationChanged?: () => void;
  onGroupDirectoryChanged?: () => void;
}

export function useCourseGroups(courseId: string, organizationId: string, callbacks?: CourseGroupRefreshCallbacks) {
  const { onEnrollmentChanged, onGroupingChanged, onStudentPopulationChanged, onGroupDirectoryChanged } = callbacks || {};
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrollingGroupId, setEnrollingGroupId] = useState<string | null>(null);
  const [groupStudentCounts, setGroupStudentCounts] = useState<Record<string, number>>({});
  const [enrolledCounts, setEnrolledCounts] = useState<Record<string, number>>({});
  const [groupLinks, setGroupLinks] = useState<Record<string, string>>({});

  const [showAddStudentsDialog, setShowAddStudentsDialog] = useState(false);
  const [selectedGroupForAdd, setSelectedGroupForAdd] = useState<StudentGroup | null>(null);
  const [unassignedStudents, setUnassignedStudents] = useState<{ user_id: string; full_name: string | null; email: string | null }[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [addingStudents, setAddingStudents] = useState(false);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState(GROUP_COLORS[0]);
  const [newGroupStartDate, setNewGroupStartDate] = useState<Date | undefined>();
  const [newGroupEndDate, setNewGroupEndDate] = useState<Date | undefined>();
  const [isCreating, setIsCreating] = useState(false);

  const [showNewStudentForm, setShowNewStudentForm] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentEmail, setNewStudentEmail] = useState("");
  const [creatingStudent, setCreatingStudent] = useState(false);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from("student_groups").select("*").eq("organization_id", organizationId).order("name");
      const groupsList = (data as any[] || []) as StudentGroup[];
      setGroups(groupsList);

      if (groupsList.length > 0) {
        const groupIds = groupsList.map(g => g.id);
        const { data: links } = await supabase.from("registration_links").select("token, student_group_id").in("student_group_id", groupIds);
        const linksMap: Record<string, string> = {};
        for (const l of (links as any[] || [])) { if (l.student_group_id) linksMap[l.student_group_id] = `${window.location.origin}/join/${l.token}`; }
        setGroupLinks(linksMap);

        const { data: profiles } = await supabase.from("profiles").select("user_id, student_group_id").eq("organization_id", organizationId).not("student_group_id", "is", null);
        const counts: Record<string, number> = {};
        const usersByGroup: Record<string, string[]> = {};
        for (const p of (profiles as any[]) || []) { const gid = p.student_group_id; counts[gid] = (counts[gid] || 0) + 1; if (!usersByGroup[gid]) usersByGroup[gid] = []; usersByGroup[gid].push(p.user_id); }
        setGroupStudentCounts(counts);

        const allUserIds = (profiles as any[] || []).map((p: any) => p.user_id);
        if (allUserIds.length > 0) {
          const { data: enrollments } = await supabase.from("enrollments").select("user_id").eq("course_id", courseId).in("user_id", allUserIds);
          const enrolledSet = new Set((enrollments || []).map((e: any) => e.user_id));
          const eCounts: Record<string, number> = {};
          for (const [gid, users] of Object.entries(usersByGroup)) { eCounts[gid] = users.filter(uid => enrolledSet.has(uid)).length; }
          setEnrolledCounts(eCounts);
        }
      }
    } catch (e) { console.error("Error loading groups:", e); }
    finally { setLoading(false); }
  }, [organizationId, courseId]);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) { toast.error("Введите название группы"); return; }
    setIsCreating(true);
    try {
      const startDate = newGroupStartDate ? format(newGroupStartDate, "yyyy-MM-dd") : null;
      const endDate = newGroupEndDate ? format(newGroupEndDate, "yyyy-MM-dd") : null;
      const { data: groupData, error } = await supabase.from("student_groups").insert({ name: newGroupName.trim(), color: newGroupColor, organization_id: organizationId, course_id: courseId, start_date: startDate, end_date: endDate } as any).select("id").single();
      if (error) throw error;
      const groupId = (groupData as any).id;
      const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
      const { error: linkError } = await supabase.from("registration_links").insert({ organization_id: organizationId, course_id: courseId, token, name: `Группа: ${newGroupName.trim()}`, student_group_id: groupId, expires_at: endDate ? new Date(endDate + "T23:59:59").toISOString() : null } as any);
      if (linkError) {
        let rollbackError: unknown = null;
        try {
          const { data: deletedGroups, error } = await supabase
            .from("student_groups")
            .delete()
            .eq("id", groupId)
            .eq("organization_id", organizationId)
            .select("id");
          const deletedRows = (deletedGroups as { id: string }[] | null) ?? [];
          rollbackError = error || (deletedRows.length === 1 && deletedRows[0].id === groupId
            ? null
            : new Error(`Expected to roll back group ${groupId}, deleted ${deletedRows.length} rows`));
        } catch (error) {
          rollbackError = error;
        }

        if (rollbackError) {
          console.error("Registration link creation and group rollback both failed", { linkError, rollbackError });
          toast.warning("Группа создана без ссылки регистрации. Удалите её и повторите создание");
          setShowCreateDialog(false); setNewGroupName(""); setNewGroupColor(GROUP_COLORS[0]); setNewGroupStartDate(undefined); setNewGroupEndDate(undefined);
          await loadGroups();
          onGroupDirectoryChanged?.();
          return;
        }

        throw linkError;
      }

      let linkCopied = true;
      try {
        await navigator.clipboard.writeText(`${window.location.origin}/join/${token}`);
      } catch (clipboardError) {
        linkCopied = false;
        console.warn("Group created, but its registration link could not be copied", clipboardError);
      }

      toast.success(linkCopied
        ? "Группа создана, ссылка скопирована"
        : "Группа создана. Ссылку можно скопировать в списке групп");
      setShowCreateDialog(false); setNewGroupName(""); setNewGroupColor(GROUP_COLORS[0]); setNewGroupStartDate(undefined); setNewGroupEndDate(undefined);
      await loadGroups();
      onGroupDirectoryChanged?.();
    } catch { toast.error("Ошибка создания группы"); }
    finally { setIsCreating(false); }
  };

  const handleEnrollGroup = async (groupId: string) => {
    setEnrollingGroupId(groupId);
    try {
      const { data: profiles } = await supabase.from("profiles").select("user_id").eq("organization_id", organizationId).eq("student_group_id", groupId);
      const userIds = (profiles as any[] || []).map((p: any) => p.user_id);
      if (userIds.length === 0) { const group = groups.find(g => g.id === groupId); if (group) handleOpenAddStudents(group); return; }
      const { data: existing } = await supabase.from("enrollments").select("user_id").eq("course_id", courseId).in("user_id", userIds);
      const existingSet = new Set((existing || []).map((e: any) => e.user_id));
      const toEnroll = userIds.filter((uid: string) => !existingSet.has(uid));
      if (toEnroll.length === 0) { toast.info("Все ученики группы уже зачислены на этот курс"); return; }
      const { error } = await supabase.from("enrollments").insert(toEnroll.map((uid: string) => ({ user_id: uid, course_id: courseId, status: "active", progress: 0, time_spent: 0 })));
      if (error) throw error;
      toast.success(`Зачислено ${toEnroll.length} уч. из группы`);
      onEnrollmentChanged?.(); loadGroups();
    } catch { toast.error("Ошибка зачисления группы"); }
    finally { setEnrollingGroupId(null); }
  };

  const handleUpdateDate = async (groupId: string, field: "start_date" | "end_date", date: Date | undefined) => {
    try {
      const value = date ? format(date, "yyyy-MM-dd") : null;
      const { error } = await supabase.from("student_groups").update({ [field]: value } as any).eq("id", groupId);
      if (error) throw error;
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, [field]: value } : g));
      toast.success("Дата обновлена");
      onGroupDirectoryChanged?.();
    } catch { toast.error("Ошибка обновления даты"); }
  };

  const handleCopyLink = async (groupId: string) => {
    const link = groupLinks[groupId];
    if (link) { await navigator.clipboard.writeText(link); toast.success("Ссылка скопирована"); }
  };

  const handleOpenAddStudents = async (group: StudentGroup) => {
    setSelectedGroupForAdd(group); setSelectedStudentIds(new Set()); setShowAddStudentsDialog(true); setLoadingStudents(true);
    try {
      const { data } = await supabase.from("profiles").select("user_id, full_name, email").eq("organization_id", organizationId).is("student_group_id", null);
      setUnassignedStudents((data as any[] || []).map((p: any) => ({ user_id: p.user_id, full_name: p.full_name, email: p.email })));
    } catch { toast.error("Ошибка загрузки учеников"); }
    finally { setLoadingStudents(false); }
  };

  const handleAddStudentsToGroup = async () => {
    if (!selectedGroupForAdd || selectedStudentIds.size === 0) return;
    setAddingStudents(true);
    try {
      const userIds = Array.from(selectedStudentIds);
      const { data: updatedProfiles, error: updateError } = await supabase
        .from("profiles")
        .update({ student_group_id: selectedGroupForAdd.id } as any)
        .eq("organization_id", organizationId)
        .in("user_id", userIds)
        .select("user_id");
      if (updateError) throw updateError;

      const updatedCount = (updatedProfiles as { user_id: string }[] | null)?.length ?? 0;
      if (updatedCount !== userIds.length) {
        throw new Error(`Updated ${updatedCount} of ${userIds.length} student profiles`);
      }

      toast.success(`${userIds.length} уч. добавлено в группу`);
      setShowAddStudentsDialog(false); await loadGroups(); onGroupingChanged?.();
    } catch { toast.error("Ошибка добавления учеников"); }
    finally { setAddingStudents(false); }
  };

  const toggleStudent = (uid: string) => { setSelectedStudentIds(prev => { const next = new Set(prev); if (next.has(uid)) next.delete(uid); else next.add(uid); return next; }); };

  const handleCreateStudentInGroup = async () => {
    if (!selectedGroupForAdd || !newStudentName.trim()) return;
    setCreatingStudent(true);
    try {
      const { data, error } = await supabase.functions.invoke("register-student", { body: { full_name: newStudentName.trim(), email: newStudentEmail.trim() || undefined, organization_id: organizationId, student_group_id: selectedGroupForAdd.id } });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success(data?.message || "Ученик создан и добавлен в группу");
      setNewStudentName(""); setNewStudentEmail(""); setShowNewStudentForm(false);
      handleOpenAddStudents(selectedGroupForAdd); loadGroups(); onStudentPopulationChanged?.();
    } catch (err: any) { toast.error("Ошибка создания ученика: " + (err.message || "")); }
    finally { setCreatingStudent(false); }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      // Отвязываем учеников от группы
      await supabase.from("profiles").update({ student_group_id: null } as any).eq("student_group_id", groupId);
      // Удаляем ссылки регистрации
      await supabase.from("registration_links").delete().eq("student_group_id", groupId);
      const { error } = await supabase.from("student_groups").delete().eq("id", groupId);
      if (error) throw error;
      setGroups(prev => prev.filter(g => g.id !== groupId));
      toast.success("Группа удалена");
      onGroupingChanged?.();
      onGroupDirectoryChanged?.();
    } catch (err: any) {
      toast.error("Ошибка удаления группы: " + (err.message || ""));
    }
  };

  return {
    groups, loading, enrollingGroupId, groupStudentCounts, enrolledCounts, groupLinks,
    showAddStudentsDialog, setShowAddStudentsDialog, selectedGroupForAdd, unassignedStudents,
    selectedStudentIds, loadingStudents, addingStudents,
    showCreateDialog, setShowCreateDialog, newGroupName, setNewGroupName, newGroupColor, setNewGroupColor,
    newGroupStartDate, setNewGroupStartDate, newGroupEndDate, setNewGroupEndDate, isCreating,
    showNewStudentForm, setShowNewStudentForm, newStudentName, setNewStudentName, newStudentEmail, setNewStudentEmail, creatingStudent,
    handleCreateGroup, handleEnrollGroup, handleUpdateDate, handleCopyLink, handleOpenAddStudents,
    handleAddStudentsToGroup, toggleStudent, handleCreateStudentInGroup, handleDeleteGroup,
  };
}
