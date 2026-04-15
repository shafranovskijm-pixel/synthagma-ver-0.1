import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { 
  ChevronLeft, 
  ChevronRight, 
  Building2, 
  Users, 
  GraduationCap, 
  ClipboardCheck,
  Monitor,
  FileText,
  Plus,
  Trash2,
  Sparkles,
  Search,
  CheckCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface CommissionMember {
  fio: string;
  position: string;
}

interface Program {
  name: string;
  type: string;
  studentsCount: number;
}

interface StaffMember {
  fio: string;
  subject: string;
  education: string;
  experienceYears: number;
  employmentType: string;
}

export interface QuizData {
  // Step 1: Organization
  fullName: string;
  shortName: string;
  legalForm: string;
  legalAddress: string;
  phone: string;
  email: string;
  website: string;
  ogrn: string;
  inn: string;
  kpp: string;
  founders: string;
  
  // Step 2: License & Commission
  licenseNumber: string;
  licenseDate: string;
  programTypes: string[];
  periodStart: string;
  periodEnd: string;
  orderNumber: string;
  orderDate: string;
  commissionChairman: CommissionMember;
  commissionMembers: CommissionMember[];
  
  // Step 3: Management
  directorFio: string;
  directorPosition: string;
  directorTermYears: number;
  hasPedagogicalCouncil: boolean;
  pedagogicalCouncilProtocolNumber: string;
  pedagogicalCouncilProtocolDate: string;
  
  // Step 4: Education
  programs: Program[];
  totalStudents: number;
  completedStudents: number;
  
  // Step 5: Quality
  controlTypes: string[];
  testingPlatformName: string;
  testingPlatformUrl: string;
  finalAttestationForm: string;
  hasEmployerParticipation: boolean;
  
  // Step 6: Staff
  staff: StaffMember[];
  
  // Step 7: Infrastructure
  hasWebsite: boolean;
  hasDistancePlatform: boolean;
  hasMultimedia: boolean;
  hasLibrary: boolean;
  additionalEquipment: string;
  
  // Step 8: Notes
  additionalNotes: string;
}

const initialQuizData: QuizData = {
  fullName: "",
  shortName: "",
  legalForm: "Общество с ограниченной ответственностью",
  legalAddress: "",
  phone: "",
  email: "",
  website: "",
  ogrn: "",
  inn: "",
  kpp: "",
  founders: "",
  licenseNumber: "",
  licenseDate: "",
  programTypes: ["дополнительное профессиональное образование"],
  periodStart: "",
  periodEnd: "",
  orderNumber: "",
  orderDate: "",
  commissionChairman: { fio: "", position: "Директор" },
  commissionMembers: [{ fio: "", position: "Преподаватель" }],
  directorFio: "",
  directorPosition: "Директор",
  directorTermYears: 3,
  hasPedagogicalCouncil: true,
  pedagogicalCouncilProtocolNumber: "1",
  pedagogicalCouncilProtocolDate: "",
  programs: [{ name: "", type: "повышение квалификации", studentsCount: 0 }],
  totalStudents: 0,
  completedStudents: 0,
  controlTypes: ["входной", "текущий", "промежуточный", "итоговый"],
  testingPlatformName: "",
  testingPlatformUrl: "",
  finalAttestationForm: "квалификационный экзамен",
  hasEmployerParticipation: true,
  staff: [{ fio: "", subject: "", education: "Высшее профессиональное", experienceYears: 5, employmentType: "По договору" }],
  hasWebsite: true,
  hasDistancePlatform: true,
  hasMultimedia: true,
  hasLibrary: true,
  additionalEquipment: "",
  additionalNotes: "" };

const steps = [
  { id: 1, title: "Организация", icon: Building2, description: "Основные сведения" },
  { id: 2, title: "Лицензия", icon: FileText, description: "Лицензия и комиссия" },
  { id: 3, title: "Управление", icon: Users, description: "Руководство" },
  { id: 4, title: "Образование", icon: GraduationCap, description: "Программы обучения" },
  { id: 5, title: "Качество", icon: ClipboardCheck, description: "Контроль качества" },
  { id: 6, title: "Кадры", icon: Users, description: "Педагогический состав" },
  { id: 7, title: "Инфраструктура", icon: Monitor, description: "Оснащение" },
  { id: 8, title: "Итого", icon: Sparkles, description: "Проверка и отправка" },
];

interface SelfExaminationQuizProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: QuizData) => void;
  isSubmitting: boolean;
  organizationData?: {
    name?: string;
    inn?: string;
    kpp?: string;
    ogrn?: string;
    email?: string;
    phone?: string;
    legal_address?: string;
    director_name?: string;
    director_position?: string;
  };
}

