/**
 * Общие реквизиты оператора для frontend и Edge functions.
 * Сохранённый источник: app_settings.operator_requisites.
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

/** Never substitute fallback bank details when producing a company card. */
export function readStoredCompanyCardRequisites(value: unknown): OperatorRequisites {
  if (value == null || value === "") {
    throw new Error("Актуальные реквизиты не сохранены. Сохраните их в разделе «Реквизиты оператора».");
  }

  let parsed: unknown;
  try {
    parsed = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    throw new Error("Не удалось прочитать сохранённые реквизиты оператора. Проверьте настройки реквизитов.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Некорректные сохранённые реквизиты оператора. Проверьте настройки реквизитов.");
  }

  const stored = parsed as Record<string, unknown>;
  const bankFields = ["bankName", "bankAccount", "bik", "corrAccount"] as const;
  for (const key of bankFields) {
    if (typeof stored[key] !== "string" || !stored[key].trim()) {
      throw new Error("Банковские реквизиты оператора не заполнены. Сохраните банк, расчётный счёт, БИК и корреспондентский счёт.");
    }
  }
  const account = (stored.bankAccount as string).replace(/\s/g, "");
  if (account.startsWith("409")) {
    throw new Error("Старый расчётный счёт 409… отключён. Сохраните актуальные реквизиты оператора.");
  }
  if (!/^\d{20}$/.test(account)) {
    throw new Error("В сохранённых реквизитах указан некорректный расчётный счёт. Проверьте 20 цифр счёта.");
  }
  const bik = (stored.bik as string).replace(/\s/g, "");
  const corrAccount = (stored.corrAccount as string).replace(/\s/g, "");
  if (!/^\d{9}$/.test(bik) || !/^\d{20}$/.test(corrAccount)) {
    throw new Error("В сохранённых реквизитах некорректный БИК или корреспондентский счёт. Проверьте полный комплект реквизитов.");
  }

  const requisites = { ...DEFAULT_OPERATOR_REQUISITES };
  for (const key of Object.keys(requisites) as (keyof OperatorRequisites)[]) {
    if (typeof stored[key] === "string") requisites[key] = stored[key];
  }
  requisites.bankAccount = account;
  requisites.bik = bik;
  requisites.corrAccount = corrAccount;
  requisites.bankName = requisites.bankName.trim();
  return requisites;
}
