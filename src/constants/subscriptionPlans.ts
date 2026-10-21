import { SUBSCRIPTION_MONTHLY_PRICES, SUBSCRIPTION_YEARLY_DISCOUNT, subscriptionMonthlyAmount } from "../../supabase/functions/_shared/subscription-pricing";

export type SubscriptionPlan = 'free' | 'start' | 'standard' | 'professional' | 'maximum';

export interface PlanLimits {
  maxCourses: number; // -1 = unlimited
  maxStudents: number; // Unique course assignees per Europe/Moscow calendar month; stored profiles are unlimited.
  maxTrainedPerMonth: number;
  storageBytes: number;
  aiEnabled: boolean;
  aiAudioEnabled: boolean;
  courseSettings: boolean; // запрет перемотки, последовательность уроков
  documentChecklist: boolean;
  videoIdentification: boolean;
  branding: boolean;
  frdoEnabled: boolean;
  reportsEnabled: boolean;
  kinescopeEnabled: boolean;
  webinarsEnabled: boolean;
  videoServicePlus: boolean; // загрузка видео >2 ГБ
  trainersEnabled: boolean; // 3D-тренажёры
  emailCampaignsEnabled: boolean; // Email-рассылки + SMTP
  salesCrmEnabled: boolean; // CRM, сделки, КП, договоры
}

export interface PlanInfo {
  id: SubscriptionPlan;
  name: string;
  price: number; // monthly price in rubles, 0 for free
  limits: PlanLimits;
  enabledCategories: string[];
  description: string;
}

export const YEARLY_DISCOUNT = SUBSCRIPTION_YEARLY_DISCOUNT; // 15%

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlan, PlanInfo> = {
  free: {
    id: 'free',
    name: 'Бесплатный',
    price: SUBSCRIPTION_MONTHLY_PRICES.free,
    description: 'Для знакомства с платформой',
    limits: {
      maxCourses: 3,
      maxStudents: 10,
      maxTrainedPerMonth: 10,
      storageBytes: 104857600, // 100 MB
      aiEnabled: true,
      aiAudioEnabled: true,
      courseSettings: true,
      documentChecklist: true,
      videoIdentification: true,
      branding: true,
      frdoEnabled: true,
      reportsEnabled: true,
      kinescopeEnabled: true,
      webinarsEnabled: false,
      videoServicePlus: false,
      trainersEnabled: false,
      emailCampaignsEnabled: false,
      salesCrmEnabled: false,
    },
    enabledCategories: ['courses', 'students', 'companies', 'documents', 'journals', 'frdo', 'links', 'library', 'services', 'settings', 'student_cabinet', 'labor_safety'],
  },
  start: {
    id: 'start',
    name: 'Старт',
    price: SUBSCRIPTION_MONTHLY_PRICES.start,
    description: 'Для начинающих организаций',
    limits: {
      maxCourses: 15,
      maxStudents: 100,
      maxTrainedPerMonth: 60,
      storageBytes: 3221225472, // 3 GB
      aiEnabled: true,
      aiAudioEnabled: true,
      courseSettings: true,
      documentChecklist: true,
      videoIdentification: true,
      branding: true,
      frdoEnabled: true,
      reportsEnabled: true,
      kinescopeEnabled: true,
      webinarsEnabled: false,
      videoServicePlus: false,
      trainersEnabled: false,
      emailCampaignsEnabled: true,
      salesCrmEnabled: false,
    },
    enabledCategories: ['courses', 'students', 'companies', 'documents', 'journals', 'frdo', 'links', 'library', 'services', 'settings', 'student_cabinet', 'labor_safety'],
  },
  standard: {
    id: 'standard',
    name: 'Стандарт',
    price: SUBSCRIPTION_MONTHLY_PRICES.standard,
    description: 'Для активных организаций',
    limits: {
      maxCourses: 30,
      maxStudents: 200,
      maxTrainedPerMonth: 100,
      storageBytes: 10737418240, // 10 GB
      aiEnabled: true,
      aiAudioEnabled: true,
      courseSettings: true,
      documentChecklist: true,
      videoIdentification: true,
      branding: true,
      frdoEnabled: true,
      reportsEnabled: true,
      kinescopeEnabled: true,
      webinarsEnabled: false,
      videoServicePlus: false,
      trainersEnabled: false,
      emailCampaignsEnabled: true,
      salesCrmEnabled: true,
    },
    enabledCategories: ['courses', 'students', 'companies', 'documents', 'journals', 'frdo', 'links', 'library', 'services', 'settings', 'student_cabinet', 'labor_safety'],
  },
  professional: {
    id: 'professional',
    name: 'Профессиональный',
    price: SUBSCRIPTION_MONTHLY_PRICES.professional,
    description: 'Для крупных организаций',
    limits: {
      maxCourses: -1,
      maxStudents: -1,
      maxTrainedPerMonth: -1,
      storageBytes: -1,
      aiEnabled: true,
      aiAudioEnabled: true,
      courseSettings: true,
      documentChecklist: true,
      videoIdentification: true,
      branding: true,
      frdoEnabled: true,
      reportsEnabled: true,
      kinescopeEnabled: true,
      webinarsEnabled: true,
      videoServicePlus: true,
      trainersEnabled: true,
      emailCampaignsEnabled: true,
      salesCrmEnabled: true,
    },
    enabledCategories: ['courses', 'students', 'companies', 'documents', 'journals', 'frdo', 'links', 'library', 'services', 'settings', 'student_cabinet', 'labor_safety', 'webinars', '3d_trainers'],
  },
  maximum: {
    id: 'maximum',
    name: 'Максимальный',
    price: SUBSCRIPTION_MONTHLY_PRICES.maximum,
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
      branding: true,
      frdoEnabled: true,
      reportsEnabled: true,
      kinescopeEnabled: true,
      webinarsEnabled: true,
      videoServicePlus: true,
      trainersEnabled: true,
      emailCampaignsEnabled: true,
      salesCrmEnabled: true,
    },
    enabledCategories: ['courses', 'students', 'companies', 'documents', 'journals', 'frdo', 'links', 'library', 'services', 'settings', 'student_cabinet', 'labor_safety', 'webinars', '3d_trainers'],
  },
};

