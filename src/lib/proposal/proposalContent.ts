import { SUBSCRIPTION_PLANS, YEARLY_DISCOUNT, formatStorageSize } from "@/constants/subscriptionPlans";
import { PLAN_ORDER, formatPriceRu } from "@/lib/pricingFeatureRows";

export const PROPOSAL_PDF_FILE_NAME = "SINTAGMA-commercial-proposal-2026.pdf";
export const PROPOSAL_ONLINE_PATH = "/proposal/platform";

export const PROPOSAL_CONTACTS = {
  site: "sintagma.com.ru",
  siteUrl: "https://sintagma.com.ru",
  email: "support@sintagma.com.ru",
  executor: "ИП Шафрановский Максим Михайлович",
  inn: "253615392404",
};

export const PROPOSAL_LEGAL_LINKS = [
  { label: "Договор возмездного доступа", href: "/documents/paid-plan-offer" },
  { label: "Договор безвозмездного доступа", href: "/documents/free-plan-offer" },
  { label: "Пользовательское соглашение", href: "/documents/user-agreement" },
  { label: "Политика обработки персональных данных", href: "/documents/personal-data-policy" },
  { label: "Поручение на обработку ПДн", href: "/documents/data-processing-addendum" },
];

/** Единая формулировка сроков запуска. */
export const PROPOSAL_LAUNCH_PROMISE = "Поможем запустить за 7 дней";

/** Сценарий работы учебного центра в платформе. */
export const PROPOSAL_WORKFLOW: { step: string; title: string; text: string }[] = [
  {
    step: "1",
    title: "Курс",
    text: "Собираете программу из блоков или берёте готовую из библиотеки. ИИ помогает подготовить материал и озвучку.",
  },
  {
    step: "2",
    title: "Группа и ученики",
    text: "Заводите группу, импортируете список из Excel или открываете ссылку на самостоятельную регистрацию.",
  },
  {
    step: "3",
    title: "Обучение",
    text: "Ученик проходит уроки и тесты в личном кабинете, вы видите прогресс, попытки и итоговые результаты.",
  },
  {
    step: "4",
    title: "Документы и журналы",
    text: "Договоры, приказы, протоколы, журналы и удостоверения формируются из шаблонов по данным группы.",
  },
  {
    step: "5",
    title: "Подготовка ФИС ФРДО",
    text: "Платформа проверяет и подготавливает данные и файл к выгрузке в ФИС ФРДО, показывая ошибки до отправки.",
  },
];

/** Ключевые модули. Формулировки соответствуют фактическим возможностям. */
export const PROPOSAL_MODULES: { title: string; text: string; plans?: string }[] = [
  {
    title: "Конструктор курсов и ИИ",
    text: "Уроки, видео, лонгриды, тесты и домашние задания. ИИ-генерация материалов и озвучка.",
    plans: "Все тарифы",
  },
  {
    title: "Ученики, группы, компании",
    text: "Импорт из Excel, ссылки регистрации, контроль прогресса, отчёты и напоминания.",
    plans: "Все тарифы",
  },
  {
    title: "Документы и журналы",
    text: "Шаблоны договоров, приказов, протоколов и журналов. Простая электронная подпись (63-ФЗ).",
    plans: "Все тарифы",
  },
  {
    title: "Подготовка ФИС ФРДО",
    text: "Проверка и подготовка данных и файла к выгрузке. На тарифе «Профессиональный» — ФРДО+: выгружаем за вас.",
    plans: "Все тарифы · ФРДО+ на «Профессиональном»",
  },
  {
    title: "Email-рассылки",
    text: "Свой SMTP и IMAP, импорт базы из CSV и XLSX, переменные, тестовая отправка, отчёты и публичная ссылка на отчёт.",
    plans: "От «Старта»",
  },
  {
    title: "CRM и продажи",
    text: "Лиды, сделки, коммерческие предложения, договоры и счета в одном кабинете.",
    plans: "От «Стандарта»",
  },
  {
    title: "Вебинары и видеосервис+",
    text: "Прямые эфиры и загрузка больших видеофайлов.",
    plans: "Тариф «Профессиональный»",
  },
  {
    title: "Брендирование и мобильный доступ",
    text: "Логотип, цвета, свой домен, адаптивные кабинеты ученика и организации.",
    plans: "Все тарифы",
  },
];

export interface PublicPlanSummary {
  id: string;
  name: string;
  description: string;
  price: number;
  priceLabel: string;
  yearlyLabel: string | null;
  courses: string;
  students: string;
  trainedPerMonth: string;
  storage: string;
  features: string[];
  recommended: boolean;
}

const limitLabel = (n: number) => (n === -1 ? "Безлимит" : String(n));

/**
 * Публичные тарифы строятся только из PLAN_ORDER + SUBSCRIPTION_PLANS —
 * при изменении источника КП и презентация обновляются автоматически.
 */
export function getPublicPlanSummaries(): PublicPlanSummary[] {
  return PLAN_ORDER.map((id) => {
    const plan = SUBSCRIPTION_PLANS[id];
    const l = plan.limits;
    const features: string[] = [
      "Курсы, тесты, домашние задания",
      "ИИ-генерация и озвучка",
      "Документы, журналы, ПЭП",
      l.frdoEnabled
        ? id === "professional"
          ? "ФИС ФРДО+ — выгружаем за вас"
          : "ФИС ФРДО — подготовка данных и файла"
        : "",
      l.emailCampaignsEnabled ? "Email-рассылки со своего SMTP" : "",
      l.salesCrmEnabled ? "CRM и продажи" : "",
      l.webinarsEnabled ? "Вебинары" : "",
      l.videoServicePlus ? "Видеосервис+" : "",
      l.trainersEnabled
        ? id === "professional"
          ? "3D-тренажёры — за дополнительную плату"
          : "3D-тренажёры"
        : "",
    ].filter(Boolean) as string[];

    return {
      id,
      name: plan.name,
      description: plan.description,
      price: plan.price,
      priceLabel: plan.price === 0 ? "0 ₽" : `${formatPriceRu(plan.price)} ₽/мес`,
      yearlyLabel:
        plan.price === 0
          ? null
          : `при оплате за год — ${formatPriceRu(Math.round(plan.price * (1 - YEARLY_DISCOUNT)))} ₽/мес`,
      courses: limitLabel(l.maxCourses),
      students: limitLabel(l.maxStudents),
      trainedPerMonth: limitLabel(l.maxTrainedPerMonth),
      storage: l.storageBytes === -1 ? "Безлимит" : formatStorageSize(l.storageBytes),

      features,
      recommended: id === "standard",
    };
  });
}

/** Минимальная цена платного тарифа — для партнёрских расчётов и текстов. */
export function getEntryPaidPlan(): PublicPlanSummary {
  const paid = getPublicPlanSummaries().filter((p) => p.price > 0);
  return paid.reduce((min, p) => (p.price < min.price ? p : min), paid[0]);
}

export const PROPOSAL_CONDITIONS = [
  "Оплата по месяцам или за год со скидкой 15%.",
  "Бесплатный тариф работает постоянно — без карты и без срока.",
  "Помощь с переносом материалов и настройкой брендирования.",
  "Договор-оферта на платформе, закрывающие документы для бухгалтерии.",
];

export const PROPOSAL_NEXT_STEPS = [
  "Регистрируете организацию на бесплатном тарифе.",
  "Согласуем демонстрацию и разбираем ваши процессы.",
  "Переносим программы, настраиваем документы и шаблоны.",
  "Запускаем первую группу — поможем запустить за 7 дней.",
];
