import { useState, useEffect, useRef } from "react";
import { useEducationIssuanceScope } from "@/hooks/useEducationIssuance";
import { issuanceScopeCurrent, requireIssuanceScope, type EducationIssuanceScope } from "@/lib/educationIssuance/client";
import { supabase } from "@/integrations/supabase/client";
import { fetchEffectiveGroupProfiles } from "@/api/studentGroupMemberships";
import { fetchUserRolesBatched } from "@/utils/fetchUserRolesBatched";
import { toast } from "sonner";
import { detectGenderFromMiddleName } from "@/constants/frdo";
import { filterByGroupMembers } from "@/lib/groups/groupContext";
import { FRDO_REQUIRED_FIELDS, resolveFrdoReadiness } from "@/lib/frdo/readiness";
import { isCurrentOrganizationAccess } from "@/hooks/useDocumentActionPermissions";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";

interface Student { user_id: string; name: string; email: string; course?: string | null; course_id?: string | null; }
interface FRDOData {
  user_id: string; last_name: string; first_name: string; middle_name: string; birth_date: string;
  gender: string; snils: string; citizenship_code: string; education_level: string;
  education_doc_last_name: string; education_doc_series: string; education_doc_number: string;
  training_form: string; financing_source: string; education_form: string;
  professional_area: string; specialty_group: string; qualification_name: string;
  profession_name: string; qualification_rank: string;
}
interface EnrollmentData { id: string; user_id: string; course_id: string; course_title: string; started_at: string; completed_at: string | null; time_spent: number; duration: string | null; }
interface Course {
  id: string; title: string; frdo_program_type?: string | null; frdo_document_type?: string | null;
  frdo_professional_area?: string | null; frdo_specialty_group?: string | null;
  frdo_qualification_name?: string | null; frdo_profession_name?: string | null;
  frdo_qualification_rank?: string | null; frdo_duration_hours?: number | null;
  frdo_financing_source?: string | null; frdo_education_form?: string | null; training_form?: string | null;
}
type FRDOStatus = "all" | "complete" | "incomplete" | "empty";

/** Единый список обязательных полей — общий с рабочим пространством группы. */
const REQUIRED_FIELDS = FRDO_REQUIRED_FIELDS;

export interface FRDOGroupContext {
  /** Ограничить список фактическими участниками основной или дополнительной группы. */
  groupId?: string | null;
  /** Курс группы: сразу выставляется в фильтр курса. */
  courseId?: string | null;
}

