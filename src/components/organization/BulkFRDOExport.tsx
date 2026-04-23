import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, FileSpreadsheet, AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import {
  buildDPORow,
  buildPORow,
  exportFRDOExcel,
  formatDateForFRDO } from "@/utils/frdoExcelExport";
import { resolveFRDOFields, validateFRDORowSync, type CourseFRDOLike } from "@/utils/frdoFieldResolver";

interface Student {
  id: string;
  user_id: string;
  name: string;
  email: string;
  course_id: string | null;
  course: string | null;
}

interface Course extends CourseFRDOLike {
  id: string;
  title: string;
  duration: string | null;
}

interface BulkFRDOExportProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  selectedStudentIds: Set<string>;
  students: Student[];
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

export function BulkFRDOExport({
  isOpen, onOpenChange, organizationId, selectedStudentIds, students }: BulkFRDOExportProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportType, setExportType] = useState<"dpo" | "po">("dpo");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("all");
  const [courses, setCourses] = useState<Course[]>([]);
  const [frdoDataMap, setFrdoDataMap] = useState<Map<string, FRDOData>>(new Map());
  const [enrollmentsMap, setEnrollmentsMap] = useState<Map<string, EnrollmentData[]>>(new Map());
  const [studentsWithMissingData, setStudentsWithMissingData] = useState<string[]>([]);

  const selectedStudents = students.filter(s => selectedStudentIds.has(s.user_id) || selectedStudentIds.has(s.id));

  useEffect(() => { if (isOpen) loadData(); }, [isOpen]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const userIds = [...new Set(selectedStudents.map(s => s.user_id))];
      const { data: frdoData, error: frdoError } = await supabase
        .from("student_frdo_data").select("*").eq("organization_id", organizationId).in("user_id", userIds);
      if (frdoError) throw frdoError;

      const dataMap = new Map<string, FRDOData>();
      const missing: string[] = [];

      for (const student of selectedStudents) {
        const data = frdoData?.find(d => d.user_id === student.user_id);
        if (data) {
          dataMap.set(student.user_id, {
            user_id: data.user_id,
            last_name: data.last_name || "", first_name: data.first_name || "",
            middle_name: data.middle_name || "", birth_date: data.birth_date || "",
            gender: data.gender || "", snils: data.snils || "",
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
            qualification_rank: data.qualification_rank || "" });
        } else {
          const nameParts = student.name.split(" ");
          dataMap.set(student.user_id, {
            user_id: student.user_id,
            last_name: nameParts[0] || "", first_name: nameParts[1] || "",
            middle_name: nameParts[2] || "", birth_date: "", gender: "", snils: "",
            citizenship_code: "643", education_level: "",
            education_doc_last_name: "", education_doc_series: "", education_doc_number: "",
            training_form: "Очная", financing_source: "Платное обучение",
            education_form: "в образовательной организации",
            professional_area: "", specialty_group: "",
            qualification_name: "", profession_name: "", qualification_rank: "" });
          missing.push(student.name);
        }
      }

      setFrdoDataMap(dataMap);
      setStudentsWithMissingData(missing);

      const { data: enrollmentsData, error: enrollError } = await supabase
        .from("enrollments")
        .select("user_id, course_id, started_at, completed_at, time_spent, courses(title, duration)")
        .in("user_id", userIds);
      if (enrollError) throw enrollError;

      const enrollMap = new Map<string, EnrollmentData[]>();
      const courseSet = new Map<string, Course>();

      for (const e of enrollmentsData || []) {
        const courseData = e.courses as { title: string; duration: string | null } | null;
        const enrollment: EnrollmentData = {
          user_id: e.user_id, course_id: e.course_id,
          course_title: courseData?.title || "Неизвестный курс",
          started_at: e.started_at, completed_at: e.completed_at,
          time_spent: e.time_spent || 0, duration: courseData?.duration || null };
        if (!enrollMap.has(e.user_id)) enrollMap.set(e.user_id, []);
        enrollMap.get(e.user_id)!.push(enrollment);
        if (!courseSet.has(e.course_id)) {
          courseSet.set(e.course_id, { id: e.course_id, title: courseData?.title || "Неизвестный курс", duration: courseData?.duration || null });
        }
      }

      setEnrollmentsMap(enrollMap);
      setCourses(Array.from(courseSet.values()));
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Ошибка загрузки данных");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const rows: (string | number)[][] = [];

      for (const student of selectedStudents) {
        const frdoData = frdoDataMap.get(student.user_id);
        if (!frdoData) continue;

        const enrollments = enrollmentsMap.get(student.user_id) || [];
        const filteredEnrollments = selectedCourseId === "all" ? enrollments : enrollments.filter(e => e.course_id === selectedCourseId);
        if (filteredEnrollments.length === 0) continue;

        for (const enrollment of filteredEnrollments) {
          const startYear = enrollment.started_at ? new Date(enrollment.started_at).getFullYear() : "";
          const endYear = enrollment.completed_at ? new Date(enrollment.completed_at).getFullYear() : startYear;
          const durationHours = enrollment.duration
            ? parseInt(enrollment.duration.replace(/\D/g, "")) || 0
            : Math.round(enrollment.time_spent / 3600);

          if (exportType === "dpo") {
            rows.push(buildDPORow({
              documentType: "Удостоверение о повышении квалификации",
              docNumber: "", regNumber: "",
              issueDate: formatDateForFRDO(enrollment.completed_at || ""),
              programType: "Повышение квалификации",
              programName: enrollment.course_title,
              professionalArea: frdoData.professional_area,
              specialtyGroup: frdoData.specialty_group,
              qualificationName: frdoData.qualification_name || "нет",
              educationLevel: frdoData.education_level,
              educationDocLastName: frdoData.education_doc_last_name,
              educationDocSeries: frdoData.education_doc_series,
              educationDocNumber: frdoData.education_doc_number,
              startYear, endYear, durationHours,
              lastName: frdoData.last_name, firstName: frdoData.first_name, middleName: frdoData.middle_name,
              birthDate: formatDateForFRDO(frdoData.birth_date),
              gender: frdoData.gender, snils: frdoData.snils,
              trainingForm: frdoData.training_form, financingSource: frdoData.financing_source,
              educationForm: frdoData.education_form, citizenshipCode: frdoData.citizenship_code }));
          } else {
            rows.push(buildPORow({
              documentType: "Свидетельство о профессии рабочего, должности служащего",
              docNumber: "", regNumber: "",
              issueDate: formatDateForFRDO(enrollment.completed_at || ""),
              programType: "Программа профессиональной подготовки по профессии рабочего, должности служащего",
              programName: enrollment.course_title,
              professionName: frdoData.profession_name,
              qualificationRank: frdoData.qualification_rank,
              startYear, endYear, durationHours,
              lastName: frdoData.last_name, firstName: frdoData.first_name, middleName: frdoData.middle_name,
              birthDate: formatDateForFRDO(frdoData.birth_date),
              gender: frdoData.gender, snils: frdoData.snils, citizenshipCode: frdoData.citizenship_code,
              trainingForm: frdoData.training_form, financingSource: frdoData.financing_source,
              educationForm: frdoData.education_form }));
          }
        }
      }

      if (rows.length === 0) {
        toast.error("Нет данных для экспорта. Выберите курс или проверьте зачисления студентов.");
        setIsExporting(false);
        return;
      }

      await exportFRDOExcel(rows, exportType);
      toast.success(`Экспортировано ${rows.length} записей`);
      onOpenChange(false);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Ошибка экспорта");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6 text-primary" />
            </div>
            <div>
              <div className="text-xl">Массовый экспорт в ФИС ФРДО</div>
              <div className="text-sm font-normal text-muted-foreground">Выбрано студентов: {selectedStudents.length}</div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <SigmaSpinner size="lg" />
          </div>
        ) : (
          <div className="space-y-6">
            {studentsWithMissingData.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-600">Неполные данные</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      У {studentsWithMissingData.length} студентов нет заполненных данных ФРДО.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Тип документа</Label>
                <Select value={exportType} onValueChange={(v) => setExportType(v as "dpo" | "po")}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dpo">ДПО (повышение квалификации)</SelectItem>
                    <SelectItem value="po">ПО (профессиональное обучение)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Курс</Label>
                <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Все курсы" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все курсы</SelectItem>
                    {courses.map((course) => (
                      <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="bg-muted/50 rounded-xl p-4">
              <h4 className="font-medium mb-3">Выбранные студенты:</h4>
              <ScrollArea className="h-40">
                <div className="space-y-2">
                  {selectedStudents.map((student) => {
                    const frdoData = frdoDataMap.get(student.user_id);
                    const hasRequiredFields = frdoData && frdoData.snils && frdoData.birth_date;
                    return (
                      <div key={student.user_id} className="flex items-center justify-between p-2 rounded-lg bg-background">
                        <div className="flex items-center gap-2">
                          {hasRequiredFields ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <AlertCircle className="w-4 h-4 text-amber-500" />}
                          <span className="text-sm">{student.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{student.course || "Нет курса"}</span>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>Отмена</Button>
              <Button className="rounded-xl gap-2" onClick={handleExport} disabled={isExporting || selectedStudents.length === 0}>
                {isExporting ? <SigmaSpinner size="sm" /> : <Download className="w-4 h-4" />}
                Экспортировать ({selectedStudents.length})
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
