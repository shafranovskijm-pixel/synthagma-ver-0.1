import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";

export interface CommissionMember {
  fio: string;
  position: string;
}

export interface Program {
  name: string;
  type: string;
  studentsCount: number;
}

export interface StaffMember {
  fio: string;
  subject: string;
  education: string;
  experienceYears: number;
  employmentType: string;
}

export interface QuizData {
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
  licenseNumber: string;
  licenseDate: string;
  programTypes: string[];
  periodStart: string;
  periodEnd: string;
  orderNumber: string;
  orderDate: string;
  commissionChairman: CommissionMember;
  commissionMembers: CommissionMember[];
  directorFio: string;
  directorPosition: string;
  directorTermYears: number;
  hasPedagogicalCouncil: boolean;
  pedagogicalCouncilProtocolNumber: string;
  pedagogicalCouncilProtocolDate: string;
  programs: Program[];
  totalStudents: number;
  completedStudents: number;
  controlTypes: string[];
  testingPlatformName: string;
  testingPlatformUrl: string;
  finalAttestationForm: string;
  hasEmployerParticipation: boolean;
  staff: StaffMember[];
  hasWebsite: boolean;
  hasDistancePlatform: boolean;
  hasMultimedia: boolean;
  hasLibrary: boolean;
  additionalEquipment: string;
  additionalNotes: string;
}

const initialQuizData: QuizData = {
  fullName: "", shortName: "",
  legalForm: "Общество с ограниченной ответственностью",
  legalAddress: "", phone: "", email: "", website: "",
  ogrn: "", inn: "", kpp: "", founders: "",
  licenseNumber: "", licenseDate: "",
  programTypes: ["дополнительное профессиональное образование"],
  periodStart: "", periodEnd: "", orderNumber: "", orderDate: "",
  commissionChairman: { fio: "", position: "Директор" },
  commissionMembers: [{ fio: "", position: "Преподаватель" }],
  directorFio: "", directorPosition: "Директор", directorTermYears: 3,
  hasPedagogicalCouncil: true,
  pedagogicalCouncilProtocolNumber: "1", pedagogicalCouncilProtocolDate: "",
  programs: [{ name: "", type: "повышение квалификации", studentsCount: 0 }],
  totalStudents: 0, completedStudents: 0,
  controlTypes: ["входной", "текущий", "промежуточный", "итоговый"],
  testingPlatformName: "", testingPlatformUrl: "",
  finalAttestationForm: "квалификационный экзамен",
  hasEmployerParticipation: true,
  staff: [{ fio: "", subject: "", education: "Высшее профессиональное", experienceYears: 5, employmentType: "По договору" }],
  hasWebsite: true, hasDistancePlatform: true, hasMultimedia: true, hasLibrary: true,
  additionalEquipment: "", additionalNotes: "",
};

interface OrganizationData {
  name?: string; inn?: string; kpp?: string; ogrn?: string;
  email?: string; phone?: string; legal_address?: string;
  director_name?: string; director_position?: string;
}

export const QUIZ_STEPS = [
  { id: 1, title: "Организация", description: "Основные сведения" },
  { id: 2, title: "Лицензия", description: "Лицензия и комиссия" },
  { id: 3, title: "Управление", description: "Руководство" },
  { id: 4, title: "Образование", description: "Программы обучения" },
  { id: 5, title: "Качество", description: "Контроль качества" },
  { id: 6, title: "Кадры", description: "Педагогический состав" },
  { id: 7, title: "Инфраструктура", description: "Оснащение" },
  { id: 8, title: "Итого", description: "Проверка и отправка" },
];