export function SelfExaminationQuiz({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  organizationData }: SelfExaminationQuizProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoadingInn, setIsLoadingInn] = useState(false);
  const [innLoaded, setInnLoaded] = useState(false);
  const [data, setData] = useState<QuizData>(() => ({
    ...initialQuizData,
    fullName: organizationData?.name || "",
    shortName: organizationData?.name || "",
    inn: organizationData?.inn || "",
    kpp: organizationData?.kpp || "",
    ogrn: organizationData?.ogrn || "",
    email: organizationData?.email || "",
    phone: organizationData?.phone || "",
    legalAddress: organizationData?.legal_address || "",
    directorFio: organizationData?.director_name || "",
    directorPosition: organizationData?.director_position || "Директор",
    commissionChairman: { 
      fio: organizationData?.director_name || "", 
      position: organizationData?.director_position || "Директор" 
    },
    periodStart: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    periodEnd: new Date().toISOString().split('T')[0],
    orderDate: new Date().toISOString().split('T')[0],
    orderNumber: `${new Date().getFullYear()}-СО-01`,
    pedagogicalCouncilProtocolDate: new Date().toISOString().split('T')[0] }));

  const loadCompanyByInn = async () => {
    if (!data.inn || data.inn.length < 10) {
      toast.error("Введите корректный ИНН (10 или 12 цифр)");
      return;
    }

    setIsLoadingInn(true);
    try {
      const { data: result, error } = await safeInvoke<any>('dadata-company', {
        body: { inn: data.inn }
      });

      if (error) throw error;

      if (result.success && result.company) {
        const company = result.company;
        
        // Определяем организационно-правовую форму
        let legalForm = "Общество с ограниченной ответственностью";
        if (company.opf) {
          if (company.opf.includes("ИП") || company.type === "INDIVIDUAL") {
            legalForm = "Индивидуальный предприниматель";
          } else if (company.opf.includes("АО") || company.opf.includes("Акционерное")) {
            legalForm = "Акционерное общество";
          } else if (company.opf.includes("АНО") || company.opf.includes("Автономная")) {
            legalForm = "Автономная некоммерческая организация";
          }
        }

        // Форматируем учредителей
        const foundersText = company.founders?.length > 0 
          ? company.founders.join(", ") 
          : data.founders;

        // Форматируем дату лицензии
        let licenseDate = data.licenseDate;
        if (company.license?.issueDate) {
          // DaData возвращает дату в формате timestamp (миллисекунды)
          const date = new Date(company.license.issueDate);
          if (!isNaN(date.getTime())) {
            licenseDate = date.toISOString().split('T')[0];
          }
        }

        updateData({
          fullName: company.fullName || company.name || data.fullName,
          shortName: company.shortName || company.name || data.shortName,
          legalForm,
          legalAddress: company.address || data.legalAddress,
          ogrn: company.ogrn || data.ogrn,
          kpp: company.kpp || data.kpp,
          directorFio: company.management || data.directorFio,
          directorPosition: company.managementPosition || data.directorPosition,
          commissionChairman: {
            fio: company.management || data.commissionChairman.fio,
            position: company.managementPosition || data.commissionChairman.position
          },
          founders: foundersText,
          licenseNumber: company.license?.number || data.licenseNumber,
          licenseDate: licenseDate });

        setInnLoaded(true);
        
        // Формируем сообщение о загруженных данных
        const loadedItems = [];
        if (company.fullName) loadedItems.push("название");
        if (company.address) loadedItems.push("адрес");
        if (company.management) loadedItems.push("руководитель");
        if (company.founders?.length > 0) loadedItems.push("учредители");
        if (company.license?.number) loadedItems.push("лицензия");
        
        toast.success(`Загружено: ${loadedItems.join(", ")}`);
      } else {
        toast.error(result.message || "Компания не найдена");
      }
    } catch (error) {
      console.error("Error loading company by INN:", error);
      toast.error("Ошибка загрузки данных по ИНН");
    } finally {
      setIsLoadingInn(false);
    }
  };

  const updateData = (updates: Partial<QuizData>) => {
    setData(prev => ({ ...prev, ...updates }));
  };

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = () => {
    onSubmit(data);
  };

  const addCommissionMember = () => {
    updateData({
      commissionMembers: [...data.commissionMembers, { fio: "", position: "Преподаватель" }]
    });
  };

  const removeCommissionMember = (index: number) => {
    updateData({
      commissionMembers: data.commissionMembers.filter((_, i) => i !== index)
    });
  };

  const updateCommissionMember = (index: number, field: keyof CommissionMember, value: string) => {
    const updated = [...data.commissionMembers];
    updated[index] = { ...updated[index], [field]: value };
    updateData({ commissionMembers: updated });
  };

  const addProgram = () => {
    updateData({
      programs: [...data.programs, { name: "", type: "повышение квалификации", studentsCount: 0 }]
    });
  };

  const removeProgram = (index: number) => {
    updateData({
      programs: data.programs.filter((_, i) => i !== index)
    });
  };

  const updateProgram = (index: number, field: keyof Program, value: string | number) => {
    const updated = [...data.programs];
    updated[index] = { ...updated[index], [field]: value };
    updateData({ programs: updated });
  };

  const addStaffMember = () => {
    updateData({
      staff: [...data.staff, { fio: "", subject: "", education: "Высшее профессиональное", experienceYears: 5, employmentType: "По договору" }]
    });
  };

  const removeStaffMember = (index: number) => {
    updateData({
      staff: data.staff.filter((_, i) => i !== index)
    });
  };

  const updateStaffMember = (index: number, field: keyof StaffMember, value: string | number) => {
    const updated = [...data.staff];
    updated[index] = { ...updated[index], [field]: value };
    updateData({ staff: updated });
  };

  const toggleControlType = (type: string) => {
    if (data.controlTypes.includes(type)) {
      updateData({ controlTypes: data.controlTypes.filter(t => t !== type) });
    } else {
      updateData({ controlTypes: [...data.controlTypes, type] });
    }
  };

  const toggleProgramType = (type: string) => {
    if (data.programTypes.includes(type)) {
      updateData({ programTypes: data.programTypes.filter(t => t !== type) });
    } else {
      updateData({ programTypes: [...data.programTypes, type] });
    }
  };

  const progress = (currentStep / steps.length) * 100;

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Полное наименование организации *</Label>
                <Input
                  value={data.fullName}
                  onChange={(e) => updateData({ fullName: e.target.value })}
                  placeholder="ООО «Название»"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Сокращённое наименование</Label>
                <Input
                  value={data.shortName}
                  onChange={(e) => updateData({ shortName: e.target.value })}
                  placeholder="ООО «Название»"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Организационно-правовая форма</Label>
                <Select value={data.legalForm} onValueChange={(v) => updateData({ legalForm: v })}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Общество с ограниченной ответственностью">ООО</SelectItem>
                    <SelectItem value="Акционерное общество">АО</SelectItem>
                    <SelectItem value="Индивидуальный предприниматель">ИП</SelectItem>
                    <SelectItem value="Автономная некоммерческая организация">АНО</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Юридический адрес *</Label>
              <Input
                value={data.legalAddress}
                onChange={(e) => updateData({ legalAddress: e.target.value })}
                placeholder="123456, г. Москва, ул. Примерная, д. 1"
                className="rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Телефон</Label>
                <Input
                  value={data.phone}
                  onChange={(e) => updateData({ phone: e.target.value })}
                  placeholder="+7 (XXX) XXX-XX-XX"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={data.email}
                  onChange={(e) => updateData({ email: e.target.value })}
                  placeholder="info@example.ru"
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Адрес сайта</Label>
              <Input
                value={data.website}
                onChange={(e) => updateData({ website: e.target.value })}
                placeholder="https://example.ru"
                className="rounded-xl"
              />
            </div>

            {/* INN с автоподгрузкой */}
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Search className="h-4 w-4" />
                <span>Автозаполнение по ИНН</span>
                {innLoaded && (
                  <span className="flex items-center gap-1 text-green-600 ml-auto">
                    <CheckCircle className="h-4 w-4" />
                    Загружено
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    value={data.inn}
                    onChange={(e) => {
                      updateData({ inn: e.target.value });
                      setInnLoaded(false);
                    }}
                    placeholder="Введите ИНН организации"
                    className="rounded-xl"
                  />
                </div>
                <Button
                  type="button"
                  variant="default"
                  onClick={loadCompanyByInn}
                  disabled={isLoadingInn || !data.inn || data.inn.length < 10}
                  className="rounded-xl"
                >
                  {isLoadingInn ? (
                    <SigmaSpinner size="sm" />
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Найти
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Введите ИНН и нажмите «Найти» для автоматического заполнения реквизитов
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>ОГРН</Label>
                <Input
                  value={data.ogrn}
                  onChange={(e) => updateData({ ogrn: e.target.value })}
                  placeholder="1234567890123"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>ИНН</Label>
                <Input
                  value={data.inn}
                  onChange={(e) => updateData({ inn: e.target.value })}
                  placeholder="1234567890"
                  className="rounded-xl"
                  disabled
                />
              </div>
              <div className="space-y-2">
                <Label>КПП</Label>
                <Input
                  value={data.kpp}
                  onChange={(e) => updateData({ kpp: e.target.value })}
                  placeholder="123456789"
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Учредители (через запятую)</Label>
              <Textarea
                value={data.founders}
                onChange={(e) => updateData({ founders: e.target.value })}
                placeholder="Иванов И.И., Петров П.П."
                className="rounded-xl min-h-[60px]"
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Номер лицензии</Label>
                <Input
                  value={data.licenseNumber}
                  onChange={(e) => updateData({ licenseNumber: e.target.value })}
                  placeholder="Л035-12345-67/00123456"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Дата лицензии</Label>
                <Input
                  type="date"
                  value={data.licenseDate}
                  onChange={(e) => updateData({ licenseDate: e.target.value })}
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Виды программ (в приложении к лицензии)</Label>
              <div className="flex flex-wrap gap-2">
                {["дополнительное профессиональное образование", "профессиональное обучение"].map((type) => (
                  <label key={type} className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2 cursor-pointer">
                    <Checkbox
                      checked={data.programTypes.includes(type)}
                      onCheckedChange={() => toggleProgramType(type)}
                    />
                    <span className="text-sm">{type}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-4 mt-4">
              <h4 className="font-medium mb-4">Период самообследования</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Дата начала *</Label>
                  <Input
                    type="date"
                    value={data.periodStart}
                    onChange={(e) => updateData({ periodStart: e.target.value })}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Дата окончания *</Label>
                  <Input
                    type="date"
                    value={data.periodEnd}
                    onChange={(e) => updateData({ periodEnd: e.target.value })}
                    className="rounded-xl"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                  <Label>Номер приказа</Label>
                  <Input
                    value={data.orderNumber}
                    onChange={(e) => updateData({ orderNumber: e.target.value })}
                    placeholder="2024-СО-01"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Дата приказа</Label>
                  <Input
                    type="date"
                    value={data.orderDate}
                    onChange={(e) => updateData({ orderDate: e.target.value })}
                    className="rounded-xl"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-4 mt-4">
              <h4 className="font-medium mb-4">Состав комиссии</h4>
              <div className="space-y-4">
                <div className="bg-primary/5 rounded-xl p-4">
                  <Label className="text-xs text-muted-foreground">Председатель комиссии</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <Input
                      value={data.commissionChairman.fio}
                      onChange={(e) => updateData({ 
                        commissionChairman: { ...data.commissionChairman, fio: e.target.value }
                      })}
                      placeholder="ФИО"
                      className="rounded-lg"
                    />
                    <Input
                      value={data.commissionChairman.position}
                      onChange={(e) => updateData({ 
                        commissionChairman: { ...data.commissionChairman, position: e.target.value }
                      })}
                      placeholder="Должность"
                      className="rounded-lg"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Члены комиссии</Label>
                  {data.commissionMembers.map((member, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={member.fio}
                        onChange={(e) => updateCommissionMember(index, 'fio', e.target.value)}
                        placeholder="ФИО"
                        className="rounded-lg flex-1"
                      />
                      <Input
                        value={member.position}
                        onChange={(e) => updateCommissionMember(index, 'position', e.target.value)}
                        placeholder="Должность"
                        className="rounded-lg flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeCommissionMember(index)}
                        className="flex-shrink-0 text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addCommissionMember} className="rounded-lg gap-1">
                    <Plus className="w-3 h-3" />
                    Добавить члена
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>ФИО директора *</Label>
                <Input
                  value={data.directorFio}
                  onChange={(e) => updateData({ directorFio: e.target.value })}
                  placeholder="Иванов Иван Иванович"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Должность</Label>
                <Input
                  value={data.directorPosition}
                  onChange={(e) => updateData({ directorPosition: e.target.value })}
                  placeholder="Директор"
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Срок полномочий (лет)</Label>
              <Select 
                value={data.directorTermYears.toString()} 
                onValueChange={(v) => updateData({ directorTermYears: parseInt(v) })}
              >
                <SelectTrigger className="rounded-xl w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 год</SelectItem>
                  <SelectItem value="2">2 года</SelectItem>
                  <SelectItem value="3">3 года</SelectItem>
                  <SelectItem value="5">5 лет</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border-t border-border pt-4 mt-4">
              <div className="flex items-center gap-3 mb-4">
                <Checkbox
                  id="pedagogical-council"
                  checked={data.hasPedagogicalCouncil}
                  onCheckedChange={(checked) => updateData({ hasPedagogicalCouncil: !!checked })}
                />
                <Label htmlFor="pedagogical-council" className="cursor-pointer font-medium">
                  Педагогический совет
                </Label>
              </div>

              {data.hasPedagogicalCouncil && (
                <div className="grid grid-cols-2 gap-4 ml-7">
                  <div className="space-y-2">
                    <Label>Номер протокола</Label>
                    <Input
                      value={data.pedagogicalCouncilProtocolNumber}
                      onChange={(e) => updateData({ pedagogicalCouncilProtocolNumber: e.target.value })}
                      placeholder="1"
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Дата протокола</Label>
                    <Input
                      type="date"
                      value={data.pedagogicalCouncilProtocolDate}
                      onChange={(e) => updateData({ pedagogicalCouncilProtocolDate: e.target.value })}
                      className="rounded-xl"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Образовательные программы</Label>
                <Button variant="outline" size="sm" onClick={addProgram} className="rounded-lg gap-1">
                  <Plus className="w-3 h-3" />
                  Добавить
                </Button>
              </div>
              <div className="space-y-3">
                {data.programs.map((program, index) => (
                  <div key={index} className="bg-secondary/30 rounded-xl p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-2">
                        <Input
                          value={program.name}
                          onChange={(e) => updateProgram(index, 'name', e.target.value)}
                          placeholder="Название программы"
                          className="rounded-lg"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeProgram(index)}
                        className="flex-shrink-0 text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select 
                        value={program.type} 
                        onValueChange={(v) => updateProgram(index, 'type', v)}
                      >
                        <SelectTrigger className="rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="повышение квалификации">Повышение квалификации</SelectItem>
                          <SelectItem value="профессиональная переподготовка">Профессиональная переподготовка</SelectItem>
                          <SelectItem value="профессиональное обучение">Профессиональное обучение</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        value={program.studentsCount || ''}
                        onChange={(e) => updateProgram(index, 'studentsCount', parseInt(e.target.value) || 0)}
                        placeholder="Кол-во обучающихся"
                        className="rounded-lg"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-4 mt-4">
              <h4 className="font-medium mb-4">Статистика обучающихся</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Всего обучающихся за период</Label>
                  <Input
                    type="number"
                    value={data.totalStudents || ''}
                    onChange={(e) => updateData({ totalStudents: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Успешно завершили обучение</Label>
                  <Input
                    type="number"
                    value={data.completedStudents || ''}
                    onChange={(e) => updateData({ completedStudents: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                    className="rounded-xl"
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Виды контроля</Label>
              <div className="grid grid-cols-2 gap-2">
                {["входной", "текущий", "промежуточный", "итоговый"].map((type) => (
                  <label key={type} className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2 cursor-pointer">
                    <Checkbox
                      checked={data.controlTypes.includes(type)}
                      onCheckedChange={() => toggleControlType(type)}
                    />
                    <span className="text-sm capitalize">{type}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-4 mt-4">
              <h4 className="font-medium mb-4">Платформа тестирования</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Название платформы</Label>
                  <Input
                    value={data.testingPlatformName}
                    onChange={(e) => updateData({ testingPlatformName: e.target.value })}
                    placeholder="Образовательная платформа"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>URL платформы</Label>
                  <Input
                    value={data.testingPlatformUrl}
                    onChange={(e) => updateData({ testingPlatformUrl: e.target.value })}
                    placeholder="https://platform.example.ru"
                    className="rounded-xl"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Форма итоговой аттестации</Label>
              <Select value={data.finalAttestationForm} onValueChange={(v) => updateData({ finalAttestationForm: v })}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="квалификационный экзамен">Квалификационный экзамен</SelectItem>
                  <SelectItem value="итоговое тестирование">Итоговое тестирование</SelectItem>
                  <SelectItem value="защита проекта">Защита проекта</SelectItem>
                  <SelectItem value="комплексный экзамен">Комплексный экзамен</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                id="employer-participation"
                checked={data.hasEmployerParticipation}
                onCheckedChange={(checked) => updateData({ hasEmployerParticipation: !!checked })}
              />
              <Label htmlFor="employer-participation" className="cursor-pointer">
                Участие работодателей в оценке качества образования
              </Label>
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Педагогические работники</Label>
              <Button variant="outline" size="sm" onClick={addStaffMember} className="rounded-lg gap-1">
                <Plus className="w-3 h-3" />
                Добавить
              </Button>
            </div>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {data.staff.map((member, index) => (
                <div key={index} className="bg-secondary/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <Input
                        value={member.fio}
                        onChange={(e) => updateStaffMember(index, 'fio', e.target.value)}
                        placeholder="ФИО"
                        className="rounded-lg"
                      />
                      <Input
                        value={member.subject}
                        onChange={(e) => updateStaffMember(index, 'subject', e.target.value)}
                        placeholder="Предмет/дисциплина"
                        className="rounded-lg"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeStaffMember(index)}
                      className="flex-shrink-0 text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Select 
                      value={member.education} 
                      onValueChange={(v) => updateStaffMember(index, 'education', v)}
                    >
                      <SelectTrigger className="rounded-lg text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Высшее профессиональное">Высшее</SelectItem>
                        <SelectItem value="Среднее профессиональное">Среднее проф.</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={member.experienceYears || ''}
                      onChange={(e) => updateStaffMember(index, 'experienceYears', parseInt(e.target.value) || 0)}
                      placeholder="Стаж (лет)"
                      className="rounded-lg"
                    />
                    <Select 
                      value={member.employmentType} 
                      onValueChange={(v) => updateStaffMember(index, 'employmentType', v)}
                    >
                      <SelectTrigger className="rounded-lg text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="По договору">По договору</SelectItem>
                        <SelectItem value="В штате">В штате</SelectItem>
                        <SelectItem value="Совместитель">Совместитель</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 7:
        return (
          <div className="space-y-4">
            <div className="space-y-3">
              <h4 className="font-medium">Материально-техническое обеспечение</h4>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-3 bg-secondary/50 rounded-xl p-4 cursor-pointer">
                  <Checkbox
                    checked={data.hasWebsite}
                    onCheckedChange={(checked) => updateData({ hasWebsite: !!checked })}
                  />
                  <div>
                    <div className="font-medium text-sm">Официальный сайт</div>
                    <div className="text-xs text-muted-foreground">Сайт организации в сети Интернет</div>
                  </div>
                </label>
                <label className="flex items-center gap-3 bg-secondary/50 rounded-xl p-4 cursor-pointer">
                  <Checkbox
                    checked={data.hasDistancePlatform}
                    onCheckedChange={(checked) => updateData({ hasDistancePlatform: !!checked })}
                  />
                  <div>
                    <div className="font-medium text-sm">Платформа ДОТ</div>
                    <div className="text-xs text-muted-foreground">Дистанционные образовательные технологии</div>
                  </div>
                </label>
                <label className="flex items-center gap-3 bg-secondary/50 rounded-xl p-4 cursor-pointer">
                  <Checkbox
                    checked={data.hasMultimedia}
                    onCheckedChange={(checked) => updateData({ hasMultimedia: !!checked })}
                  />
                  <div>
                    <div className="font-medium text-sm">Мультимедийное оборудование</div>
                    <div className="text-xs text-muted-foreground">Проекторы, интерактивные доски и т.д.</div>
                  </div>
                </label>
                <label className="flex items-center gap-3 bg-secondary/50 rounded-xl p-4 cursor-pointer">
                  <Checkbox
                    checked={data.hasLibrary}
                    onCheckedChange={(checked) => updateData({ hasLibrary: !!checked })}
                  />
                  <div>
                    <div className="font-medium text-sm">Библиотечный фонд</div>
                    <div className="text-xs text-muted-foreground">Учебная и методическая литература</div>
                  </div>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Дополнительное оборудование</Label>
              <Textarea
                value={data.additionalEquipment}
                onChange={(e) => updateData({ additionalEquipment: e.target.value })}
                placeholder="Опишите дополнительное оборудование, учебные материалы и т.д."
                className="rounded-xl min-h-[80px]"
              />
            </div>
          </div>
        );

      case 8:
        return (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-2xl p-6 border border-primary/20">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Проверьте данные
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Организация:</span>
                  <div className="font-medium">{data.fullName || "Не указано"}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Директор:</span>
                  <div className="font-medium">{data.directorFio || "Не указано"}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Период:</span>
                  <div className="font-medium">
                    {data.periodStart && data.periodEnd 
                      ? `${new Date(data.periodStart).toLocaleDateString('ru-RU')} — ${new Date(data.periodEnd).toLocaleDateString('ru-RU')}`
                      : "Не указан"}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Программ:</span>
                  <div className="font-medium">{data.programs.filter(p => p.name).length}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Обучающихся:</span>
                  <div className="font-medium">{data.totalStudents}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Педагогов:</span>
                  <div className="font-medium">{data.staff.filter(s => s.fio).length}</div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Дополнительные примечания к отчёту</Label>
              <Textarea
                value={data.additionalNotes}
                onChange={(e) => updateData({ additionalNotes: e.target.value })}
                placeholder="Любые дополнительные сведения для включения в отчёт..."
                className="rounded-xl min-h-[100px]"
              />
            </div>

            <div className="bg-secondary/50 rounded-xl p-4 text-sm space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Стоимость услуги:</span>
                <span className="font-bold text-primary text-xl">3 500 ₽</span>
              </div>
              <p className="text-xs text-muted-foreground">
                После отправки заявки с вами свяжется менеджер для подтверждения и оплаты. 
                После оплаты отчёт будет сгенерирован автоматически.
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Анкета для отчёта о самообследовании
          </DialogTitle>
          <DialogDescription>
            Шаг {currentStep} из {steps.length}: {steps[currentStep - 1].description}
          </DialogDescription>
        </DialogHeader>

        {/* Progress */}
        <div className="space-y-3">
          <Progress value={progress} className="h-1.5" />
          <div className="flex justify-between">
            {steps.map((step) => {
              const StepIcon = step.icon;
              const isActive = step.id === currentStep;
              const isCompleted = step.id < currentStep;
              return (
                <button
                  key={step.id}
                  onClick={() => setCurrentStep(step.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 text-xs transition-colors",
                    isActive ? "text-primary" : isCompleted ? "text-muted-foreground" : "text-muted-foreground/50"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                    isActive ? "bg-primary text-primary-foreground" : 
                    isCompleted ? "bg-primary/20 text-primary" : "bg-secondary"
                  )}>
                    <StepIcon className="w-4 h-4" />
                  </div>
                  <span className="hidden sm:block">{step.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-4 min-h-[300px]">
          {renderStep()}
        </div>

        {/* Footer */}
        <div className="flex justify-between pt-4 border-t border-border">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 1}
            className="rounded-xl gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Назад
          </Button>

          {currentStep < steps.length ? (
            <Button onClick={handleNext} className="btn-gradient rounded-xl gap-2">
              Далее
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button 
              onClick={handleSubmit} 
              disabled={isSubmitting}
              className="btn-gradient rounded-xl gap-2"
            >
              {isSubmitting ? (
                <>
                  <SigmaSpinner size="sm" />
                  Отправка...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Заказать за 3 500 ₽
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