export function useFRDOManager(organizationId: string, ctx: FRDOGroupContext = {}) {
  const permissions = useStaffPermissions();
  const canExport = isCurrentOrganizationAccess(permissions, organizationId) && permissions.can("documents.read");
  const [existingExport, setExistingExport] = useState<{assignments:{enrollmentId:string;courseId:string}[];documentType:"dpo"|"po"}|null>(null);
  useEffect(() => { setExistingExport(null); }, [organizationId, ctx.groupId, ctx.courseId]);
  const groupId = ctx.groupId || null;
  const contextCourseId = ctx.courseId || null;
  const capture=useEducationIssuanceScope(organizationId,groupId,contextCourseId??"");
  const [dataScope,setDataScope]=useState<EducationIssuanceScope|null>(null);
  const currentData=canExport&&!!dataScope&&issuanceScopeCurrent(dataScope);
  const loadEpoch=useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [frdoDataMap, setFrdoDataMap] = useState<Map<string, FRDOData>>(new Map());
  const [enrollmentsMap, setEnrollmentsMap] = useState<Map<string, EnrollmentData[]>>(new Map());
  const [courses, setCourses] = useState<Course[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FRDOStatus>("all");
  const [courseFilter, setCourseFilter] = useState(contextCourseId || "all");
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedStudentForExport, setSelectedStudentForExport] = useState<Student | null>(null);
  const [selectedEnrollmentForExport, setSelectedEnrollmentForExport] = useState<EnrollmentData | null>(null);
  const [visibleCount, setVisibleCount] = useState(5);
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);

  useEffect(() => { setSelectedStudents(new Set()); setShowExportDialog(false); setExistingExport(null); setDataScope(null); setStudents([]); setCourses([]); setFrdoDataMap(new Map()); setEnrollmentsMap(new Map()); if(canExport)void loadData(); else setIsLoading(false); return()=>{++loadEpoch.current;}; }, [organizationId, groupId, contextCourseId, capture, canExport]);
  useEffect(() => { setCourseFilter(contextCourseId || "all"); }, [contextCourseId]);

  const loadData = async () => {
    if(!canExport)return; const scope=capture(),run=++loadEpoch.current; setDataScope(null);
    setIsLoading(true);
    try {
      const { data: profilesData, error: profilesError } = groupId
        ? { data: await fetchEffectiveGroupProfiles(supabase, organizationId, groupId, { select: "user_id, full_name, email, student_group_id" }), error: null }
        : await supabase.from("profiles").select("user_id, full_name, email, student_group_id").eq("organization_id", organizationId);
      requireIssuanceScope(scope); if(run!==loadEpoch.current)return; if (profilesError) throw profilesError;
      const userIds = profilesData?.map(p => p.user_id) || [];
      setGroupMemberIds(userIds);
      if (userIds.length === 0) { setStudents([]); setIsLoading(false); return; }

      const rolesData = await fetchUserRolesBatched(userIds, ["organization", "admin"]);
      requireIssuanceScope(scope); if(run!==loadEpoch.current)return;
      const orgAdminUserIds = new Set(rolesData.map(r => r.user_id));
      const studentUserIds = userIds.filter(id => !orgAdminUserIds.has(id));
      const studentProfiles = (profilesData || []).filter(p => !orgAdminUserIds.has(p.user_id));
      if (studentUserIds.length === 0) { setStudents([]); setIsLoading(false); return; }

      const { data: enrollmentsData, error: enrollmentError } = await supabase.from("enrollments").select("id, user_id, course_id, started_at, completed_at, time_spent, courses(id, title, duration, training_form, frdo_program_type, frdo_document_type, frdo_professional_area, frdo_specialty_group, frdo_qualification_name, frdo_profession_name, frdo_qualification_rank, frdo_duration_hours, frdo_financing_source, frdo_education_form)").in("user_id", studentUserIds);
      requireIssuanceScope(scope); if(run!==loadEpoch.current)return; if(enrollmentError)throw enrollmentError;
      const enrollMap = new Map<string, EnrollmentData[]>();
      const courseSet = new Map<string, Course>();
      for (const e of enrollmentsData || []) {
        const cd = e.courses as any;
        const enrollment: EnrollmentData = { id: e.id, user_id: e.user_id, course_id: e.course_id, course_title: cd?.title || "Неизвестный курс", started_at: e.started_at, completed_at: e.completed_at, time_spent: e.time_spent || 0, duration: cd?.duration || null };
        if (!enrollMap.has(e.user_id)) enrollMap.set(e.user_id, []);
        enrollMap.get(e.user_id)!.push(enrollment);
        if (cd && !courseSet.has(cd.id)) courseSet.set(cd.id, cd);
      }
      setEnrollmentsMap(enrollMap);
      setCourses(Array.from(courseSet.values()));
      setStudents(studentProfiles.map(p => ({ user_id: p.user_id, name: p.full_name || "Без имени", email: p.email || "", course: enrollMap.get(p.user_id)?.[0]?.course_title || null, course_id: enrollMap.get(p.user_id)?.[0]?.course_id || null })));

      const { data: frdoData, error: frdoError } = await supabase.from("student_frdo_data").select("*").eq("organization_id", organizationId).in("user_id", studentUserIds);
      requireIssuanceScope(scope); if(run!==loadEpoch.current)return; if(frdoError)throw frdoError;
      const dataMap = new Map<string, FRDOData>();
      for (const data of frdoData || []) {
        dataMap.set(data.user_id, {
          user_id: data.user_id, last_name: data.last_name || "", first_name: data.first_name || "",
          middle_name: data.middle_name || "", birth_date: data.birth_date || "",
          gender: data.gender || detectGenderFromMiddleName(data.middle_name) || "",
          snils: data.snils || "", citizenship_code: data.citizenship_code || "643",
          education_level: data.education_level || "", education_doc_last_name: data.education_doc_last_name || "",
          education_doc_series: data.education_doc_series || "", education_doc_number: data.education_doc_number || "",
          training_form: data.training_form || "Очная", financing_source: data.financing_source || "Платное обучение",
          education_form: data.education_form || "в образовательной организации",
          professional_area: data.professional_area || "", specialty_group: data.specialty_group || "",
          qualification_name: data.qualification_name || "", profession_name: data.profession_name || "",
          qualification_rank: data.qualification_rank || "",
        });
      }
      setFrdoDataMap(dataMap); setDataScope(scope);
    } catch (error) { if(run===loadEpoch.current&&issuanceScopeCurrent(scope)){setDataScope(null);toast.error("Не удалось подтвердить сведения ФРДО. Обновите данные.");} }
    finally { if(run===loadEpoch.current)setIsLoading(false); }
  };

  const getFrdoStatus = (userId: string): { status: FRDOStatus; missingFields: string[] } => {
    const data = frdoDataMap.get(userId);
    return resolveFrdoReadiness(data as any);
  };

  // Фильтрация по фактическим участникам группы (не по совпадению курса).
  const scopedStudents = currentData ? filterByGroupMembers(students, groupId ? groupMemberIds : null) : [];

  const filteredStudents = scopedStudents.filter(student => {
    if (searchQuery) { const q = searchQuery.toLowerCase(); if (!student.name.toLowerCase().includes(q) && !student.email.toLowerCase().includes(q)) return false; }
    if (statusFilter !== "all") { const { status } = getFrdoStatus(student.user_id); if (status !== statusFilter) return false; }
    if (courseFilter !== "all") { const enrollments = enrollmentsMap.get(student.user_id) || []; if (!enrollments.some(e => e.course_id === courseFilter)) return false; }
    return true;
  });

  const toggleStudentSelection = (userId: string) => { const s = new Set(selectedStudents); if (s.has(userId)) s.delete(userId); else s.add(userId); setSelectedStudents(s); };
  const toggleSelectAll = () => { if (selectedStudents.size === filteredStudents.length) setSelectedStudents(new Set()); else setSelectedStudents(new Set(filteredStudents.map(s => s.user_id))); };

  const getDuration = (enrollment: EnrollmentData | null, courseSettings: Course | null) => {
    if (!enrollment) return 0;
    if (enrollment.duration) return parseInt(enrollment.duration.replace(/\D/g, "")) || 0;
    return Math.round((enrollment.time_spent || 0) / 3600);
  };

  const handleBulkExport = async (exportType: "dpo" | "po") => {
    if (!canExport || !currentData) return;
    const users = selectedStudents.size ? selectedStudents : new Set(filteredStudents.map(row => row.user_id));
    const assignments = scopedStudents.filter(row => users.has(row.user_id)).flatMap(row =>
      (enrollmentsMap.get(row.user_id) ?? []).filter(enrollment => courseFilter === "all" || enrollment.course_id === courseFilter)
        .map(enrollment => ({ enrollmentId: enrollment.id, courseId: enrollment.course_id })));
    if (!assignments.length || assignments.length > 1000) { toast.error("Выберите от 1 до 1000 точных назначений курса."); return; }
    setExistingExport({ assignments, documentType: exportType });
  };

  const openStudentExport = (student: Student) => {
    const enrollments = enrollmentsMap.get(student.user_id) || [];
    setSelectedStudentForExport(student);
    setSelectedEnrollmentForExport(enrollments[0] || null);
    setShowExportDialog(true);
  };

  const hasPOCourses = courses.some(c => c.frdo_program_type === "professional_training");
  const stats = {
    total: scopedStudents.length,
    complete: scopedStudents.filter(s => getFrdoStatus(s.user_id).status === "complete").length,
    incomplete: scopedStudents.filter(s => getFrdoStatus(s.user_id).status === "incomplete").length,
    empty: scopedStudents.filter(s => getFrdoStatus(s.user_id).status === "empty").length,
  };

  const missingFieldsStats = (() => {
    const fieldCounts: Record<string, number> = {};
    for (const field of REQUIRED_FIELDS) fieldCounts[field.label] = 0;
    for (const student of scopedStudents) { const { missingFields } = getFrdoStatus(student.user_id); for (const f of missingFields) { if (fieldCounts[f] !== undefined) fieldCounts[f]++; } }
    return Object.entries(fieldCounts).filter(([_, c]) => c > 0).sort((a, b) => b[1] - a[1]);
  })();

  const handleLoadMore = (count: number) => setVisibleCount(prev => prev + count);

  return {
    canExport, existingExport, setExistingExport, groupId,
    isLoading, students:scopedStudents, courses:currentData?courses:[], searchQuery, setSearchQuery,
    statusFilter, setStatusFilter, courseFilter, setCourseFilter,
    selectedStudents, isExporting, showExportDialog, setShowExportDialog,
    selectedStudentForExport, selectedEnrollmentForExport,
    filteredStudents, getFrdoStatus, toggleStudentSelection, toggleSelectAll,
    handleBulkExport, openStudentExport, hasPOCourses, stats, missingFieldsStats,
    enrollmentsMap:currentData?enrollmentsMap:new Map<string,EnrollmentData[]>(), organizationId,
    visibleCount, handleLoadMore,
    refresh: loadData,
  };
}
