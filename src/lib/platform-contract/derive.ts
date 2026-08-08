import {
  SUBSCRIPTION_PLANS,
  YEARLY_DISCOUNT,
  formatStorageSize,
  type SubscriptionPlan,
} from "@/constants/subscriptionPlans";
import { localDateIso } from "@/lib/date/localDate";
import type {
  PlatformContractCustomer,
  PlatformContractDraft,
  PlatformContractPeriodMonths,
} from "./types";

/** Тарифы, доступные для проекта договора. Ключи строго из SUBSCRIPTION_PLANS. */
export const PLATFORM_CONTRACT_PLANS: SubscriptionPlan[] = [
  "free",
  "start",
  "standard",
  "professional",
  "maximum",
];

const limitLabel = (n: number) => (n === -1 ? "Без ограничений" : String(n));

export function formatRub(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function planFeatures(plan: SubscriptionPlan): string[] {
  const l = SUBSCRIPTION_PLANS[plan].limits;
  return [
    "Курсы, тесты, домашние задания, журналы",
    l.aiEnabled ? "ИИ-помощник для подготовки материалов" : "",
    l.documentChecklist ? "Документы организации и электронная подпись (ПЭП)" : "",
    l.frdoEnabled
      ? plan === "professional" || plan === "maximum"
        ? "ФИС ФРДО+ — проверка, подготовка и выгрузка сведений за заказчика"
        : "ФИС ФРДО — проверка и подготовка данных и файла к выгрузке"
      : "",
    l.branding ? "Брендирование кабинета заказчика" : "",
    l.emailCampaignsEnabled ? "Email-рассылки через почту заказчика" : "",
    l.salesCrmEnabled ? "CRM и коммерческие документы" : "",
    l.webinarsEnabled ? "Вебинары" : "",
    l.videoServicePlus ? "Видеосервис+ (загрузка объёмных видео)" : "",
    l.trainersEnabled ? "3D-тренажёры — подключаются за дополнительную плату" : "",
  ].filter(Boolean);
}

/**
 * Формирует проект договора. Цена, скидка и лимиты берутся ТОЛЬКО из
 * SUBSCRIPTION_PLANS и YEARLY_DISCOUNT — ручные цены недопустимы.
 */
export function derivePlatformContractDraft(input: {
  plan: SubscriptionPlan;
  periodMonths: PlatformContractPeriodMonths;
  customer?: PlatformContractCustomer;
  date?: string;
  projectId?: string;
}): PlatformContractDraft {
  const plan = PLATFORM_CONTRACT_PLANS.includes(input.plan) ? input.plan : "free";
  const info = SUBSCRIPTION_PLANS[plan];
  const periodMonths: PlatformContractPeriodMonths = input.periodMonths === 12 ? 12 : 1;

  const monthlyPrice = info.price;
  const discountRate = periodMonths === 12 && monthlyPrice > 0 ? YEARLY_DISCOUNT : 0;
  const effectiveMonthlyPrice = Math.round(monthlyPrice * (1 - discountRate));
  const grossAmount = monthlyPrice * periodMonths;
  const totalAmount = effectiveMonthlyPrice * periodMonths;
  const discountAmount = grossAmount - totalAmount;

  const l = info.limits;

  return {
    status: "project",
    plan,
    planName: info.name,
    planDescription: info.description,
    periodMonths,
    monthlyPrice,
    effectiveMonthlyPrice,
    discountRate,
    discountAmount,
    totalAmount,
    date: input.date || localDateIso(),
    projectId: input.projectId,
    customer: input.customer ?? {},
    limits: {
      courses: limitLabel(l.maxCourses),
      students: limitLabel(l.maxStudents),
      trainedPerMonth: limitLabel(l.maxTrainedPerMonth),
      storage: l.storageBytes === -1 ? "Без ограничений" : formatStorageSize(l.storageBytes),
    },
    features: planFeatures(plan),
  };
}
