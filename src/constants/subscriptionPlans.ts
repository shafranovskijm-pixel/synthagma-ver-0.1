export type SubscriptionPlan = 'free' | 'start' | 'standard' | 'professional' | 'maximum';

export interface PlanLimits {
  maxCourses: number; // -1 = unlimited
  maxStudents: number;
  maxTrainedPerMonth: number;
  storageBytes: number;
  aiEnabled: boolean;
  aiAudioEnabled: boolean;
  courseSettings: boolean; // запрет перемотки, последовательность уроков
  documentChecklist: boolean;
  videoIdentification: boolean;
}

export interface PlanInfo {
  id: SubscriptionPlan;
  name: string;
  price: number; // monthly price in rubles, 0 for free
  limits: PlanLimits;
  enabledCategories: string[];
  description: string;
}

export const YEARLY_DISCOUNT = 0.15; // 15%

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlan, PlanInfo> = {
  free: {
    id: 'free',
    name: 'Бесплатный',
    price: 0,
    description: 'Для знакомства с платформой',
    limits: {
      maxCourses: 1,
      maxStudents: 10,
      maxTrainedPerMonth: 10,
      storageBytes: 104857600, // 100 MB
      aiEnabled: false,
      aiAudioEnabled: false,
      courseSettings: false,
      documentChecklist: false,
      videoIdentification: false,
    },
    enabledCategories: ['courses', 'students', 'settings', 'student_cabinet'],
  },
  start: {
    id: 'start',
    name: 'Старт',
    price: 3490,
    description: 'Для начинающих организаций',
    limits: {
      maxCourses: 3,
      maxStudents: 50,
      maxTrainedPerMonth: 30,
      storageBytes: 1073741824, // 1 GB
      aiEnabled: false,
      aiAudioEnabled: false,
      courseSettings: false,
      documentChecklist: false,
      videoIdentification: false,
    },
    enabledCategories: ['courses', 'students', 'companies', 'links', 'settings', 'student_cabinet'],
  },
  standard: {
    id: 'standard',
    name: 'Стандарт',
    price: 6990,
    description: 'Для активных организаций',
    limits: {
      maxCourses: 10,
      maxStudents: 200,
      maxTrainedPerMonth: 100,
      storageBytes: 5368709120, // 5 GB
      aiEnabled: false,
      aiAudioEnabled: false,
      courseSettings: true,
      documentChecklist: false,
      videoIdentification: false,
    },
    enabledCategories: ['courses', 'students', 'companies', 'links', 'services', 'settings', 'student_cabinet'],
  },
  professional: {
    id: 'professional',
    name: 'Профессиональный',
    price: 16990,
    description: 'Для крупных организаций',
    limits: {
      maxCourses: 30,
      maxStudents: 1000,
      maxTrainedPerMonth: 500,
      storageBytes: 21474836480, // 20 GB
      aiEnabled: false,
      aiAudioEnabled: false,
      courseSettings: true,
      documentChecklist: true,
      videoIdentification: true,
    },
    enabledCategories: ['courses', 'students', 'companies', 'documents', 'journals', 'frdo', 'links', 'library', 'services', 'settings', 'student_cabinet', 'labor_safety'],
  },
  maximum: {
    id: 'maximum',
    name: 'Максимальный',
    price: 24990,
    description: 'Полный доступ ко всем функциям',
    limits: {
      maxCourses: -1,
      maxStudents: -1,
      maxTrainedPerMonth: -1,
      storageBytes: 107374182400, // 100 GB
      aiEnabled: true,
      aiAudioEnabled: true,
      courseSettings: true,
      documentChecklist: true,
      videoIdentification: true,
    },
    enabledCategories: ['courses', 'students', 'companies', 'documents', 'journals', 'frdo', 'links', 'library', 'services', 'settings', 'student_cabinet', 'labor_safety'],
  },
};

export function getPlanInfo(plan: SubscriptionPlan): PlanInfo {
  return SUBSCRIPTION_PLANS[plan] || SUBSCRIPTION_PLANS.free;
}

export function formatStorageSize(bytes: number): string {
  if (bytes >= 1073741824) return `${Math.round(bytes / 1073741824)} ГБ`;
  return `${Math.round(bytes / 1048576)} МБ`;
}
