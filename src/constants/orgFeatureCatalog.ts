import {
  Palette, Video, FileCheck, Brain, FileSpreadsheet, ClipboardList,
  HardHat, ShoppingCart, Sparkles, Cpu, Boxes, Users2, BookOpen,
  type LucideIcon,
} from "lucide-react";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan, type PlanLimits } from "./subscriptionPlans";

/**
 * Единый реестр функций организации.
 * Источник правды для:
 *  - админ-панели (Индивидуальные возможности)
 *  - useSubscriptionLimits (override флагов лимитов)
 *  - SubscriptionTab (плашка «доступно на старших тарифах», сравнение тарифов)
 */
export interface OrgFeatureDef {
  /** Уникальный ключ, сохраняется в organizations.custom_enabled_categories */
  key: string;
  /** UI-название */
  label: string;
  /** Краткое описание для карточек/тултипов */
  description: string;
  /** Иконка lucide */
  icon: LucideIcon;
  /** Минимальный тариф, на котором функция доступна по умолчанию */
  minPlan: SubscriptionPlan;
  /** Флаг в plan.limits, который должен включаться при индивидуальном включении */
  planFlag?: keyof PlanLimits;
  /** Категория в plan.enabledCategories — для категорий разделов меню/функций */
  category?: string;
  /** Ссылка на лендинг функции (для подсказок) */
  link?: string;
}

export const ORG_FEATURE_CATALOG: OrgFeatureDef[] = [
  {
    key: "kinescope",
    label: "Видеосервис+",
    description: "Загрузка видео >2 ГБ через защищённый видеохостинг",
    icon: Video,
    minPlan: "professional",
    planFlag: "kinescopeEnabled",
    link: "/feature/video-service",
  },
  {
    key: "video_service_plus",
    label: "Видео >2 ГБ",
    description: "Снятие лимита 2 ГБ при прямой загрузке видео",
    icon: Video,
    minPlan: "professional",
    planFlag: "videoServicePlus",
  },
  {
    key: "webinars",
    label: "Вебинары",
    description: "Проведение онлайн-вебинаров и трансляций",
    icon: Users2,
    minPlan: "professional",
    category: "webinars",
    link: "/feature/webinars",
  },
  {
    key: "frdo",
    label: "ФИС ФРДО",
    description: "Автоматическая отчётность в федеральный реестр",
    icon: FileSpreadsheet,
    minPlan: "free",
    category: "frdo",
    planFlag: "frdoEnabled",
    link: "/feature/frdo",
  },
  {
    key: "labor_safety",
    label: "Охрана труда",
    description: "Изолированный модуль обучения по охране труда",
    icon: HardHat,
    minPlan: "professional",
    category: "labor_safety",
    link: "/feature/labor-safety",
  },
  {
    key: "journals",
    label: "Журналы",
    description: "Автогенерация журналов посещаемости и оценок",
    icon: ClipboardList,
    minPlan: "professional",
    category: "journals",
  },
  {
    key: "documents",
    label: "Документооборот",
    description: "Полный цикл документов организации",
    icon: FileSpreadsheet,
    minPlan: "professional",
    category: "documents",
    link: "/feature/documents",
  },
  {
    key: "services",
    label: "Магазин курсов",
    description: "Продажа и покупка курсов на маркетплейсе",
    icon: ShoppingCart,
    minPlan: "professional",
    category: "services",
    link: "/feature/course-store",
  },
  {
    key: "3d_trainers",
    label: "3D-тренажёры",
    description: "Интерактивные 3D-тренажёры для обучения",
    icon: Boxes,
    minPlan: "maximum",
    category: "3d_trainers",
    planFlag: "trainersEnabled",
  },
  {
    key: "branding",
    label: "Брендирование",
    description: "Логотип и цвета вашей организации в портале ученика",
    icon: Palette,
    minPlan: "standard",
    planFlag: "branding",
    link: "/feature/branding",
  },
  {
    key: "video_id",
    label: "Видео-идентификация",
    description: "Автоматическая проверка личности ученика",
    icon: Video,
    minPlan: "standard",
    planFlag: "videoIdentification",
    link: "/feature/video-id",
  },
  {
    key: "document_checklist",
    label: "Чек-лист документов",
    description: "100% контроль документов при зачислении",
    icon: FileCheck,
    minPlan: "standard",
    planFlag: "documentChecklist",
    link: "/feature/document-checklist",
  },
  {
    key: "ai_generation",
    label: "ИИ-генерация",
    description: "Создание контента курсов с помощью ИИ",
    icon: Brain,
    minPlan: "free",
    planFlag: "aiEnabled",
    link: "/feature/ai-courses",
  },
];

const PLAN_ORDER: SubscriptionPlan[] = ["free", "start", "standard", "professional", "maximum"];

/**
 * Доступна ли функция для организации:
 *   - либо тариф уже её включает,
 *   - либо она явно включена админом (custom_enabled_categories).
 */
export function isFeatureAvailable(
  feature: OrgFeatureDef,
  plan: SubscriptionPlan,
  customEnabledCategories: string[] = [],
): boolean {
  if (customEnabledCategories.includes(feature.key)) return true;
  return PLAN_ORDER.indexOf(plan) >= PLAN_ORDER.indexOf(feature.minPlan);
}

/** Найти определение функции по ключу. */
export function getFeatureByKey(key: string): OrgFeatureDef | undefined {
  return ORG_FEATURE_CATALOG.find((f) => f.key === key);
}

/** Список ключей-категорий (раздел/меню), включаемых через `category`. */
export function getCategoryKeys(): string[] {
  return ORG_FEATURE_CATALOG
    .filter((f) => f.category)
    .map((f) => f.category as string);
}

/** Минимальный план для функции — для отображения «доступно на тарифе X». */
export function getMinPlanInfo(feature: OrgFeatureDef) {
  return SUBSCRIPTION_PLANS[feature.minPlan];
}
