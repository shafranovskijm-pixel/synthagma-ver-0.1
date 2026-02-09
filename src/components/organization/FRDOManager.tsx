import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FileSpreadsheet,
  Download,
  Search,
  Loader2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Users,
  Filter,
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import * as XLSX from "xlsx";
import { FRDOExportDialog } from "./FRDOExportDialog";
import {
  detectGenderFromMiddleName,
  generateDocumentNumber,
  generateRegNumber,
} from "@/constants/frdo";

interface FRDOManagerProps {
  organizationId: string;
}

interface Student {
  user_id: string;
  name: string;
  email: string;
  course?: string | null;
  course_id?: string | null;
}

interface FRDOData {
  user_id: string;
  last_name: string;
  first_name: string;
  middle_name: string;
  birth_date: string;
  gender: string;
  snils: string;
  citizenship_code: string;
  education_level: string;
  education_doc_last_name: string;
  education_doc_series: string;
  education_doc_number: string;
  training_form: string;
  financing_source: string;
  education_form: string;
  professional_area: string;
  specialty_group: string;
  qualification_name: string;
  profession_name: string;
  qualification_rank: string;
}

interface EnrollmentData {
  user_id: string;
  course_id: string;
  course_title: string;
  started_at: string;
  completed_at: string | null;
  time_spent: number;
  duration: string | null;
}

interface Course {
  id: string;
  title: string;
  frdo_program_type?: string | null;
  frdo_document_type?: string | null;
  frdo_professional_area?: string | null;
  frdo_specialty_group?: string | null;
  frdo_qualification_name?: string | null;
  frdo_profession_name?: string | null;
  frdo_qualification_rank?: string | null;
}

interface CourseFRDOSettings {
  frdo_program_type?: string | null;
  frdo_document_type?: string | null;
  frdo_professional_area?: string | null;
  frdo_specialty_group?: string | null;
  frdo_qualification_name?: string | null;
  frdo_profession_name?: string | null;
  frdo_qualification_rank?: string | null;
}

type FRDOStatus = "all" | "complete" | "incomplete" | "empty";

