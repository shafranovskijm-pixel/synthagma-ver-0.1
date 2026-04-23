import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { detectGenderFromMiddleName, generateDocumentNumber, generateRegNumber } from "@/constants/frdo";
import { buildDPORow, buildPORow, exportFRDOExcel, formatDateForFRDO } from "@/utils/frdoExcelExport";
import { resolveFRDOFields } from "@/utils/frdoFieldResolver";

interface Student { user_id: string; name: string; email: string; course?: string | null; course_id?: string | null; }
interface FRDOData {
  user_id: string; last_name: string; first_name: string; middle_name: string; birth_date: string;
  gender: string; snils: string; citizenship_code: string; education_level: string;
  education_doc_last_name: string; education_doc_series: string; education_doc_number: string;
  training_form: string; financing_source: string; education_form: string;
  professional_area: string; specialty_group: string; qualification_name: string;
  profession_name: string; qualification_rank: string;
}
interface EnrollmentData { user_id: string; course_id: string; course_title: string; started_at: string; completed_at: string | null; time_spent: number; duration: string | null; }
interface Course {
  id: string; title: string; frdo_program_type?: string | null; frdo_document_type?: string | null;
  frdo_professional_area?: string | null; frdo_specialty_group?: string | null;
  frdo_qualification_name?: string | null; frdo_profession_name?: string | null;
  frdo_qualification_rank?: string | null; frdo_duration_hours?: number | null;
  frdo_financing_source?: string | null; frdo_education_form?: string | null; training_form?: string | null;
}
type FRDOStatus = "all" | "complete" | "incomplete" | "empty";

const REQUIRED_FIELDS = [
  { key: "last_name", label: "Фамилия" }, { key: "first_name", label: "Имя" },
  { key: "birth_date", label: "Дата рождения" }, { key: "gender", label: "Пол" }, { key: "snils", label: "СНИЛС" },
];