export function useSelfExaminationQuiz(organizationData?: OrganizationData) {
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
      position: organizationData?.director_position || "Директор",
    },
    periodStart: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    periodEnd: new Date().toISOString().split('T')[0],
    orderDate: new Date().toISOString().split('T')[0],
    orderNumber: `${new Date().getFullYear()}-СО-01`,
    pedagogicalCouncilProtocolDate: new Date().toISOString().split('T')[0],
  }));

  const updateData = (updates: Partial<QuizData>) => {
    setData(prev => ({ ...prev, ...updates }));
  };

  const loadCompanyByInn = async () => {
    if (!data.inn || data.inn.length < 10) {
      toast.error("Введите корректный ИНН (10 или 12 цифр)");
      return;
    }
    setIsLoadingInn(true);
    try {
      const { data: result, error } = await safeInvoke<any>('dadata-company', { body: { inn: data.inn } });
      if (error) throw error;
      if (result.success && result.company) {
        const company = result.company;
        let legalForm = "Общество с ограниченной ответственностью";
        if (company.opf) {
          if (company.opf.includes("ИП") || company.type === "INDIVIDUAL") legalForm = "Индивидуальный предприниматель";
          else if (company.opf.includes("АО") || company.opf.includes("Акционерное")) legalForm = "Акционерное общество";
          else if (company.opf.includes("АНО") || company.opf.includes("Автономная")) legalForm = "Автономная некоммерческая организация";
        }
        const foundersText = company.founders?.length > 0 ? company.founders.join(", ") : data.founders;
        let licenseDate = data.licenseDate;
        if (company.license?.issueDate) {
          const date = new Date(company.license.issueDate);
          if (!isNaN(date.getTime())) licenseDate = date.toISOString().split('T')[0];
        }
        updateData({
          fullName: company.fullName || company.name || data.fullName,
          shortName: company.shortName || company.name || data.shortName,
          legalForm, legalAddress: company.address || data.legalAddress,
          ogrn: company.ogrn || data.ogrn, kpp: company.kpp || data.kpp,
          directorFio: company.management || data.directorFio,
          directorPosition: company.managementPosition || data.directorPosition,
          commissionChairman: {
            fio: company.management || data.commissionChairman.fio,
            position: company.managementPosition || data.commissionChairman.position,
          },
          founders: foundersText,
          licenseNumber: company.license?.number || data.licenseNumber,
          licenseDate,
        });
        setInnLoaded(true);
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

  const handleNext = () => { if (currentStep < QUIZ_STEPS.length) setCurrentStep(currentStep + 1); };
  const handleBack = () => { if (currentStep > 1) setCurrentStep(currentStep - 1); };

  // Array manipulators
  const addCommissionMember = () => updateData({ commissionMembers: [...data.commissionMembers, { fio: "", position: "Преподаватель" }] });
  const removeCommissionMember = (index: number) => updateData({ commissionMembers: data.commissionMembers.filter((_, i) => i !== index) });
  const updateCommissionMember = (index: number, field: keyof CommissionMember, value: string) => {
    const updated = [...data.commissionMembers]; updated[index] = { ...updated[index], [field]: value }; updateData({ commissionMembers: updated });
  };

  const addProgram = () => updateData({ programs: [...data.programs, { name: "", type: "повышение квалификации", studentsCount: 0 }] });
  const removeProgram = (index: number) => updateData({ programs: data.programs.filter((_, i) => i !== index) });
  const updateProgram = (index: number, field: keyof Program, value: string | number) => {
    const updated = [...data.programs]; updated[index] = { ...updated[index], [field]: value }; updateData({ programs: updated });
  };

  const addStaffMember = () => updateData({ staff: [...data.staff, { fio: "", subject: "", education: "Высшее профессиональное", experienceYears: 5, employmentType: "По договору" }] });
  const removeStaffMember = (index: number) => updateData({ staff: data.staff.filter((_, i) => i !== index) });
  const updateStaffMember = (index: number, field: keyof StaffMember, value: string | number) => {
    const updated = [...data.staff]; updated[index] = { ...updated[index], [field]: value }; updateData({ staff: updated });
  };

  const toggleControlType = (type: string) => {
    if (data.controlTypes.includes(type)) updateData({ controlTypes: data.controlTypes.filter(t => t !== type) });
    else updateData({ controlTypes: [...data.controlTypes, type] });
  };

  const toggleProgramType = (type: string) => {
    if (data.programTypes.includes(type)) updateData({ programTypes: data.programTypes.filter(t => t !== type) });
    else updateData({ programTypes: [...data.programTypes, type] });
  };

  const progress = (currentStep / QUIZ_STEPS.length) * 100;

  return {
    data, updateData, currentStep, setCurrentStep,
    isLoadingInn, innLoaded, loadCompanyByInn,
    handleNext, handleBack, progress,
    addCommissionMember, removeCommissionMember, updateCommissionMember,
    addProgram, removeProgram, updateProgram,
    addStaffMember, removeStaffMember, updateStaffMember,
    toggleControlType, toggleProgramType,
  };
}
