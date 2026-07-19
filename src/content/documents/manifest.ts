// Raw markdown imports (Vite)
import legalReadinessMd from "./legal-readiness.md?raw";
import personalDataPolicyMd from "./personal-data-policy.md?raw";
import personalDataConsentMd from "./personal-data-consent.md?raw";
import cookiePolicyMd from "./cookie-policy.md?raw";
import freePlanOfferMd from "./free-plan-offer.md?raw";
import paidPlanOfferMd from "./paid-plan-offer.md?raw";
import dpaMd from "./data-processing-addendum.md?raw";
import userAgreementMd from "./user-agreement.md?raw";
import marketingConsentMd from "./marketing-consent.md?raw";

export const OPERATOR = {
  name: "Индивидуальный предприниматель Шафрановский Максим Михайлович",
  short: "ИП Шафрановский М.М.",
  inn: "253615392404",
  ogrnip: "324253600042754",
  rknNumber: "25-24-013414",
  rknUrl:
    "https://pd.rkn.gov.ru/operators-registry/operators-list/?id=25-24-013414",
  email: "support@sintagma.com.ru",
} as const;

export const DOCUMENTS_VERSION = "1.0";
export const DOCUMENTS_UPDATED_AT = "19.07.2026";

export interface PublicDocument {
  slug: string;
  title: string;
  summary: string;
  audience: string;
  version: string;
  updatedAt: string;
  pdfPath: string;
  content: string;
}

export interface DocumentGroup {
  id: "compliance" | "contracts" | "privacy";
  label: string;
  description: string;
  documents: PublicDocument[];
}

export const DOCUMENT_GROUPS: DocumentGroup[] = [
  {
    id: "compliance",
    label: "Клиентам и службам комплаенса",
    description:
      "Обоснование правомерности обработки данных и типовое поручение (DPA) для клиентов-операторов.",
    documents: [
      {
        slug: "legal-readiness",
        title: "Обоснование правомерности обработки персональных данных",
        summary:
          "Статус оператора, принятые документы, ответственность и договорная модель работы с клиентом.",
        audience: "Клиенты, партнёры и службы комплаенса",
        version: DOCUMENTS_VERSION,
        updatedAt: DOCUMENTS_UPDATED_AT,
        pdfPath:
          "/documents/files/01_Обоснование_правомерности_и_готовности.pdf",
        content: legalReadinessMd,
      },
      {
        slug: "data-processing-addendum",
        title: "Поручение на обработку персональных данных",
        summary:
          "Роли сторон, инструкции, данные, меры защиты, инциденты, возврат и уничтожение.",
        audience: "Клиенты-операторы персональных данных",
        version: DOCUMENTS_VERSION,
        updatedAt: DOCUMENTS_UPDATED_AT,
        pdfPath:
          "/documents/files/07_Поручение_на_обработку_персональных_данных_DPA.pdf",
        content: dpaMd,
      },
    ],
  },
  {
    id: "contracts",
    label: "Договоры и правила использования",
    description:
      "Публичные оферты платного и бесплатного тарифов и пользовательское соглашение.",
    documents: [
      {
        slug: "free-plan-offer",
        title: "Договор о безвозмездном предоставлении доступа",
        summary:
          "Безвозмездный смешанный договор: доступ к SaaS, простая лицензия и базовая поддержка.",
        audience:
          "Юридические лица, ИП, самозанятые и профессиональные пользователи",
        version: DOCUMENTS_VERSION,
        updatedAt: DOCUMENTS_UPDATED_AT,
        pdfPath: "/documents/files/05_Публичная_оферта_бесплатный_тариф.pdf",
        content: freePlanOfferMd,
      },
      {
        slug: "paid-plan-offer",
        title: "Договор возмездного предоставления доступа и услуг",
        summary:
          "Абонентский смешанный договор: SaaS-доступ, лицензия, сопровождение, оплата и поручение ПДн.",
        audience:
          "Юридические лица, ИП, самозанятые и профессиональные пользователи",
        version: DOCUMENTS_VERSION,
        updatedAt: DOCUMENTS_UPDATED_AT,
        pdfPath: "/documents/files/06_Публичная_оферта_платный_тариф.pdf",
        content: paidPlanOfferMd,
      },
      {
        slug: "user-agreement",
        title: "Пользовательское соглашение",
        summary:
          "Учётные записи, допустимое использование, контент, безопасность и прекращение доступа.",
        audience:
          "Администраторы, сотрудники, преподаватели и слушатели",
        version: DOCUMENTS_VERSION,
        updatedAt: DOCUMENTS_UPDATED_AT,
        pdfPath: "/documents/files/08_Пользовательское_соглашение.pdf",
        content: userAgreementMd,
      },
    ],
  },
  {
    id: "privacy",
    label: "Персональные данные и приватность",
    description:
      "Политика обработки ПДн, отдельное согласие субъекта, cookie и рассылки.",
    documents: [
      {
        slug: "personal-data-policy",
        title: "Политика в отношении обработки персональных данных",
        summary:
          "Цели, основания, состав данных, сроки, права субъектов и общие меры защиты.",
        audience: "Все посетители, пользователи и представители клиентов",
        version: DOCUMENTS_VERSION,
        updatedAt: DOCUMENTS_UPDATED_AT,
        pdfPath:
          "/documents/files/02_Политика_обработки_персональных_данных.pdf",
        content: personalDataPolicyMd,
      },
      {
        slug: "personal-data-consent",
        title: "Согласие на обработку персональных данных",
        summary:
          "Отдельное информированное согласие, не объединённое с офертой или пользовательским соглашением.",
        audience: "Пользователи и посетители сайта",
        version: DOCUMENTS_VERSION,
        updatedAt: DOCUMENTS_UPDATED_AT,
        pdfPath:
          "/documents/files/03_Согласие_на_обработку_персональных_данных.pdf",
        content: personalDataConsentMd,
      },
      {
        slug: "cookie-policy",
        title: "Политика использования cookie и средств аналитики",
        summary: "Категории cookie, аналитика, согласие и способы отключения.",
        audience: "Посетители сайта",
        version: DOCUMENTS_VERSION,
        updatedAt: DOCUMENTS_UPDATED_AT,
        pdfPath: "/documents/files/04_Политика_cookie_и_аналитики.pdf",
        content: cookiePolicyMd,
      },
      {
        slug: "marketing-consent",
        title:
          "Согласие на получение информационных и рекламных сообщений",
        summary:
          "Отдельный добровольный выбор каналов рассылки с простым отзывом.",
        audience: "Пользователи, желающие получать рассылку",
        version: DOCUMENTS_VERSION,
        updatedAt: DOCUMENTS_UPDATED_AT,
        pdfPath:
          "/documents/files/09_Согласие_на_информационные_и_рекламные_сообщения.pdf",
        content: marketingConsentMd,
      },
    ],
  },
];

export const ALL_DOCUMENTS: PublicDocument[] = DOCUMENT_GROUPS.flatMap(
  (g) => g.documents,
);

export function getDocumentBySlug(slug: string): PublicDocument | undefined {
  return ALL_DOCUMENTS.find((d) => d.slug === slug);
}

// Backward-compatibility mapping for legacy public routes.
export const LEGACY_SLUG_MAP: Record<string, string> = {
  "public-offer": "paid-plan-offer",
  "student-agreement": "user-agreement",
  privacy: "personal-data-policy",
  "personal-data": "personal-data-policy",
};
