/**
 * Реквизиты Оператора платформы Синтагма.
 * Используются как дефолтные значения при подписании документов
 * со стороны организации (а также в счетах, актах, договорах).
 */
export const OPERATOR = {
  fullName: "ИП Шафрановский Максим Михайлович",
  shortName: "Шафрановский М.М.",
  inn: "253615392404",
  ogrnip: "324253600042754",
  email: "support@sintagma.com.ru",
  legalForm: "Индивидуальный предприниматель",
} as const;

export type OperatorDetails = typeof OPERATOR;