export function getPlanInfo(plan: SubscriptionPlan): PlanInfo {
  return SUBSCRIPTION_PLANS[plan] || SUBSCRIPTION_PLANS.free;
}

export interface SubscriptionInvoiceMonthlyAmountInput {
  plan?: string | null;
  customPrice?: number | null;
  customDiscount?: number | null;
}

/**
 * Monthly invoice amount for an organization.
 *
 * Public plan prices come from the same canonical table as the pricing pages.
 * Organization-specific fields keep their existing semantics: `custom_price`
 * replaces the monthly plan price and `custom_discount` is a fixed monthly
 * discount in rubles.
 */
export function getSubscriptionInvoiceMonthlyAmount({
  plan,
  customPrice,
  customDiscount,
}: SubscriptionInvoiceMonthlyAmountInput): number {
  const planInfo = SUBSCRIPTION_PLANS[plan as SubscriptionPlan] ?? SUBSCRIPTION_PLANS.start;
  return subscriptionMonthlyAmount(planInfo.id, customPrice, customDiscount);
}

export function formatStorageSize(bytes: number): string {
  if (bytes === -1) return '∞';
  if (bytes >= 1073741824) return `${Math.round(bytes / 1073741824)} ГБ`;
  return `${Math.round(bytes / 1048576)} МБ`;
}

/**
 * Find the minimum plan that enables a given category.
 */
export function getMinPlanForCategory(category: string): PlanInfo | null {
  const order: SubscriptionPlan[] = ['free', 'start', 'standard', 'professional', 'maximum'];
  for (const planId of order) {
    const plan = SUBSCRIPTION_PLANS[planId];
    if (plan.enabledCategories.includes(category)) {
      return plan;
    }
  }
  return null;
}
