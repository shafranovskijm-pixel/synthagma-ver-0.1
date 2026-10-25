import { useEffect, useRef, useState } from "react";
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
  studentsCount: number | null;
}

export interface StaffMember {
  fio: string;
  subject: string;
  education: string;
  experienceYears: number | null;
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
  directorTermYears: number | null;
  hasPedagogicalCouncil: boolean | null;
  pedagogicalCouncilProtocolNumber: string;
  pedagogicalCouncilProtocolDate: string;
  programs: Program[];
  totalStudents: number | null;
  completedStudents: number | null;
  controlTypes: string[];
  testingPlatformName: string;
  testingPlatformUrl: string;
  finalAttestationForm: string;
  hasEmployerParticipation: boolean | null;
  staff: StaffMember[];
  hasWebsite: boolean | null;
  hasDistancePlatform: boolean | null;
  hasMultimedia: boolean | null;
  hasLibrary: boolean | null;
  additionalEquipment: string;
  additionalNotes: string;
}

export const initialQuizData: QuizData = {
  fullName: '', shortName: '', legalForm: '', legalAddress: '', phone: '', email: '', website: '',
  ogrn: '', inn: '', kpp: '', founders: '', licenseNumber: '', licenseDate: '', programTypes: [],
  periodStart: '', periodEnd: '', orderNumber: '', orderDate: '', commissionChairman: { fio: '', position: '' }, commissionMembers: [],
  directorFio: '', directorPosition: '', directorTermYears: null, hasPedagogicalCouncil: null,
  pedagogicalCouncilProtocolNumber: '', pedagogicalCouncilProtocolDate: '', programs: [], totalStudents: null, completedStudents: null,
  controlTypes: [], testingPlatformName: '', testingPlatformUrl: '', finalAttestationForm: '', hasEmployerParticipation: null, staff: [],
  hasWebsite: null, hasDistancePlatform: null, hasMultimedia: null, hasLibrary: null, additionalEquipment: '', additionalNotes: '',
};
export function optionalNonnegativeNumber(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= Number.MAX_SAFE_INTEGER ? number : null;
}

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
  const [dirty, setDirty] = useState(false);
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
    directorPosition: organizationData?.director_position || "",
    commissionChairman: {
      fio: organizationData?.director_name || "",
      position: organizationData?.director_position || "",
    },

  }));

  const alive = useRef(true), innEpoch = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; ++innEpoch.current; }; }, []);
  const updateData = (updates: Partial<QuizData>) => {
    setDirty(true);
    if (updates.inn !== undefined) { ++innEpoch.current; setInnLoaded(false); }
    setData(prev => ({ ...prev, ...updates }));
  };

  const loadCompanyByInn = async () => {
    if (!data.inn || data.inn.length < 10) {
      toast.error("Введите корректный ИНН (10 или 12 цифр)");
      return;
    }
    const request = ++innEpoch.current;
    setIsLoadingInn(true);
    try {
      const { data: result, error } = await safeInvoke<any>('dadata-company', { body: { inn: data.inn } });
      if (!alive.current || request !== innEpoch.current) return;
      if (error) throw error;
      if (result.success && result.company) {
        const company = result.company;
        const legalForm = typeof company.opf === 'string' && company.opf.trim() ? company.opf : data.legalForm;
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
      if (!alive.current || request !== innEpoch.current) return;
      console.error("Error loading company by INN:", error);
      toast.error("Ошибка загрузки данных по ИНН");
    } finally {
      if (alive.current && request === innEpoch.current) setIsLoadingInn(false);
    }
  };

  const handleNext = () => { if (currentStep < QUIZ_STEPS.length) setCurrentStep(currentStep + 1); };
  const handleBack = () => { if (currentStep > 1) setCurrentStep(currentStep - 1); };

  // Array manipulators
  const addCommissionMember = () => updateData({ commissionMembers: [...data.commissionMembers, { fio: "", position: "" }] });
  const removeCommissionMember = (index: number) => updateData({ commissionMembers: data.commissionMembers.filter((_, i) => i !== index) });
  const updateCommissionMember = (index: number, field: keyof CommissionMember, value: string) => {
    const updated = [...data.commissionMembers]; updated[index] = { ...updated[index], [field]: value }; updateData({ commissionMembers: updated });
  };

  const addProgram = () => updateData({ programs: [...data.programs, { name: "", type: "", studentsCount: null }] });
  const removeProgram = (index: number) => updateData({ programs: data.programs.filter((_, i) => i !== index) });
  const updateProgram = (index: number, field: keyof Program, value: string | number | null) => {
    const updated = [...data.programs]; updated[index] = { ...updated[index], [field]: value }; updateData({ programs: updated });
  };

  const addStaffMember = () => updateData({ staff: [...data.staff, { fio: "", subject: "", education: "", experienceYears: null, employmentType: "" }] });
  const removeStaffMember = (index: number) => updateData({ staff: data.staff.filter((_, i) => i !== index) });
  const updateStaffMember = (index: number, field: keyof StaffMember, value: string | number | null) => {
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
    data, updateData, dirty, replaceData: (next: QuizData) => { ++innEpoch.current; setData(next); setInnLoaded(false); setDirty(false); }, currentStep, setCurrentStep,
    isLoadingInn, innLoaded, loadCompanyByInn,
    handleNext, handleBack, progress,
    addCommissionMember, removeCommissionMember, updateCommissionMember,
    addProgram, removeProgram, updateProgram,
    addStaffMember, removeStaffMember, updateStaffMember,
    toggleControlType, toggleProgramType,
  };
}
