import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/constants/subscriptionPlans";

export const PLAN_ORDER: SubscriptionPlan[] = ['free', 'start', 'standard', 'professional', 'maximum'];

export interface PricingFeatureRow {
  label: string;
  link?: string;
  getValue: (p: SubscriptionPlan) => string | boolean;
}

export const pricingFeatureRows: PricingFeatureRow[] = [
  {
    label: "Курсы",
    getValue: (p) => {
      const l = SUBSCRIPTION_PLANS[p].limits;
      return l.maxCourses === -1 ? "Безлимит" : String(l.maxCourses);
    },
  },
  {
    label: "Ученики",
    getValue: (p) => {
      const l = SUBSCRIPTION_PLANS[p].limits;
      return l.maxStudents === -1 ? "Безлимит" : String(l.maxStudents);
    },
  },
  { label: "Настройки курсов", link: "/feature/course-settings", getValue: () => true },
  { label: "Магазин курсов", link: "/feature/course-store", getValue: (p) => SUBSCRIPTION_PLANS[p].enabledCategories.includes('services') },
  { label: "Чек-лист документов", link: "/feature/document-checklist", getValue: () => true },
  { label: "Видеоидентификация", link: "/feature/video-id", getValue: () => true },
  { label: "Брендирование", link: "/feature/branding", getValue: () => true },
  { label: "Компании", getValue: (p) => SUBSCRIPTION_PLANS[p].enabledCategories.includes('companies') },
  { label: "Журналы", getValue: (p) => SUBSCRIPTION_PLANS[p].enabledCategories.includes('journals') },
  { label: "Email-рассылки", link: "/feature/email-campaigns", getValue: (p) => SUBSCRIPTION_PLANS[p].limits.emailCampaignsEnabled },
  { label: "CRM и Продажи", link: "/feature/sales-crm", getValue: (p) => SUBSCRIPTION_PLANS[p].limits.salesCrmEnabled },
  { label: "Документы для ЛОО", link: "/feature/documents", getValue: (p) => SUBSCRIPTION_PLANS[p].enabledCategories.includes('documents') },
  { label: "Охрана труда", link: "/feature/labor-safety", getValue: (p) => SUBSCRIPTION_PLANS[p].enabledCategories.includes('labor_safety') },
  {
    label: "ФИС ФРДО",
    link: "/feature/frdo",
    getValue: (p) => {
      if (!SUBSCRIPTION_PLANS[p].enabledCategories.includes('frdo')) return false;
      return (p === 'professional' || p === 'maximum') ? 'ФРДО+' : true;
    },
  },
  { label: "Вебинары", getValue: (p) => SUBSCRIPTION_PLANS[p].limits.webinarsEnabled },
  { label: "Видеосервис+", getValue: (p) => SUBSCRIPTION_PLANS[p].limits.videoServicePlus },
  { label: "3D-тренажёры", getValue: (p) => SUBSCRIPTION_PLANS[p].limits.trainersEnabled },
  { label: "ИИ-генерация", link: "/feature/ai-courses", getValue: () => true },
  { label: "ИИ-озвучка", link: "/feature/ai-courses", getValue: () => true },
];

export function formatPriceRu(price: number): string {
  return price.toLocaleString('ru-RU');
}