export function useFRDOManager(organizationId: string) {
  const [isLoading, setIsLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [frdoDataMap, setFrdoDataMap] = useState<Map<string, FRDOData>>(new Map());
  const [enrollmentsMap, setEnrollmentsMap] = useState<Map<string, EnrollmentData[]>>(new Map());
  const [courses, setCourses] = useState<Course[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FRDOStatus>("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedStudentForExport, setSelectedStudentForExport] = useState<Student | null>(null);
  const [selectedEnrollmentForExport, setSelectedEnrollmentForExport] = useState<EnrollmentData | null>(null);
  const [visibleCount, setVisibleCount] = useState(5);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => { loadData(); }, [organizationId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data: profilesData, error: profilesError } = await supabase.from("profiles").select("user_id, full_name, email").eq("organization_id", organizationId);
      if (profilesError) throw profilesError;
      const userIds = profilesData?.map(p => p.user_id) || [];
      if (userIds.length === 0) { setStudents([]); setIsLoading(false); return; }

      const { data: rolesData } = await supabase.from("user_roles").select("user_id, role").in("user_id", userIds).in("role", ["organization", "admin"]);
      const orgAdminUserIds = new Set((rolesData || []).map(r => r.user_id));
      const studentUserIds = userIds.filter(id => !orgAdminUserIds.has(id));
      const studentProfiles = (profilesData || []).filter(p => !orgAdminUserIds.has(p.user_id));
      if (studentUserIds.length === 0) { setStudents([]); setIsLoading(false); return; }

      const { data: enrollmentsData } = await supabase.from("enrollments").select("user_id, course_id, started_at, completed_at, time_spent, courses(id, title, duration, training_form, frdo_program_type, frdo_document_type, frdo_professional_area, frdo_specialty_group, frdo_qualification_name, frdo_profession_name, frdo_qualification_rank, frdo_duration_hours, frdo_financing_source, frdo_education_form)").in("user_id", studentUserIds);
      const enrollMap = new Map<string, EnrollmentData[]>();
      const courseSet = new Map<string, Course>();
      for (const e of enrollmentsData || []) {
        const cd = e.courses as any;
        const enrollment: EnrollmentData = { user_id: e.user_id, course_id: e.course_id, course_title: cd?.title || "Неизвестный курс", started_at: e.started_at, completed_at: e.completed_at, time_spent: e.time_spent || 0, duration: cd?.duration || null };
        if (!enrollMap.has(e.user_id)) enrollMap.set(e.user_id, []);
        enrollMap.get(e.user_id)!.push(enrollment);
        if (cd && !courseSet.has(cd.id)) courseSet.set(cd.id, cd);
      }
      setEnrollmentsMap(enrollMap);
      setCourses(Array.from(courseSet.values()));
      setStudents(studentProfiles.map(p => ({ user_id: p.user_id, name: p.full_name || "Без имени", email: p.email || "", course: enrollMap.get(p.user_id)?.[0]?.course_title || null, course_id: enrollMap.get(p.user_id)?.[0]?.course_id || null })));

      const { data: frdoData } = await supabase.from("student_frdo_data").select("*").eq("organization_id", organizationId).in("user_id", studentUserIds);
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
      setFrdoDataMap(dataMap);
    } catch (error) { console.error("Error:", error); toast.error("Ошибка загрузки данных"); }
    finally { setIsLoading(false); }
  };

  const getFrdoStatus = (userId: string): { status: FRDOStatus; missingFields: string[] } => {
    const data = frdoDataMap.get(userId);
    if (!data) return { status: "empty", missingFields: REQUIRED_FIELDS.map(f => f.label) };
    const missing: string[] = [];
    for (const field of REQUIRED_FIELDS) { if (!data[field.key as keyof FRDOData]) missing.push(field.label); }
    if (missing.length === 0) return { status: "complete", missingFields: [] };
    return { status: "incomplete", missingFields: missing };
  };

  const filteredStudents = students.filter(student => {
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
    const exportUserIds = selectedStudents.size > 0 ? selectedStudents : new Set(filteredStudents.map(s => s.user_id));
    if (exportUserIds.size === 0) { toast.error("Нет студентов для экспорта"); return; }
    setIsExporting(true);
    try {
      const year = new Date().getFullYear();
      const { count: baseCount } = await supabase.from("education_document_records").select("*", { count: "exact", head: true }).eq("organization_id", organizationId).gte("created_at", `${year}-01-01`);
      let docCounter = baseCount || 0;
      const rows: (string | number)[][] = [];
      for (const userId of exportUserIds) {
        const student = students.find(s => s.user_id === userId);
        const frdoData = frdoDataMap.get(userId);
        if (!student) continue;
        const data: FRDOData = frdoData || { user_id: userId, last_name: student.name.split(" ")[0] || "", first_name: student.name.split(" ")[1] || "", middle_name: student.name.split(" ")[2] || "", birth_date: "", gender: "", snils: "", citizenship_code: "643", education_level: "", education_doc_last_name: "", education_doc_series: "", education_doc_number: "", training_form: "Очная", financing_source: "Платное обучение", education_form: "в образовательной организации", professional_area: "", specialty_group: "", qualification_name: "", profession_name: "", qualification_rank: "" };
        const enrollments = enrollmentsMap.get(userId) || [];
        const filteredEnrollments = courseFilter === "all" ? enrollments : enrollments.filter(e => e.course_id === courseFilter);
        const processEnrollment = (enrollment: EnrollmentData | null) => {
          const courseSettings = enrollment ? courses.find(c => c.id === enrollment.course_id) || null : null;
          const courseLike = courseSettings ? { ...courseSettings, title: enrollment?.course_title || courseSettings.title } : (enrollment ? { title: enrollment.course_title } : null);
          const resolved = resolveFRDOFields(data, courseLike);
          const docNum = generateDocumentNumber(docCounter);
          const regNum = generateRegNumber(docCounter);
          docCounter++;
          const startYear = enrollment?.started_at ? new Date(enrollment.started_at).getFullYear() : "";
          const endYear = enrollment?.completed_at ? new Date(enrollment.completed_at).getFullYear() : startYear;
          const durationHours = courseSettings?.frdo_duration_hours || getDuration(enrollment, courseSettings);
          const documentType = exportType === "dpo" ? (courseSettings?.frdo_document_type || "Удостоверение о повышении квалификации") : (courseSettings?.frdo_document_type || "Свидетельство о профессии рабочего, должности служащего");

          // Hard guard: PO requires non-empty profession name (column L)
          if (exportType === "po" && !resolved.professionName) {
            const studentLabel = `${data.last_name} ${data.first_name}`.trim() || student.name;
            throw new Error(`Не заполнено "Наименование профессии" для ${studentLabel} (курс «${enrollment?.course_title || "—"}»). Укажите его в карточке курса (frdo_profession_name) или у ученика (profession_name).`);
          }

          supabase.from("education_document_records").insert({ organization_id: organizationId, full_name: `${data.last_name} ${data.first_name} ${data.middle_name}`.trim(), document_type: documentType, document_number: docNum, reg_number: regNum, issue_date: enrollment?.completed_at || new Date().toISOString(), specialty_name: enrollment?.course_title || "", document_status: "Оригинал" });
          if (exportType === "dpo") {
            rows.push(buildDPORow({ documentType, docNumber: docNum, regNumber: regNum, issueDate: formatDateForFRDO(enrollment?.completed_at || ""), programType: courseSettings?.frdo_program_type === "professional_retraining" ? "Профессиональная переподготовка" : "Повышение квалификации", programName: enrollment?.course_title || "", professionalArea: resolved.professionalArea, specialtyGroup: resolved.specialtyGroup, qualificationName: resolved.qualificationName, educationLevel: data.education_level, educationDocLastName: data.education_doc_last_name, educationDocSeries: data.education_doc_series, educationDocNumber: data.education_doc_number, startYear, endYear, durationHours, lastName: data.last_name, firstName: data.first_name, middleName: data.middle_name, birthDate: formatDateForFRDO(data.birth_date), gender: resolved.gender, snils: data.snils, trainingForm: resolved.trainingForm, financingSource: resolved.financingSource, educationForm: resolved.educationForm, citizenshipCode: data.citizenship_code }));
          } else {
            rows.push(buildPORow({ documentType, docNumber: docNum, regNumber: regNum, issueDate: formatDateForFRDO(enrollment?.completed_at || ""), programType: "Программа профессиональной подготовки по профессии рабочего, должности служащего", programName: enrollment?.course_title || "", professionName: resolved.professionName, qualificationRank: resolved.qualificationRank, startYear, endYear, durationHours, lastName: data.last_name, firstName: data.first_name, middleName: data.middle_name, birthDate: formatDateForFRDO(data.birth_date), gender: resolved.gender, snils: data.snils, citizenshipCode: data.citizenship_code, trainingForm: resolved.trainingForm, financingSource: resolved.financingSource, educationForm: resolved.educationForm }));
          }
        };
        if (filteredEnrollments.length === 0) processEnrollment(null);
        else filteredEnrollments.forEach(e => processEnrollment(e));
      }
      if (rows.length === 0) { toast.error("Нет данных для экспорта"); setIsExporting(false); return; }
      await exportFRDOExcel(rows, exportType);
      toast.success(`Экспортировано ${rows.length} записей`);
    } catch (error: any) {
      console.error("Export error:", error);
      toast.error(error?.message || "Ошибка экспорта");
    }
    finally { setIsExporting(false); }
  };

  const openStudentExport = (student: Student) => {
    const enrollments = enrollmentsMap.get(student.user_id) || [];
    setSelectedStudentForExport(student);
    setSelectedEnrollmentForExport(enrollments[0] || null);
    setShowExportDialog(true);
  };

  const hasPOCourses = courses.some(c => c.frdo_program_type === "professional_training");
  const stats = {
    total: students.length,
    complete: students.filter(s => getFrdoStatus(s.user_id).status === "complete").length,
    incomplete: students.filter(s => getFrdoStatus(s.user_id).status === "incomplete").length,
    empty: students.filter(s => getFrdoStatus(s.user_id).status === "empty").length,
  };

  const missingFieldsStats = (() => {
    const fieldCounts: Record<string, number> = {};
    for (const field of REQUIRED_FIELDS) fieldCounts[field.label] = 0;
    for (const student of students) { const { missingFields } = getFrdoStatus(student.user_id); for (const f of missingFields) { if (fieldCounts[f] !== undefined) fieldCounts[f]++; } }
    return Object.entries(fieldCounts).filter(([_, c]) => c > 0).sort((a, b) => b[1] - a[1]);
  })();

  const handleLoadMore = (count: number) => setVisibleCount(prev => prev + count);

  const handleUploadSigned = async (file: File) => {
    setIsUploading(true);
    try {
      const filePath = `${organizationId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from("frdo-documents").upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("frdo-documents").getPublicUrl(filePath);
      await supabase.from("frdo_signed_documents").insert({
        organization_id: organizationId,
        uploaded_by: (await supabase.auth.getUser()).data.user?.id,
        file_url: urlData.publicUrl,
        file_name: file.name,
        status: "uploaded",
      });
      toast.success("Файл загружен");
    } catch (error) { console.error(error); toast.error("Ошибка загрузки файла"); }
    finally { setIsUploading(false); }
  };

  const handleSendToAdmin = async () => {
    try {
      const { data: docs } = await supabase.from("frdo_signed_documents").select("*").eq("organization_id", organizationId).eq("status", "uploaded");
      if (!docs || docs.length === 0) { toast.error("Нет загруженных файлов для отправки"); return; }
      const { data: org } = await supabase.from("organizations").select("name").eq("id", organizationId).single();
      for (const doc of docs) {
        await supabase.from("admin_org_messages").insert({
          organization_id: organizationId,
          sender_user_id: (await supabase.auth.getUser()).data.user!.id,
          sender_role: "organization",
          content: `📄 Подписанный документ ФРДО: ${doc.file_name}`,
          attachment_url: doc.file_url,
          attachment_name: doc.file_name,
          attachment_type: "application/octet-stream",
        });
        await supabase.from("frdo_signed_documents").update({ status: "sent", sent_to_admin_at: new Date().toISOString() }).eq("id", doc.id);
      }
      await supabase.from("admin_notifications").insert({
        title: `ФРДО: документы от ${org?.name || "организации"}`,
        message: `Организация отправила ${docs.length} подписанных документов ФРДО`,
        type: "frdo",
        related_entity_id: organizationId,
      });
      toast.success(`Отправлено ${docs.length} документов администратору`);
    } catch (error) { console.error(error); toast.error("Ошибка отправки"); }
  };

  return {
    isLoading, students, courses, searchQuery, setSearchQuery,
    statusFilter, setStatusFilter, courseFilter, setCourseFilter,
    selectedStudents, isExporting, showExportDialog, setShowExportDialog,
    selectedStudentForExport, selectedEnrollmentForExport,
    filteredStudents, getFrdoStatus, toggleStudentSelection, toggleSelectAll,
    handleBulkExport, openStudentExport, hasPOCourses, stats, missingFieldsStats,
    enrollmentsMap, organizationId,
    visibleCount, handleLoadMore, handleUploadSigned, handleSendToAdmin, isUploading,
  };
}
