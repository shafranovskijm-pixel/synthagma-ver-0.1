import { ExistingIssuanceExportDialog } from "./education-issuance/ExistingExportDialog";
import { useEducationIssuanceScope } from "@/hooks/useEducationIssuance";
import { issuanceScopeCurrent, requireIssuanceScope, type EducationIssuanceScope } from "@/lib/educationIssuance/client";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { useState, useEffect, useRef } from "react";
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
import {
  detectGenderFromMiddleName,
  FRDO_TRAINING_FORMS,
  FRDO_FINANCING_SOURCES,
  FRDO_EDUCATION_FORMS,
  FRDO_EDUCATION_LEVELS } from "@/constants/frdo";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { CitizenshipCombobox } from "./CitizenshipCombobox";
import { normalizeRuPhone } from "@/utils/phoneParser";
import { isCurrentOrganizationAccess } from "@/hooks/useDocumentActionPermissions";
import { normalizeIsoDate } from "@/lib/groups/groupSettings";

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
  groupId?: string | null;
  onSaved?: () => void | Promise<void>;
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
  isOpen, onOpenChange, student, organizationId, groupId, enrollment, onSaved }: FRDOExportDialogProps) {
  const permissions = useStaffPermissions();
  const canExport = isCurrentOrganizationAccess(permissions, organizationId) && permissions.can("documents.read");
  const canSave = isCurrentOrganizationAccess(permissions, organizationId) && permissions.can("students.write");
  const capture = useEducationIssuanceScope(organizationId, groupId, JSON.stringify([isOpen,student?.user_id,enrollment?.id]));
  const [formScope,setFormScope] = useState<EducationIssuanceScope|null>(null);
  const formCurrent = !!formScope && issuanceScopeCurrent(formScope);
  const [activeTab, setActiveTab] = useState("personal");
  const [frдоData, setFrdoData] = useState<FRDOData>(defaultFRDOData);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError,setFormError]=useState<string|null>(null);
  const [phone, setPhone] = useState("");
  const birthDateRef = useRef<HTMLInputElement | null>(null);
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
    setFormError(null); setExistingExport(null); setFormScope(null); setFrdoData(defaultFRDOData); setCourseData(null); setPhone("");
    if (isOpen && student && canExport) {
      loadFRDOData();
      if (enrollment?.course_id) loadCourseData(enrollment.course_id);
    }
  }, [isOpen, student?.user_id, enrollment?.id, organizationId, groupId, capture, canExport]);

  const loadFRDOData = async () => {
    if (!student || !canExport) return;
    const scope=capture();
    setIsLoading(true);
    try {
      const [{ data, error }, profileRes] = await Promise.all([
        supabase
          .from("student_frdo_data").select("*")
          .eq("user_id", student.user_id).eq("organization_id", organizationId).maybeSingle(),
        supabase.from("profiles").select("phone").eq("user_id", student.user_id).maybeSingle(),
      ]);
      requireIssuanceScope(scope); if (error) throw error; if (profileRes.error) throw profileRes.error;
      setFormScope(scope);
      setPhone(profileRes.data?.phone || "");

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
        setFrdoData(defaultFRDOData); // Structured identity is entered and reviewed explicitly; never split a display name.
      }
    } catch (error) {
      if(issuanceScopeCurrent(scope))setFormError("Не удалось подтвердить сведения ученика. Обновите данные.");
    } finally {
      if(issuanceScopeCurrent(scope))setIsLoading(false);
    }
  };

  const loadCourseData = async (courseId: string) => {
    try {
      const scope=capture();
      const { data, error } = await supabase.from("courses")
        .select("title, duration, training_form, frdo_program_type, frdo_document_type, frdo_professional_area, frdo_specialty_group, frdo_qualification_name, frdo_profession_name, frdo_qualification_rank, frdo_duration_hours, frdo_financing_source, frdo_education_form")
        .eq("id", courseId).eq("organization_id",organizationId).single();
      requireIssuanceScope(scope); if (error) throw error;
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
    if (!student || !canSave || !formCurrent || isSaving) return;
    const scope=capture();
    setIsSaving(true);
    try {
      const session=await supabase.auth.getSession(); requireIssuanceScope(scope);
      if(session.error || session.data.session?.user.id!==scope.actorId || !session.data.session.access_token) throw Error("Текущий доступ не подтверждён.");
      const authorization="Bearer "+session.data.session.access_token;
      const visibleBirthDate = normalizeIsoDate(birthDateRef.current?.value);
      const birthDate = visibleBirthDate || normalizeIsoDate(frдоData.birth_date);
      const dataToSave = {
        last_name: frдоData.last_name || null, first_name: frдоData.first_name || null,
        middle_name: frдоData.middle_name || null, birth_date: birthDate || null,
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

      const { data: savedResult, error: saveError } = await (supabase as any).rpc("save_student_frdo_data", {
        p_organization_id: organizationId,
        p_user_id: student.user_id,
        p_data: dataToSave,
      }).setHeader("Authorization",authorization);
      requireIssuanceScope(scope); if (saveError) throw saveError;
      const saved = Array.isArray(savedResult) ? savedResult[0] : savedResult;
      if (!saved?.id || saved.user_id!==student.user_id || saved.organization_id!==organizationId) throw new Error("Сервер не подтвердил сохранение данных ФРДО");
      const savedBirthDate = normalizeIsoDate(saved.birth_date);
      if (birthDate && savedBirthDate !== birthDate) {
        throw new Error("Дата рождения не сохранилась. Обновите страницу и повторите.");
      }
      setFrdoData((prev) => ({
        ...prev,
        ...saved,
        birth_date: savedBirthDate,
      }));

      const normalizedPhone = phone.trim() ? (normalizeRuPhone(phone) || phone.trim()) : null;
      const { error: phoneErr } = await supabase
        .from("profiles").update({ phone: normalizedPhone }).eq("user_id", student.user_id).eq("organization_id",organizationId).setHeader("Authorization",authorization);
      requireIssuanceScope(scope);
      if (phoneErr) { toast.error("Сведения ФРДО сохранены, но телефон не обновился. Проверьте телефон отдельно."); return; }

      await onSaved?.();
      toast.success("Данные сохранены и проверены");
    } catch (error) {
      console.error("Error saving FRDO data:", error);
      toast.error("Ошибка сохранения данных");
    } finally {
      setIsSaving(false);
    }
  };

  const [existingExport, setExistingExport] = useState<"dpo" | "po" | null>(null);
  const handleExportDPO = () => { if (canExport && student && enrollment) setExistingExport("dpo"); };
  const handleExportPO = () => { if (canExport && student && enrollment) setExistingExport("po"); };

  const updateField = (field: keyof FRDOData, value: string) => {
    setFrdoData((prev) => ({ ...prev, [field]: value }));
  };

  if (!student) return null;

  return (
    <><Dialog open={isOpen} onOpenChange={open=>{if(!isSaving)onOpenChange(open);}}>
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

        {!canExport ? <p role="alert" className="p-6 text-sm text-muted-foreground">Текущий доступ к сведениям не подтверждён.</p> : formError ? <div role="alert" className="p-6 space-y-3 text-sm"><p>{formError}</p><Button variant="outline" onClick={()=>{setFormError(null);void loadFRDOData();}}>Повторить загрузку</Button></div> : !isLoading && !formCurrent ? <p role="alert" className="p-6 text-sm">Доступ изменился. Закройте окно и откройте его заново для проверки текущих данных.</p> : isLoading ? (
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
                      <Input
                        ref={birthDateRef}
                        type="date"
                        value={frдоData.birth_date}
                        onChange={(e) => updateField("birth_date", e.target.value)}
                      />
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
                      <Label>Телефон</Label>
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 999 123-45-67" inputMode="tel" />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label>Гражданство (ОКСМ)</Label>
                      <CitizenshipCombobox value={frдоData.citizenship_code} onChange={(code) => updateField("citizenship_code", code)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
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
              <Button variant="outline" className="rounded-xl gap-2" onClick={handleSave} disabled={isSaving || !canSave || !formCurrent}>
                {isSaving ? <SigmaSpinner size="sm" /> : <Save className="w-4 h-4" />}
                Сохранить данные
              </Button>
              <div className="flex gap-2">
                <Button className="rounded-xl gap-2" onClick={handleExportDPO} disabled={!canExport || !enrollment}>
                  <Download className="w-4 h-4" />
                  Факты для ДПО
                </Button>
                <Button variant="secondary" className="rounded-xl gap-2" onClick={handleExportPO} disabled={!canExport || !enrollment}>
                  <Download className="w-4 h-4" />
                  Факты для ПО
                </Button>
              </div>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
    {existingExport && enrollment && <ExistingIssuanceExportDialog open onOpenChange={open => { if (!open) setExistingExport(null); }} organizationId={organizationId} groupId={groupId} assignments={[{enrollmentId:enrollment.id,courseId:enrollment.course_id}]} documentType={existingExport} />}
    </>
  );
}
