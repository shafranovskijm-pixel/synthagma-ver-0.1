/**
 * Реквизиты Оператора платформы Синтагма (ИП Шафрановский М.М.).
 *
 * Это значения по умолчанию (фолбэк). Актуальные реквизиты хранятся в
 * `app_settings.operator_requisites` и редактируются в админке
 * (вкладка «Реквизиты оператора»). Все генераторы счетов сначала
 * пытаются прочитать их из БД, а в случае ошибки используют OPERATOR.
 */
export const OPERATOR = {
  fullName: "ИП Шафрановский Максим Михайлович",
  shortName: "Шафрановский М.М.",
  inn: "253615392404",
  ogrnip: "324253600042754",
  email: "support@sintagma.com.ru",
  phone: "+7 (914) 721 34 24",
  address: "692481, Приморский край, Надеждинский р-н, село Вольно-Надеждинское",
  legalForm: "Индивидуальный предприниматель",
  // Банковские реквизиты
  bankName: "ООО «ОЗОН Банк»",
  bankAccount: "40802810200000522079",
  bik: "044525068",
  corrAccount: "30101810645374525068",
  bankInn: "9703077050",
  bankKpp: "770301001",
} as const;

export type OperatorDetails = typeof OPERATOR;

export interface OperatorRequisites {
  fullName: string;
  shortName: string;
  inn: string;
  ogrnip: string;
  email: string;
  phone: string;
  address: string;
  bankName: string;
  bankAccount: string;
  bik: string;
  corrAccount: string;
  bankInn: string;
  bankKpp: string;
}

export const DEFAULT_OPERATOR_REQUISITES: OperatorRequisites = {
  fullName: OPERATOR.fullName,
  shortName: OPERATOR.shortName,
  inn: OPERATOR.inn,
  ogrnip: OPERATOR.ogrnip,
  email: OPERATOR.email,
  phone: OPERATOR.phone,
  address: OPERATOR.address,
  bankName: OPERATOR.bankName,
  bankAccount: OPERATOR.bankAccount,
  bik: OPERATOR.bik,
  corrAccount: OPERATOR.corrAccount,
  bankInn: OPERATOR.bankInn,
  bankKpp: OPERATOR.bankKpp,
};
