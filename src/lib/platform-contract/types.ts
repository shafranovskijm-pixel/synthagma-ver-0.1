import type { SubscriptionPlan } from "@/constants/subscriptionPlans";

/** Срок оплаты: 1 месяц или 12 месяцев (год со скидкой). */
export type PlatformContractPeriodMonths = 1 | 12;

/** Реквизиты заказчика. Для публичной версии остаются пустыми — подставляются placeholders. */
export interface PlatformContractCustomer {
  /** Полное наименование организации-заказчика. */
  name?: string;
  /** Юридический адрес. */
  address?: string;
  inn?: string;
  kpp?: string;
  ogrn?: string;
  /** Должность подписанта. */
  signatoryPosition?: string;
  /** ФИО подписанта. */
  signatoryName?: string;
  /** Основание полномочий (устав, доверенность и т.п.). */
  signatoryBasis?: string;
  email?: string;
  phone?: string;
}

/**
 * Типизированная модель проекта договора на доступ к платформе СИНТАГМА.
 * Официальные номера проекту не присваиваются — только статус `project`.
 */
export interface PlatformContractDraft {
  status: "project";
  /** Тариф из SUBSCRIPTION_PLANS. */
  plan: SubscriptionPlan;
  planName: string;
  planDescription: string;
  periodMonths: PlatformContractPeriodMonths;
  /** Цена тарифа за месяц без скидки (источник — SUBSCRIPTION_PLANS). */
  monthlyPrice: number;
  /** Цена за месяц с учётом годовой скидки. */
  effectiveMonthlyPrice: number;
  /** Доля скидки (0 или YEARLY_DISCOUNT). */
  discountRate: number;
  /** Сумма скидки за весь период, ₽. */
  discountAmount: number;
  /** Итоговая сумма за период, ₽. */
  totalAmount: number;
  /** Дата формирования проекта, YYYY-MM-DD (локальная дата браузера). */
  date: string;
  /** Идентификатор внутреннего проекта (черновика), если он уже сохранён. */
  projectId?: string;
  customer: PlatformContractCustomer;
  /** Лимиты и состав тарифа для спецификации. */
  limits: {
    courses: string;
    students: string;
    trainedPerMonth: string;
    storage: string;
  };
  /** Состав услуг по тарифу (человекочитаемо). */
  features: string[];
}