export function FRDOManager({ organizationId }: FRDOManagerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [frdoDataMap, setFrdoDataMap] = useState<Map<string, FRDOData>>(new Map());
  const [enrollmentsMap, setEnrollmentsMap] = useState<Map<string, EnrollmentData[]>>(new Map());
  const [courses, setCourses] = useState<Course[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FRDOStatus>("all");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  
  // Single student export dialog
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedStudentForExport, setSelectedStudentForExport] = useState<Student | null>(null);
  const [selectedEnrollmentForExport, setSelectedEnrollmentForExport] = useState<EnrollmentData | null>(null);

  const requiredFields = [
    { key: "last_name", label: "Фамилия" },
    { key: "first_name", label: "Имя" },
    { key: "birth_date", label: "Дата рождения" },
    { key: "gender", label: "Пол" },
    { key: "snils", label: "СНИЛС" },
  ];

  useEffect(() => {
    loadData();
  }, [organizationId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Fetch students
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .eq("organization_id", organizationId);

      if (profilesError) throw profilesError;

      // Fetch enrollments
      const userIds = profilesData?.map(p => p.user_id) || [];
      
      if (userIds.length === 0) {
        setStudents([]);
        setIsLoading(false);
        return;
      }

      // Filter out organization and admin users - they are not students
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds)
        .in("role", ["organization", "admin"]);

      const orgAdminUserIds = new Set((rolesData || []).map(r => r.user_id));
      const studentUserIds = userIds.filter(id => !orgAdminUserIds.has(id));
      const studentProfiles = (profilesData || []).filter(p => !orgAdminUserIds.has(p.user_id));

      if (studentUserIds.length === 0) {
        setStudents([]);
        setIsLoading(false);
        return;
      }

      const { data: enrollmentsData } = await supabase
        .from("enrollments")
        .select("user_id, course_id, started_at, completed_at, time_spent, courses(id, title, duration, frdo_program_type, frdo_document_type, frdo_professional_area, frdo_specialty_group, frdo_qualification_name, frdo_profession_name, frdo_qualification_rank)")
        .in("user_id", studentUserIds);

      // Build enrollments map and courses list
      const enrollMap = new Map<string, EnrollmentData[]>();
      const courseSet = new Map<string, Course>();

      for (const e of enrollmentsData || []) {
        const courseData = e.courses as { 
          id: string; 
          title: string; 
          duration: string | null;
          frdo_program_type?: string | null;
          frdo_document_type?: string | null;
          frdo_professional_area?: string | null;
          frdo_specialty_group?: string | null;
          frdo_qualification_name?: string | null;
          frdo_profession_name?: string | null;
          frdo_qualification_rank?: string | null;
        } | null;
        const enrollment: EnrollmentData = {
          user_id: e.user_id,
          course_id: e.course_id,
          course_title: courseData?.title || "Неизвестный курс",
          started_at: e.started_at,
          completed_at: e.completed_at,
          time_spent: e.time_spent || 0,
          duration: courseData?.duration || null,
        };

        if (!enrollMap.has(e.user_id)) {
          enrollMap.set(e.user_id, []);
        }
        enrollMap.get(e.user_id)!.push(enrollment);

        if (courseData && !courseSet.has(courseData.id)) {
          courseSet.set(courseData.id, {
            id: courseData.id,
            title: courseData.title,
            frdo_program_type: courseData.frdo_program_type,
            frdo_document_type: courseData.frdo_document_type,
            frdo_professional_area: courseData.frdo_professional_area,
            frdo_specialty_group: courseData.frdo_specialty_group,
            frdo_qualification_name: courseData.frdo_qualification_name,
            frdo_profession_name: courseData.frdo_profession_name,
            frdo_qualification_rank: courseData.frdo_qualification_rank,
          });
        }
      }

      setEnrollmentsMap(enrollMap);
      setCourses(Array.from(courseSet.values()));

      // Build students list (only from filtered student profiles)
      const studentsList: Student[] = studentProfiles.map(p => ({
        user_id: p.user_id,
        name: p.full_name || "Без имени",
        email: p.email || "",
        course: enrollMap.get(p.user_id)?.[0]?.course_title || null,
        course_id: enrollMap.get(p.user_id)?.[0]?.course_id || null,
      }));

      setStudents(studentsList);

      // Fetch FRDO data
      const { data: frdoData } = await supabase
        .from("student_frdo_data")
        .select("*")
        .eq("organization_id", organizationId)
        .in("user_id", studentUserIds);

      const dataMap = new Map<string, FRDOData>();
      for (const data of frdoData || []) {
        dataMap.set(data.user_id, {
          user_id: data.user_id,
          last_name: data.last_name || "",
          first_name: data.first_name || "",
          middle_name: data.middle_name || "",
          birth_date: data.birth_date || "",
          gender: data.gender || detectGenderFromMiddleName(data.middle_name) || "",
          snils: data.snils || "",
          citizenship_code: data.citizenship_code || "643",
          education_level: data.education_level || "",
          education_doc_last_name: data.education_doc_last_name || "",
          education_doc_series: data.education_doc_series || "",
          education_doc_number: data.education_doc_number || "",
          training_form: data.training_form || "Очная",
          financing_source: data.financing_source || "Платное обучение",
          education_form: data.education_form || "в образовательной организации",
          professional_area: data.professional_area || "",
          specialty_group: data.specialty_group || "",
          qualification_name: data.qualification_name || "",
          profession_name: data.profession_name || "",
          qualification_rank: data.qualification_rank || "",
        });
      }

      setFrdoDataMap(dataMap);
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Ошибка загрузки данных");
    } finally {
      setIsLoading(false);
    }
  };

  const getFrdoStatus = (userId: string): { status: FRDOStatus; missingFields: string[] } => {
    const data = frdoDataMap.get(userId);
    if (!data) {
      return { status: "empty", missingFields: requiredFields.map(f => f.label) };
    }

    const missing: string[] = [];
    for (const field of requiredFields) {
      if (!data[field.key as keyof FRDOData]) {
        missing.push(field.label);
      }
    }

    if (missing.length === 0) {
      return { status: "complete", missingFields: [] };
    }

    return { status: "incomplete", missingFields: missing };
  };

  const filteredStudents = students.filter(student => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!student.name.toLowerCase().includes(query) && 
          !student.email.toLowerCase().includes(query)) {
        return false;
      }
    }

    // Status filter
    if (statusFilter !== "all") {
      const { status } = getFrdoStatus(student.user_id);
      if (status !== statusFilter) return false;
    }

    // Course filter
    if (courseFilter !== "all") {
      const enrollments = enrollmentsMap.get(student.user_id) || [];
      if (!enrollments.some(e => e.course_id === courseFilter)) return false;
    }

    return true;
  });

  const toggleStudentSelection = (userId: string) => {
    const newSet = new Set(selectedStudents);
    if (newSet.has(userId)) {
      newSet.delete(userId);
    } else {
      newSet.add(userId);
    }
    setSelectedStudents(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedStudents.size === filteredStudents.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(filteredStudents.map(s => s.user_id)));
    }
  };

  const formatDateForExport = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      return format(new Date(dateStr), "M/d/yy");
    } catch {
      return dateStr;
    }
  };

  const handleBulkExport = async (exportType: "dpo" | "po") => {
    if (selectedStudents.size === 0) {
      toast.error("Выберите студентов для экспорта");
      return;
    }

    setIsExporting(true);

    try {
      // Get current year doc count for auto-numbering
      const year = new Date().getFullYear();
      const { count: baseCount } = await supabase
        .from("education_document_records")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("created_at", `${year}-01-01`);
      
      let docCounter = baseCount || 0;
      const rows: Record<string, unknown>[] = [];

      for (const userId of selectedStudents) {
        const student = students.find(s => s.user_id === userId);
        const frdoData = frdoDataMap.get(userId);
        if (!student) continue;

        // If no FRDO data, create from name
        const data: FRDOData = frdoData || {
          user_id: userId,
          last_name: student.name.split(" ")[0] || "",
          first_name: student.name.split(" ")[1] || "",
          middle_name: student.name.split(" ")[2] || "",
          birth_date: "",
          gender: "",
          snils: "",
          citizenship_code: "643",
          education_level: "",
          education_doc_last_name: "",
          education_doc_series: "",
          education_doc_number: "",
          training_form: "Очная",
          financing_source: "Платное обучение",
          education_form: "в образовательной организации",
          professional_area: "",
          specialty_group: "",
          qualification_name: "",
          profession_name: "",
          qualification_rank: "",
        };

        const enrollments = enrollmentsMap.get(userId) || [];
        const filteredEnrollments = courseFilter === "all" 
          ? enrollments 
          : enrollments.filter(e => e.course_id === courseFilter);

        if (filteredEnrollments.length === 0) {
          // Add one row without course data
          const docNum = generateDocumentNumber(docCounter);
          const regNum = generateRegNumber(docCounter);
          docCounter++;
          if (exportType === "dpo") {
            rows.push(createDPORow(data, null, null, docNum, regNum));
          } else {
            rows.push(createPORow(data, null, null, docNum, regNum));
          }
        } else {
          for (const enrollment of filteredEnrollments) {
            const courseSettings = courses.find(c => c.id === enrollment.course_id) || null;
            const docNum = generateDocumentNumber(docCounter);
            const regNum = generateRegNumber(docCounter);
            docCounter++;

            // Create journal record
            const documentType = exportType === "dpo"
              ? (courseSettings?.frdo_document_type || "Удостоверение о повышении квалификации")
              : (courseSettings?.frdo_document_type || "Свидетельство о профессии рабочего, должности служащего");

            await supabase.from("education_document_records").insert({
              organization_id: organizationId,
              full_name: `${data.last_name} ${data.first_name} ${data.middle_name}`.trim(),
              document_type: documentType,
              document_number: docNum,
              reg_number: regNum,
              issue_date: enrollment.completed_at || new Date().toISOString(),
              specialty_name: enrollment.course_title,
              document_status: "Оригинал",
            });

            if (exportType === "dpo") {
              rows.push(createDPORow(data, enrollment, courseSettings, docNum, regNum));
            } else {
              rows.push(createPORow(data, enrollment, courseSettings, docNum, regNum));
            }
          }
        }
      }

      if (rows.length === 0) {
        toast.error("Нет данных для экспорта");
        setIsExporting(false);
        return;
      }

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "ФИС ФРДО");

      const filename = `ФИС_ФРДО_${exportType.toUpperCase()}_${format(new Date(), "dd-MM-yyyy")}.xlsx`;
      XLSX.writeFile(wb, filename);

      toast.success(`Экспортировано ${rows.length} записей`);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Ошибка экспорта");
    } finally {
      setIsExporting(false);
    }
  };

  const createDPORow = (data: FRDOData, enrollment: EnrollmentData | null, courseSettings: Course | null) => {
    const startYear = enrollment?.started_at ? new Date(enrollment.started_at).getFullYear() : "";
    const endYear = enrollment?.completed_at ? new Date(enrollment.completed_at).getFullYear() : startYear;
    const durationHours = enrollment?.duration 
      ? parseInt(enrollment.duration.replace(/\D/g, "")) || 0 
      : Math.round((enrollment?.time_spent || 0) / 3600);

    // Use course FRDO settings as fallback
    const professionalArea = data.professional_area || courseSettings?.frdo_professional_area || "";
    const specialtyGroup = data.specialty_group || courseSettings?.frdo_specialty_group || "";
    const qualificationName = data.qualification_name || courseSettings?.frdo_qualification_name || "нет";
    const documentType = courseSettings?.frdo_document_type || "Удостоверение о повышении квалификации";
    const programType = courseSettings?.frdo_program_type === "professional_retraining" 
      ? "Профессиональная переподготовка" 
      : "Повышение квалификации";

    return {
      "Вид документа": documentType,
      "Статус документа": "Оригинал",
      "Подтверждение утраты": "Нет",
      "Подтверждение обмена": "Нет",
      "Подтверждение уничтожения": "Нет",
      "Серия документа": "нет",
      "Номер документа": "",
      "Дата выдачи документа": formatDateForExport(enrollment?.completed_at || ""),
      "Регистрационный номер": "",
      "Дополнительная профессиональная программа": programType,
      "Наименование дополнительной профессиональной программы": enrollment?.course_title || "",
      "Наименование области профессиональной деятельности": professionalArea,
      "Укрупненные группы специальностей": specialtyGroup,
      "Наименование квалификации, профессии, специальности": qualificationName,
      "Уровень образования ВО/СПО": data.education_level,
      "Фамилия указанная в дипломе о ВО или СПО": data.education_doc_last_name,
      "Серия документа о ВО/СПО": data.education_doc_series,
      "Номер документа о ВО/СПО": data.education_doc_number,
      "Год начала обучения": startYear,
      "Год окончания обучения": endYear,
      "Срок обучения, часов": durationHours,
      "Фамилия получателя": data.last_name,
      "Имя получателя": data.first_name,
      "Отчество получателя": data.middle_name,
      "Дата рождения получателя": formatDateForExport(data.birth_date),
      "Пол получателя": data.gender,
      "СНИЛС": data.snils,
      "Форма обучения": data.training_form,
      "Источник финансирования обучения": data.financing_source,
      "Форма получения образования": data.education_form,
      "Гражданство получателя (код ОКСМ)": data.citizenship_code,
    };
  };

  const createPORow = (data: FRDOData, enrollment: EnrollmentData | null, courseSettings: Course | null) => {
    const startYear = enrollment?.started_at ? new Date(enrollment.started_at).getFullYear() : "";
    const endYear = enrollment?.completed_at ? new Date(enrollment.completed_at).getFullYear() : startYear;
    const durationHours = enrollment?.duration 
      ? parseInt(enrollment.duration.replace(/\D/g, "")) || 0 
      : Math.round((enrollment?.time_spent || 0) / 3600);

    // Use course FRDO settings as fallback
    const professionName = data.profession_name || courseSettings?.frdo_profession_name || "";
    const qualificationRank = data.qualification_rank || courseSettings?.frdo_qualification_rank || "";
    const documentType = courseSettings?.frdo_document_type || "Свидетельство о профессии рабочего, должности служащего";

    return {
      "Вид документа": documentType,
      "Статус документа": "Оригинал",
      "Подтверждение утраты": "Нет",
      "Подтверждение обмена": "Нет",
      "Подтверждение уничтожения": "Нет",
      "Серия документа": "Нет",
      "Номер документа": "",
      "Дата выдачи документа": formatDateForExport(enrollment?.completed_at || ""),
      "Регистрационный номер": "",
      "Программа профессионального обучения": "Программа профессиональной подготовки",
      "Наименование программы профессионального обучения": enrollment?.course_title || "",
      "Наименование профессии": professionName,
      "Квалификационный разряд": qualificationRank,
      "Год начала обучения": startYear,
      "Год окончания обучения": endYear,
      "Срок обучения, часов": durationHours,
      "Фамилия получателя": data.last_name,
      "Имя получателя": data.first_name,
      "Отчество получателя": data.middle_name,
      "Дата рождения получателя": formatDateForExport(data.birth_date),
      "Пол получателя": data.gender,
      "СНИЛС": data.snils,
      "Гражданство получателя (код ОКСМ)": data.citizenship_code,
      "Форма обучения": data.training_form,
      "Источник финансирования обучения": data.financing_source,
      "Форма получения образования": data.education_form,
    };
  };

  const openStudentExport = (student: Student) => {
    const enrollments = enrollmentsMap.get(student.user_id) || [];
    setSelectedStudentForExport(student);
    setSelectedEnrollmentForExport(enrollments[0] ? {
      ...enrollments[0],
      course_id: enrollments[0].course_id,
    } as unknown as EnrollmentData : null);
    setShowExportDialog(true);
  };

  // Stats
  const stats = {
    total: students.length,
    complete: students.filter(s => getFrdoStatus(s.user_id).status === "complete").length,
    incomplete: students.filter(s => getFrdoStatus(s.user_id).status === "incomplete").length,
    empty: students.filter(s => getFrdoStatus(s.user_id).status === "empty").length,
  };

  // Missing fields statistics
  const missingFieldsStats = (() => {
    const fieldCounts: Record<string, number> = {};
    for (const field of requiredFields) {
      fieldCounts[field.label] = 0;
    }
    
    for (const student of students) {
      const { missingFields } = getFrdoStatus(student.user_id);
      for (const field of missingFields) {
        if (fieldCounts[field] !== undefined) {
          fieldCounts[field]++;
        }
      }
    }
    
    return Object.entries(fieldCounts)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);
  })();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-semibold">ФИС ФРДО</h2>
          <p className="text-muted-foreground">Управление данными для федерального реестра</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-semibold">{stats.total}</div>
              <div className="text-sm text-muted-foreground">Всего</div>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <div className="text-2xl font-semibold">{stats.complete}</div>
              <div className="text-sm text-muted-foreground">Заполнено</div>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <div className="text-2xl font-semibold">{stats.incomplete}</div>
              <div className="text-sm text-muted-foreground">Частично</div>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <XCircle className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <div className="text-2xl font-semibold">{stats.empty}</div>
              <div className="text-sm text-muted-foreground">Не заполнено</div>
            </div>
          </div>
        </div>
      </div>

      {/* Missing Data Widget */}
      {missingFieldsStats.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-500" />
            Каких данных не хватает
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {missingFieldsStats.map(([field, count]) => (
              <div
                key={field}
                className="flex items-center justify-between p-3 rounded-xl bg-amber-500/5 border border-amber-500/20"
              >
                <span className="text-sm font-medium">{field}</span>
                <span className="text-sm font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-lg">
                  {count}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Количество учеников, у которых отсутствует данное поле
          </p>
        </div>
      )}

      {/* Filters and Actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по имени или email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-xl"
            />
          </div>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as FRDOStatus)}>
            <SelectTrigger className="w-44 rounded-xl">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="complete">Заполнено</SelectItem>
              <SelectItem value="incomplete">Частично</SelectItem>
              <SelectItem value="empty">Не заполнено</SelectItem>
            </SelectContent>
          </Select>

          <Select value={courseFilter} onValueChange={setCourseFilter}>
            <SelectTrigger className="w-48 rounded-xl">
              <SelectValue placeholder="Все курсы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все курсы</SelectItem>
              {courses.map((course) => (
                <SelectItem key={course.id} value={course.id}>
                  {course.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedStudents.size > 0 && (
          <div className="flex items-center gap-2">
            <Button
              onClick={() => handleBulkExport("dpo")}
              className="rounded-xl gap-2"
              disabled={isExporting}
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Экспорт ДПО ({selectedStudents.size})
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleBulkExport("po")}
              className="rounded-xl gap-2"
              disabled={isExporting}
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Экспорт ПО ({selectedStudents.size})
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {filteredStudents.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Нет студентов</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-4 text-sm font-medium text-muted-foreground w-12">
                    <input 
                      type="checkbox" 
                      checked={selectedStudents.size === filteredStudents.length && filteredStudents.length > 0} 
                      onChange={toggleSelectAll} 
                      className="w-4 h-4 rounded" 
                    />
                  </th>
                  <th className="text-left px-4 py-4 text-sm font-medium text-muted-foreground">Студент</th>
                  <th className="text-left px-4 py-4 text-sm font-medium text-muted-foreground">Статус ФРДО</th>
                  <th className="text-left px-4 py-4 text-sm font-medium text-muted-foreground">Курс</th>
                  <th className="text-left px-4 py-4 text-sm font-medium text-muted-foreground">Действия</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => {
                  const { status, missingFields } = getFrdoStatus(student.user_id);
                  const isSelected = selectedStudents.has(student.user_id);

                  return (
                    <tr 
                      key={student.user_id} 
                      className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
                    >
                      <td className="px-4 py-4">
                        <input 
                          type="checkbox" 
                          checked={isSelected} 
                          onChange={() => toggleStudentSelection(student.user_id)} 
                          className="w-4 h-4 rounded" 
                        />
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <div className="font-medium">{student.name}</div>
                          <div className="text-sm text-muted-foreground">{student.email}</div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {status === "complete" ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded flex items-center justify-center bg-green-500/10">
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            </div>
                            <span className="text-sm text-green-600">Заполнено</span>
                          </div>
                        ) : status === "incomplete" ? (
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-6 h-6 rounded flex items-center justify-center bg-amber-500/10" 
                              title={`Не заполнено: ${missingFields.join(", ")}`}
                            >
                              <AlertCircle className="w-4 h-4 text-amber-500" />
                            </div>
                            <span className="text-sm text-amber-600" title={missingFields.join(", ")}>
                              Не хватает: {missingFields.slice(0, 2).join(", ")}
                              {missingFields.length > 2 && ` (+${missingFields.length - 2})`}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded flex items-center justify-center bg-muted">
                              <XCircle className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <span className="text-sm text-muted-foreground">Не заполнено</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        {student.course || <span className="text-muted-foreground italic">Не зачислен</span>}
                      </td>
                      <td className="px-4 py-4">
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg gap-1"
                          onClick={() => openStudentExport(student)}
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                          Редактировать
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Single student export dialog */}
      <FRDOExportDialog
        isOpen={showExportDialog}
        onOpenChange={setShowExportDialog}
        student={selectedStudentForExport ? {
          id: selectedStudentForExport.user_id,
          user_id: selectedStudentForExport.user_id,
          name: selectedStudentForExport.name,
          email: selectedStudentForExport.email,
        } : null}
        organizationId={organizationId}
        enrollment={selectedEnrollmentForExport ? {
          id: selectedEnrollmentForExport.course_id,
          course_id: selectedEnrollmentForExport.course_id,
          course_title: selectedEnrollmentForExport.course_title,
          started_at: selectedEnrollmentForExport.started_at,
          completed_at: selectedEnrollmentForExport.completed_at,
          time_spent: selectedEnrollmentForExport.time_spent,
        } : null}
      />
    </div>
  );
}
