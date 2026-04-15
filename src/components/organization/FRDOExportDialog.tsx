import { useState, useEffect } from "react";
import { formatSnils } from "@/utils/formatSnils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, Save, FileSpreadsheet, User, GraduationCap, Briefcase } from "lucide-react";
import { format } from "date-fns";
import {
  detectGenderFromMiddleName,
  generateDocumentNumber,
  generateRegNumber,
  FRDO_TRAINING_FORMS,
  FRDO_FINANCING_SOURCES,
  FRDO_EDUCATION_FORMS,
  FRDO_EDUCATION_LEVELS } from "@/constants/frdo";
import {
  buildDPORow,
  buildPORow,
  exportFRDOExcel,
  formatDateForFRDO } from "@/utils/frdoExcelExport";

interface FRDOExportDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  student: {
    id: string;
    user_id: string;
    name: string;
    email: string;
  } | null;
  organizationId: string;
  enrollment?: {
    id: string;
    course_title: string;
    started_at: string;
    completed_at?: string | null;
    time_spent: number;
    course_id: string;
  } | null;
}

interface FRDOData {
  id?: string;
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

const defaultFRDOData: FRDOData = {
  last_name: "", first_name: "", middle_name: "",
  birth_date: "", gender: "", snils: "",
  citizenship_code: "643", education_level: "",
  education_doc_last_name: "", education_doc_series: "", education_doc_number: "",
  training_form: "Очная", financing_source: "Платное обучение",
  education_form: "в образовательной организации",
  professional_area: "", specialty_group: "",
  qualification_name: "", profession_name: "", qualification_rank: "" };

export function FRDOExportDialog({
  isOpen, onOpenChange, student, organizationId, enrollment }: FRDOExportDialogProps) {
  const [activeTab, setActiveTab] = useState("personal");
  const [frдоData, setFrdoData] = useState<FRDOData>(defaultFRDOData);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [courseData, setCourseData] = useState<{
    title: string; duration: string | null; training_form?: string | null;
    frdo_program_type?: string | null; frdo_document_type?: string | null;
    frdo_professional_area?: string | null; frdo_specialty_group?: string | null;
    frdo_qualification_name?: string | null; frdo_profession_name?: string | null;
    frdo_qualification_rank?: string | null;
    frdo_duration_hours?: number | null; frdo_financing_source?: string | null;
    frdo_education_form?: string | null;
  } | null>(null);

  useEffect(() => {
    if (isOpen && student) {
      loadFRDOData();
      if (enrollment?.course_id) loadCourseData(enrollment.course_id);
    }
  }, [isOpen, student]);

  const loadFRDOData = async () => {
    if (!student) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("student_frdo_data").select("*")
        .eq("user_id", student.user_id).eq("organization_id", organizationId).maybeSingle();
      if (error) throw error;

      if (data) {
        setFrdoData({
          id: data.id,
          last_name: data.last_name || "", first_name: data.first_name || "",
          middle_name: data.middle_name || "", birth_date: data.birth_date || "",
          gender: data.gender || detectGenderFromMiddleName(data.middle_name) || "",
          snils: data.snils || "", citizenship_code: data.citizenship_code || "643",
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
        const middleName = nameParts[2] || "";
        setFrdoData({
          ...defaultFRDOData,
          last_name: nameParts[0] || "", first_name: nameParts[1] || "",
          middle_name: middleName, gender: detectGenderFromMiddleName(middleName) || "" });
      }
    } catch (error) {
      console.error("Error loading FRDO data:", error);
      toast.error("Ошибка загрузки данных");
    } finally {
      setIsLoading(false);
    }
  };

  const loadCourseData = async (courseId: string) => {
    try {
      const { data, error } = await supabase.from("courses")
        .select("title, duration, training_form, frdo_program_type, frdo_document_type, frdo_professional_area, frdo_specialty_group, frdo_qualification_name, frdo_profession_name, frdo_qualification_rank, frdo_duration_hours, frdo_financing_source, frdo_education_form")
        .eq("id", courseId).single();
      if (error) throw error;
      setCourseData(data);
      if (data) {
        setFrdoData((prev) => ({
          ...prev,
          professional_area: prev.professional_area || data.frdo_professional_area || "",
          specialty_group: prev.specialty_group || data.frdo_specialty_group || "",
          qualification_name: prev.qualification_name || data.frdo_qualification_name || "",
          profession_name: prev.profession_name || data.frdo_profession_name || "",
          qualification_rank: prev.qualification_rank || data.frdo_qualification_rank || "",
          training_form: prev.training_form || data.training_form || "Очная",
          financing_source: prev.financing_source || data.frdo_financing_source || "Платное обучение",
          education_form: prev.education_form || data.frdo_education_form || "в образовательной организации" }));
      }
    } catch (error) {
      console.error("Error loading course data:", error);
    }
  };

  const handleSave = async () => {
    if (!student) return;
    setIsSaving(true);
    try {
      const dataToSave = {
        user_id: student.user_id, organization_id: organizationId,
        last_name: frдоData.last_name || null, first_name: frдоData.first_name || null,
        middle_name: frдоData.middle_name || null, birth_date: frдоData.birth_date || null,
        gender: frдоData.gender || null, snils: frдоData.snils || null,
        citizenship_code: frдоData.citizenship_code || "643",
        education_level: frдоData.education_level || null,
        education_doc_last_name: frдоData.education_doc_last_name || null,
        education_doc_series: frдоData.education_doc_series || null,
        education_doc_number: frдоData.education_doc_number || null,
        training_form: frдоData.training_form || "Очная",
        financing_source: frдоData.financing_source || "Платное обучение",
        education_form: frдоData.education_form || "в образовательной организации",
        professional_area: frдоData.professional_area || null,
        specialty_group: frдоData.specialty_group || null,
        qualification_name: frдоData.qualification_name || null,
        profession_name: frдоData.profession_name || null,
        qualification_rank: frдоData.qualification_rank || null };

      if (frдоData.id) {
        const { error } = await supabase.from("student_frdo_data").update(dataToSave).eq("id", frдоData.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("student_frdo_data").insert(dataToSave).select().single();
        if (error) throw error;
        setFrdoData((prev) => ({ ...prev, id: data.id }));
      }
      toast.success("Данные сохранены");
    } catch (error) {
      console.error("Error saving FRDO data:", error);
      toast.error("Ошибка сохранения данных");
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportDPO = async () => {
    if (!student || !enrollment) { toast.error("Выберите курс для экспорта"); return; }

    const startYear = enrollment.started_at ? new Date(enrollment.started_at).getFullYear() : "";
    const endYear = enrollment.completed_at ? new Date(enrollment.completed_at).getFullYear() : startYear;
    const durationHours = courseData?.frdo_duration_hours
      || (courseData?.duration ? parseInt(courseData.duration.replace(/\D/g, "")) || 0 : 0)
      || Math.round(enrollment.time_spent / 3600);

    const professionalArea = frдоData.professional_area || courseData?.frdo_professional_area || "";
    const specialtyGroup = frдоData.specialty_group || courseData?.frdo_specialty_group || "";
    const qualificationName = frдоData.qualification_name || courseData?.frdo_qualification_name || "нет";
    const documentType = courseData?.frdo_document_type || "Удостоверение о повышении квалификации";
    const programType = courseData?.frdo_program_type === "professional_retraining" ? "Профессиональная переподготовка" : "Повышение квалификации";

    const year = new Date().getFullYear();
    const { count } = await supabase.from("education_document_records")
      .select("*", { count: "exact", head: true }).eq("organization_id", organizationId).gte("created_at", `${year}-01-01`);
    const existingCount = count || 0;
    const docNumber = generateDocumentNumber(existingCount);
    const regNumber = generateRegNumber(existingCount);

    await supabase.from("education_document_records").insert({
      organization_id: organizationId, enrollment_id: enrollment.id,
      full_name: `${frдоData.last_name} ${frдоData.first_name} ${frдоData.middle_name}`.trim(),
      document_type: documentType, document_number: docNumber, reg_number: regNumber,
      issue_date: enrollment.completed_at || new Date().toISOString(),
      specialty_name: courseData?.title || enrollment.course_title,
      qualification_name: qualificationName, document_status: "Оригинал" });

    const row = buildDPORow({
      documentType, docNumber, regNumber,
      issueDate: formatDateForFRDO(enrollment.completed_at || ""),
      programType, programName: courseData?.title || enrollment.course_title,
      professionalArea, specialtyGroup, qualificationName,
      educationLevel: frдоData.education_level,
      educationDocLastName: frдоData.education_doc_last_name,
      educationDocSeries: frдоData.education_doc_series,
      educationDocNumber: frдоData.education_doc_number,
      startYear, endYear, durationHours,
      lastName: frдоData.last_name, firstName: frдоData.first_name, middleName: frдоData.middle_name,
      birthDate: formatDateForFRDO(frдоData.birth_date),
      gender: frдоData.gender, snils: frдоData.snils,
      trainingForm: frдоData.training_form, financingSource: frдоData.financing_source,
      educationForm: frдоData.education_form, citizenshipCode: frдоData.citizenship_code });

    await exportFRDOExcel([row], "dpo", `${frдоData.last_name}_${format(new Date(), "dd-MM-yyyy")}`);
    toast.success("Документ зарегистрирован в журнале");
  };

  const handleExportPO = async () => {
    if (!student || !enrollment) { toast.error("Выберите курс для экспорта"); return; }

    const startYear = enrollment.started_at ? new Date(enrollment.started_at).getFullYear() : "";
    const endYear = enrollment.completed_at ? new Date(enrollment.completed_at).getFullYear() : startYear;
    const durationHours = courseData?.frdo_duration_hours
      || (courseData?.duration ? parseInt(courseData.duration.replace(/\D/g, "")) || 0 : 0)
      || Math.round(enrollment.time_spent / 3600);

    const professionName = frдоData.profession_name || courseData?.frdo_profession_name || "";
    const qualificationRank = frдоData.qualification_rank || courseData?.frdo_qualification_rank || "";
    const documentType = courseData?.frdo_document_type || "Свидетельство о профессии рабочего, должности служащего";

    const year = new Date().getFullYear();
    const { count } = await supabase.from("education_document_records")
      .select("*", { count: "exact", head: true }).eq("organization_id", organizationId).gte("created_at", `${year}-01-01`);
    const existingCount = count || 0;
    const docNumber = generateDocumentNumber(existingCount);
    const regNumber = generateRegNumber(existingCount);

    await supabase.from("education_document_records").insert({
      organization_id: organizationId, enrollment_id: enrollment.id,
      full_name: `${frдоData.last_name} ${frдоData.first_name} ${frдоData.middle_name}`.trim(),
      document_type: documentType, document_number: docNumber, reg_number: regNumber,
      issue_date: enrollment.completed_at || new Date().toISOString(),
      specialty_name: courseData?.title || enrollment.course_title,
      qualification_name: professionName, document_status: "Оригинал" });

    const row = buildPORow({
      documentType, docNumber, regNumber,
      issueDate: formatDateForFRDO(enrollment.completed_at || ""),
      programType: "Программа профессиональной подготовки по профессии рабочего, должности служащего",
      programName: courseData?.title || enrollment.course_title,
      professionName, qualificationRank,
      startYear, endYear, durationHours,
      lastName: frдоData.last_name, firstName: frдоData.first_name, middleName: frдоData.middle_name,
      birthDate: formatDateForFRDO(frдоData.birth_date),
      gender: frдоData.gender, snils: frдоData.snils, citizenshipCode: frдоData.citizenship_code,
      trainingForm: frдоData.training_form, financingSource: frдоData.financing_source,
      educationForm: frдоData.education_form });

    await exportFRDOExcel([row], "po", `${frдоData.last_name}_${format(new Date(), "dd-MM-yyyy")}`);
    toast.success("Документ зарегистрирован в журнале");
  };

  const updateField = (field: keyof FRDOData, value: string) => {
    setFrdoData((prev) => ({ ...prev, [field]: value }));
  };

  if (!student) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="font-display flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6 text-primary" />
            </div>
            <div>
              <div className="text-xl">Экспорт в ФИС ФРДО</div>
              <div className="text-sm font-normal text-muted-foreground">{student.name}</div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <SigmaSpinner size="lg" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
            <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent px-6 h-12">
              <TabsTrigger value="personal" className="rounded-lg data-[state=active]:bg-primary/10 gap-2">
                <User className="w-4 h-4" />
                Личные данные
              </TabsTrigger>
              <TabsTrigger value="education" className="rounded-lg data-[state=active]:bg-primary/10 gap-2">
                <GraduationCap className="w-4 h-4" />
                Образование
              </TabsTrigger>
              <TabsTrigger value="professional" className="rounded-lg data-[state=active]:bg-primary/10 gap-2">
                <Briefcase className="w-4 h-4" />
                Профессия
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[50vh]">
              <div className="p-6 space-y-6">
                <TabsContent value="personal" className="m-0 space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Фамилия</Label>
                      <Input value={frдоData.last_name} onChange={(e) => updateField("last_name", e.target.value)} placeholder="Иванов" />
                    </div>
                    <div className="space-y-2">
                      <Label>Имя</Label>
                      <Input value={frдоData.first_name} onChange={(e) => updateField("first_name", e.target.value)} placeholder="Иван" />
                    </div>
                    <div className="space-y-2">
                      <Label>Отчество</Label>
                      <Input value={frдоData.middle_name} onChange={(e) => updateField("middle_name", e.target.value)} placeholder="Иванович" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Дата рождения</Label>
                      <Input type="date" value={frдоData.birth_date} onChange={(e) => updateField("birth_date", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Пол</Label>
                      <Select value={frдоData.gender} onValueChange={(value) => updateField("gender", value)}>
                        <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Муж">Мужской</SelectItem>
                          <SelectItem value="Жен">Женский</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>СНИЛС</Label>
                      <Input value={frдоData.snils} onChange={(e) => updateField("snils", formatSnils(e.target.value))} placeholder="123-456-789 00" maxLength={14} />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Гражданство (код ОКСМ)</Label>
                      <Input value={frдоData.citizenship_code} onChange={(e) => updateField("citizenship_code", e.target.value)} placeholder="643" />
                    </div>
                    <div className="space-y-2">
                      <Label>Форма обучения</Label>
                      <Select value={frдоData.training_form} onValueChange={(value) => updateField("training_form", value)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FRDO_TRAINING_FORMS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Источник финансирования</Label>
                      <Select value={frдоData.financing_source} onValueChange={(value) => updateField("financing_source", value)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FRDO_FINANCING_SOURCES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Форма получения образования</Label>
                    <Select value={frдоData.education_form} onValueChange={(value) => updateField("education_form", value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FRDO_EDUCATION_FORMS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </TabsContent>

                <TabsContent value="education" className="m-0 space-y-4">
                  <div className="space-y-2">
                    <Label>Уровень образования ВО/СПО</Label>
                    <Select value={frдоData.education_level} onValueChange={(value) => updateField("education_level", value)}>
                      <SelectTrigger><SelectValue placeholder="Выберите уровень образования" /></SelectTrigger>
                      <SelectContent>
                        {FRDO_EDUCATION_LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Фамилия в дипломе о ВО/СПО</Label>
                    <Input value={frдоData.education_doc_last_name} onChange={(e) => updateField("education_doc_last_name", e.target.value)} placeholder="Если изменялась фамилия" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Серия документа о ВО/СПО</Label>
                      <Input value={frдоData.education_doc_series} onChange={(e) => updateField("education_doc_series", e.target.value)} placeholder="АДС" />
                    </div>
                    <div className="space-y-2">
                      <Label>Номер документа о ВО/СПО</Label>
                      <Input value={frдоData.education_doc_number} onChange={(e) => updateField("education_doc_number", e.target.value)} placeholder="1234567" />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="professional" className="m-0 space-y-4">
                  <p className="text-sm text-muted-foreground mb-4">Данные для ДПО (повышение квалификации / профессиональная переподготовка)</p>
                  <div className="space-y-2">
                    <Label>Область профессиональной деятельности</Label>
                    <Input value={frдоData.professional_area} onChange={(e) => updateField("professional_area", e.target.value)} placeholder="Административно-управленческая и офисная деятельность" />
                  </div>
                  <div className="space-y-2">
                    <Label>Укрупненные группы специальностей</Label>
                    <Input value={frдоData.specialty_group} onChange={(e) => updateField("specialty_group", e.target.value)} placeholder="Экономика и управление" />
                  </div>
                  <div className="space-y-2">
                    <Label>Наименование квалификации, профессии, специальности</Label>
                    <Input value={frдоData.qualification_name} onChange={(e) => updateField("qualification_name", e.target.value)} placeholder="специалист отдела кадров" />
                  </div>
                  <div className="border-t border-border pt-4 mt-4">
                    <p className="text-sm text-muted-foreground mb-4">Данные для ПО (профессиональное обучение)</p>
                    <div className="space-y-2">
                      <Label>Наименование профессии рабочего / должности служащего</Label>
                      <Input value={frдоData.profession_name} onChange={(e) => updateField("profession_name", e.target.value)} placeholder="Охранник" />
                    </div>
                    <div className="space-y-2 mt-4">
                      <Label>Квалификационный разряд, класс, категория</Label>
                      <Input value={frдоData.qualification_rank} onChange={(e) => updateField("qualification_rank", e.target.value)} placeholder="4" />
                    </div>
                  </div>
                </TabsContent>
              </div>
            </ScrollArea>

            <div className="p-6 border-t border-border flex items-center justify-between gap-4">
              <Button variant="outline" className="rounded-xl gap-2" onClick={handleSave} disabled={isSaving}>
                {isSaving ? <SigmaSpinner size="sm" /> : <Save className="w-4 h-4" />}
                Сохранить данные
              </Button>
              <div className="flex gap-2">
                <Button className="rounded-xl gap-2" onClick={handleExportDPO} disabled={!enrollment}>
                  <Download className="w-4 h-4" />
                  Экспорт ДПО
                </Button>
                <Button variant="secondary" className="rounded-xl gap-2" onClick={handleExportPO} disabled={!enrollment}>
                  <Download className="w-4 h-4" />
                  Экспорт ПО
                </Button>
              </div>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
