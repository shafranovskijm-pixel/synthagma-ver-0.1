import React from "react";
import {
  Shield, Mail, Bot, FileText, Terminal,
  Component, Layers, Layout, Zap, FileCode,
  XCircle, AlertTriangle, Info, Building2,
} from "lucide-react";

// ─── Code Tree ──────────────────────────────────────────────────
export interface CodeSubfolder {
  name: string;
  files: number;
  lines: number;
}

export interface CodeTreeGroup {
  folder: string;
  icon: React.ReactNode;
  color: string;
  subfolders: CodeSubfolder[];
  totalFiles: number;
  totalLines: number;
}

export const CODE_TREE: CodeTreeGroup[] = [
  {
    folder: "src/components/",
    icon: React.createElement(Component, { className: "w-4 h-4" }),
    color: "#8b5cf6",
    subfolders: [
      { name: "admin/ (devtools, analytics, billing, marketplace)", files: 69, lines: 24354 },
      { name: "organization/ (tabs, dialogs, journals, документы)", files: 118, lines: 45107 },
      { name: "student/ (dashboard, games, video-id)", files: 20, lines: 4699 },
      { name: "landing/", files: 14, lines: 3405 },
      { name: "course-builder/ (block-editor, sortable, test)", files: 20, lines: 6321 },
      { name: "course-editor/", files: 5, lines: 1806 },
      { name: "course-learning/ (плееры и вьюеры)", files: 4, lines: 883 },
      { name: "course-landing/", files: 14, lines: 1595 },
      { name: "onboarding/", files: 4, lines: 489 },
      { name: "ui/", files: 46, lines: 3768 },
      { name: "company/", files: 7, lines: 1380 },
      { name: "shared/", files: 1, lines: 23 },
    ],
    totalFiles: 322,
    totalLines: 93897,
  },
  {
    folder: "src/hooks/",
    icon: React.createElement(Layers, { className: "w-4 h-4" }),
    color: "#0ea5e9",
    subfolders: [
      { name: "useCourseLearning (логика обучения)", files: 1, lines: 520 },
      { name: "useCourseBuilder (логика конструктора)", files: 1, lines: 660 },
      { name: "useBulkPipeline (массовая генерация)", files: 1, lines: 682 },
      { name: "useEducationDocumentsJournal", files: 1, lines: 628 },
      { name: "useContractGenerator", files: 1, lines: 523 },
      { name: "useAdminMarketplace", files: 1, lines: 609 },
      { name: "useCourseStoreManager", files: 1, lines: 531 },
      { name: "useAuth, useOrganization, useDashboardSettings и др.", files: 12, lines: 2400 },
      { name: "useStudents, useCourses, useStore и др.", files: 18, lines: 3600 },
      { name: "useOrgDashboard (Context), course-learning/", files: 5, lines: 1200 },
      { name: "Остальные хуки", files: 28, lines: 5368 },
    ],
    totalFiles: 79,
    totalLines: 17748,
  },
  {
    folder: "src/pages/",
    icon: React.createElement(Layout, { className: "w-4 h-4" }),
    color: "#f59e0b",
    subfolders: [
      { name: "CoursePreview (1248 строк)", files: 1, lines: 1248 },
      { name: "PlatformPresentation (837)", files: 1, lines: 837 },
      { name: "CourseEditor (785)", files: 1, lines: 785 },
      { name: "StudentProfile (711)", files: 1, lines: 711 },
      { name: "CourseLandingEditor (704)", files: 1, lines: 704 },
      { name: "PartnerLanding, RegisterOrg, Features, Blog", files: 4, lines: 2431 },
      { name: "CourseLearning (554 — оптимизирован)", files: 1, lines: 554 },
      { name: "Остальные страницы", files: 48, lines: 10596 },
    ],
    totalFiles: 58,
    totalLines: 18020,
  },
  {
    folder: "supabase/functions/",
    icon: React.createElement(Zap, { className: "w-4 h-4" }),
    color: "#10b981",
    subfolders: [
      { name: "Auth & Users (register, create, reset, update)", files: 9, lines: 2400 },
      { name: "Notifications (email, telegram, reminders)", files: 10, lines: 2600 },
      { name: "AI / Generation (course, lesson, blog, explanation)", files: 9, lines: 3200 },
      { name: "Documents & Import (contract, course, skillspace)", files: 8, lines: 2200 },
      { name: "Media (kinescope-*, elevenlabs, salutespeech)", files: 5, lines: 1400 },
      { name: "Payments (robokassa-*, referral)", files: 3, lines: 800 },
      { name: "System (secrets, smtp, dadata, storage, subscription)", files: 7, lines: 1600 },
      { name: "Content (review, seed, convert, migrate)", files: 8, lines: 1461 },
    ],
    totalFiles: 60,
    totalLines: 15761,
  },
  {
    folder: "src/utils/",
    icon: React.createElement(FileCode, { className: "w-4 h-4" }),
    color: "#ef4444",
    subfolders: [
      { name: "Excel, Word, PDF, Helpers", files: 31, lines: 3556 },
    ],
    totalFiles: 31,
    totalLines: 3556,
  },
];

export const TOTAL_FILES = CODE_TREE.reduce((a, g) => a + g.totalFiles, 0);
export const TOTAL_LINES = CODE_TREE.reduce((a, g) => a + g.totalLines, 0);

// ─── Largest Files ──────────────────────────────────────────────
export interface LargeFile {
  path: string;
  lines: number;
  status: "optimized" | "needs-work" | "ok";
  note?: string;
}

export const LARGEST_FILES: LargeFile[] = [
  { path: "src/components/admin/OrganizationDetailsView.tsx", lines: 1790, status: "needs-work", note: "Было 1969. Убраны баланс, документы, настройки ИИ. Ещё нужна декомпозиция." },
  { path: "src/components/organization/tabs/CoursesTab.tsx", lines: 1747, status: "needs-work", note: "Критично. Вынести логику в хук, разбить UI." },
  { path: "src/components/course-builder/block-editor/BlockEditorMain.tsx", lines: 1461, status: "needs-work", note: "Разбить на BlockToolbar, BlockCanvas, BlockProperties." },
  { path: "src/components/admin/AdminAnalytics.tsx", lines: 1435, status: "needs-work", note: "Вынести графики в отдельные компоненты." },
  { path: "src/components/organization/dialogs/CourseDetailsModal.tsx", lines: 1416, status: "needs-work", note: "Разбить на табы-компоненты." },
  { path: "src/components/organization/LaborSafetyStudentDetailCard.tsx", lines: 1295, status: "needs-work", note: "Декомпозиция на секции." },
  { path: "src/components/organization/SelfExaminationQuiz.tsx", lines: 1250, status: "needs-work", note: "Вынести логику в хук." },
  { path: "src/pages/CoursePreview.tsx", lines: 1248, status: "needs-work", note: "Разбить на preview-компоненты." },
  { path: "src/components/organization/AutoDocumentRegistrationJournal.tsx", lines: 1246, status: "needs-work", note: "Логика в хук, UI в подкомпоненты." },
  { path: "src/components/organization/tabs/StudentsTab.tsx", lines: 1186, status: "needs-work", note: "Вынести таблицу и фильтры." },
  { path: "src/components/admin/OrganizationsManager.tsx", lines: 1174, status: "needs-work", note: "Декомпозиция: таблица + диалоги." },
  { path: "src/components/organization/OrgDocumentsManager.tsx", lines: 1092, status: "needs-work", note: "Разбить по типам документов." },
  { path: "src/components/organization/tabs/DocumentsTab.tsx", lines: 1039, status: "needs-work", note: "Вынести секции в подкомпоненты." },
  { path: "src/components/admin/ContentGeneratorTab.tsx", lines: 1010, status: "needs-work", note: "Вынести форму и результат." },
  { path: "src/components/organization/dialogs/CompanyDetailDialog.tsx", lines: 974, status: "needs-work", note: "Разбить на табы." },
  { path: "src/components/admin/AISettingsManager.tsx", lines: 896, status: "needs-work", note: "Вынести секции настроек." },
  { path: "src/components/admin/BulkContentGenerator.tsx", lines: 890, status: "needs-work", note: "Логика уже в хуке, разбить UI." },
  { path: "src/components/organization/InvoiceGenerator.tsx", lines: 849, status: "needs-work", note: "Вынести preview и форму." },
  { path: "src/components/organization/JournalsManager.tsx", lines: 841, status: "needs-work", note: "Декомпозиция по типам журналов." },
  { path: "src/components/organization/ConsentGenerator.tsx", lines: 838, status: "needs-work", note: "Вынести шаблоны и preview." },
  { path: "src/pages/PlatformPresentation.tsx", lines: 837, status: "needs-work", note: "Разбить на slide-компоненты." },
  { path: "src/components/admin/AdminBillingOverview.tsx", lines: 827, status: "needs-work", note: "Вынести таблицы и фильтры." },
  { path: "src/components/organization/CourseDetailsContent.tsx", lines: 824, status: "needs-work", note: "Разбить на секции." },
  { path: "src/components/organization/ActGenerator.tsx", lines: 824, status: "needs-work", note: "Вынести preview и форму." },
  { path: "src/components/organization/CopiesDuplicatesJournal.tsx", lines: 819, status: "needs-work", note: "Логика в хук." },
  { path: "src/components/organization/AutoFinalAttestationJournal.tsx", lines: 802, status: "needs-work", note: "Логика в хук." },
  { path: "src/pages/CourseLearning.tsx", lines: 554, status: "optimized", note: "Было 2758. Логика в useCourseLearning." },
  { path: "src/hooks/useBulkPipeline.ts", lines: 682, status: "ok", note: "Хук — допустимый размер для сложной логики." },
  { path: "src/hooks/useCourseBuilder.ts", lines: 660, status: "ok", note: "Хук — допустимый размер." },
];

// ─── Dependency Stats ───────────────────────────────────────────
export interface DepStat {
  name: string;
  category: string;
  sizeKb: number;
  loadStrategy: "static" | "dynamic" | "lazy";
}

export const KEY_DEPENDENCIES: DepStat[] = [
  { name: "react + react-dom", category: "core", sizeKb: 130, loadStrategy: "static" },
  { name: "@supabase/supabase-js", category: "backend", sizeKb: 85, loadStrategy: "static" },
  { name: "recharts", category: "charts", sizeKb: 220, loadStrategy: "lazy" },
  { name: "@radix-ui/*", category: "ui", sizeKb: 180, loadStrategy: "lazy" },
  { name: "xlsx", category: "documents", sizeKb: 800, loadStrategy: "dynamic" },
  { name: "mammoth", category: "documents", sizeKb: 200, loadStrategy: "dynamic" },
  { name: "pdfjs-dist", category: "documents", sizeKb: 400, loadStrategy: "dynamic" },
  { name: "framer-motion", category: "animation", sizeKb: 120, loadStrategy: "static" },
  { name: "docx-templates", category: "documents", sizeKb: 90, loadStrategy: "dynamic" },
  { name: "dompurify", category: "security", sizeKb: 25, loadStrategy: "static" },
];

// ─── Code Quality Metrics ───────────────────────────────────────
export interface QualityMetric {
  label: string;
  value: number;
  max: number;
  unit: string;
  status: "good" | "warning" | "critical";
}

export const QUALITY_METRICS: QualityMetric[] = [
  { label: "Средний размер файла", value: Math.round(TOTAL_LINES / TOTAL_FILES), max: 300, unit: "строк", status: Math.round(TOTAL_LINES / TOTAL_FILES) > 300 ? "warning" : "good" },
  { label: "Крупнейший файл", value: 1790, max: 500, unit: "строк", status: "critical" },
  { label: "Файлов >800 строк", value: 28, max: 0, unit: "штук", status: "critical" },
  { label: "Файлов >500 строк", value: 69, max: 10, unit: "штук", status: "critical" },
  { label: "Покрытие тестами", value: 10, max: 50, unit: "файлов", status: "warning" },
  { label: "Lazy-loaded страниц", value: 58, max: 58, unit: `из ${58}`, status: "good" },
  { label: "Dynamic imports", value: 4, max: 4, unit: "библиотек", status: "good" },
  { label: "Кастомные хуки", value: 79, max: 100, unit: "штук", status: "good" },
  { label: "Context Coverage", value: 85, max: 100, unit: "%", status: "good" },
  { label: "Edge-функции", value: 60, max: 60, unit: "штук", status: "good" },
  { label: "Таблиц в БД", value: 118, max: 150, unit: "штук", status: "good" },
];

// ─── Edge Functions ─────────────────────────────────────────────
export interface EdgeFunc {
  name: string;
  category: string;
  description: string;
}

export const EDGE_FUNCTIONS: EdgeFunc[] = [
  // Auth & Users
  { name: "register-student", category: "auth", description: "Регистрация студента" },
  { name: "create-org-user", category: "auth", description: "Создание пользователя организации" },
  { name: "create-company-user", category: "auth", description: "Создание пользователя компании" },
  { name: "create-sales-manager", category: "auth", description: "Создание менеджера продаж" },
  { name: "reset-org-password", category: "auth", description: "Сброс пароля организации" },
  { name: "reset-student-password", category: "auth", description: "Сброс пароля студента" },
  { name: "generate-org-credentials", category: "auth", description: "Генерация учётных данных" },
  { name: "update-org-credentials", category: "auth", description: "Обновление учётных данных орг." },
  { name: "update-student-credentials", category: "auth", description: "Обновление учётных данных студ." },
  // Notifications
  { name: "send-email", category: "notifications", description: "Отправка email" },
  { name: "send-credentials", category: "notifications", description: "Отправка учётных данных" },
  { name: "send-password-reset", category: "notifications", description: "Отправка ссылки сброса" },
  { name: "send-course-invitation", category: "notifications", description: "Приглашение на курс" },
  { name: "send-documents-reminder", category: "notifications", description: "Напоминание о документах" },
  { name: "send-telegram-notification", category: "notifications", description: "Telegram уведомление" },
  { name: "notify-course-completion", category: "notifications", description: "Уведомление о завершении курса" },
  { name: "notify-course-order", category: "notifications", description: "Уведомление о заказе курса" },
  { name: "notify-order-status", category: "notifications", description: "Статус заказа" },
  { name: "notify-program-order", category: "notifications", description: "Заказ программы" },
  { name: "process-reminders", category: "notifications", description: "Обработка напоминаний" },
  { name: "handle-email-action", category: "notifications", description: "Обработка email-действий" },
  // AI / Generation
  { name: "generate-course-structure", category: "ai", description: "Генерация структуры курса" },
  { name: "generate-course-content", category: "ai", description: "Генерация контента курса" },
  { name: "generate-lesson-content", category: "ai", description: "Генерация контента урока" },
  { name: "generate-blog-post", category: "ai", description: "Генерация блог-поста" },
  { name: "generate-explanation", category: "ai", description: "Генерация объяснения" },
  { name: "generate-self-examination-report", category: "ai", description: "Отчёт самообследования" },
  { name: "generate-achievements", category: "ai", description: "Генерация достижений" },
  { name: "generate-cover", category: "ai", description: "Генерация обложки" },
  { name: "generate-image", category: "ai", description: "Генерация изображения" },
  { name: "generate-seo", category: "ai", description: "Генерация SEO-контента" },
  { name: "gigachat", category: "ai", description: "GigaChat API прокси" },
  { name: "student-chat", category: "ai", description: "AI-чат студента" },
  { name: "review-course", category: "ai", description: "AI-ревью курса" },
  { name: "bulk-pipeline", category: "ai", description: "Массовая генерация контента" },
  // Documents & Import
  { name: "process-contract-template", category: "documents", description: "Обработка шаблона договора" },
  { name: "import-course", category: "documents", description: "Импорт курса" },
  { name: "get-test-results", category: "documents", description: "Получение результатов теста" },
  { name: "grade-test", category: "documents", description: "Оценка теста" },
  { name: "parse-skillspace-course", category: "documents", description: "Парсинг курса SkillSpace" },
  { name: "batch-skillspace-import", category: "documents", description: "Массовый импорт из SkillSpace" },
  { name: "reimport-skillspace-batch", category: "documents", description: "Реимпорт пакета SkillSpace" },
  { name: "convert-lesson-content", category: "documents", description: "Конвертация контента урока" },
  { name: "seed-welcome-course", category: "documents", description: "Создание приветственного курса" },
  // Media
  { name: "elevenlabs-tts", category: "media", description: "Text-to-Speech (ElevenLabs)" },
  { name: "salutespeech-tts", category: "media", description: "Text-to-Speech (SaluteSpeech)" },
  { name: "kinescope-proxy", category: "media", description: "Kinescope API прокси" },
  { name: "kinescope-drm-auth", category: "media", description: "Kinescope DRM авторизация" },
  { name: "kinescope-migrate-videos", category: "media", description: "Миграция видео в Kinescope" },
  { name: "migrate-course-media", category: "media", description: "Миграция медиа курса" },
  // Payments
  { name: "robokassa-init", category: "payments", description: "Инициализация платежа Robokassa" },
  { name: "robokassa-result", category: "payments", description: "Callback результата Robokassa" },
  { name: "referral-commission", category: "payments", description: "Реферальная комиссия" },
  // System
  { name: "test-smtp", category: "system", description: "Тестирование SMTP" },
  { name: "dadata-company", category: "system", description: "Поиск компании через DaData" },
  { name: "get-external-storage-config", category: "system", description: "Конфигурация хранилища" },
  { name: "check-secrets-status", category: "system", description: "Проверка статуса секретов" },
  { name: "check-subscription-expiry", category: "system", description: "Проверка истечения подписки" },
  { name: "manage-secret", category: "system", description: "Управление секретами" },
];

export const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode; color: string; bgClass: string }> = {
  auth: { label: "Авторизация", icon: React.createElement(Shield, { className: "w-3.5 h-3.5" }), color: "#8b5cf6", bgClass: "bg-violet-500" },
  notifications: { label: "Уведомления", icon: React.createElement(Mail, { className: "w-3.5 h-3.5" }), color: "#0ea5e9", bgClass: "bg-sky-500" },
  ai: { label: "AI / Генерация", icon: React.createElement(Bot, { className: "w-3.5 h-3.5" }), color: "#10b981", bgClass: "bg-emerald-500" },
  documents: { label: "Документы", icon: React.createElement(FileText, { className: "w-3.5 h-3.5" }), color: "#f59e0b", bgClass: "bg-amber-500" },
  media: { label: "Медиа", icon: React.createElement(Component, { className: "w-3.5 h-3.5" }), color: "#ec4899", bgClass: "bg-pink-500" },
  payments: { label: "Платежи", icon: React.createElement(Building2, { className: "w-3.5 h-3.5" }), color: "#f97316", bgClass: "bg-orange-500" },
  system: { label: "Система", icon: React.createElement(Terminal, { className: "w-3.5 h-3.5" }), color: "#64748b", bgClass: "bg-slate-500" },
};

// ─── Recommendations System ─────────────────────────────────────
export type RecSeverity = "error" | "warn" | "info";
export type RecCategory = "database" | "code" | "architecture" | "performance";
export type RecStatus = "unchecked" | "checked" | "applied" | "skipped";

export interface Recommendation {
  id: string;
  severity: RecSeverity;
  category: RecCategory;
  title: string;
  detail: string;
  actionable: boolean;
  status: RecStatus;
}

export const CODE_RECOMMENDATIONS: Recommendation[] = [
  // ── Критичные проблемы ──
  {
    id: "org-details-view",
    severity: "error",
    category: "architecture",
    title: "⚠️ OrganizationDetailsView — 1790 строк",
    detail: "Было 1969. Убраны баланс, документы, закрывающие, настройки ИИ/ФРДО/лимиты. Ещё нужна декомпозиция: табы → подкомпоненты, логика → хук, Context.",
    actionable: true,
    status: "checked",
  },
  {
    id: "courses-tab",
    severity: "error",
    category: "architecture",
    title: "⚠️ CoursesTab — 1747 строк",
    detail: "Вынести логику фильтрации/сортировки в хук, таблицу и диалоги — в подкомпоненты.",
    actionable: true,
    status: "unchecked",
  },
  {
    id: "block-editor",
    severity: "error",
    category: "architecture",
    title: "⚠️ BlockEditorMain — 1461 строк",
    detail: "Разбить на BlockToolbar, BlockCanvas, BlockProperties. Вынести drag-n-drop логику.",
    actionable: true,
    status: "unchecked",
  },
  {
    id: "admin-analytics",
    severity: "error",
    category: "architecture",
    title: "⚠️ AdminAnalytics — 1435 строк",
    detail: "Каждый график — отдельный компонент. Фильтры вынести.",
    actionable: true,
    status: "unchecked",
  },
  {
    id: "large-files-count",
    severity: "error",
    category: "architecture",
    title: "⚠️ 28 файлов > 800 строк",
    detail: "Проект содержит 28 файлов более 800 строк и 69 файлов более 500 строк. Целевой максимум — 500 строк на файл.",
    actionable: true,
    status: "unchecked",
  },
  // ── Предупреждения ──
  {
    id: "test-coverage",
    severity: "warn",
    category: "code",
    title: "⚠️ Покрытие тестами — 10 из 533 файлов",
    detail: "Менее 2% файлов покрыто тестами. Приоритет: хуки с бизнес-логикой (useCourseBuilder, useBulkPipeline).",
    actionable: true,
    status: "unchecked",
  },
  {
    id: "org-components-size",
    severity: "warn",
    category: "architecture",
    title: "⚠️ organization/ — 45K строк в 118 файлах",
    detail: "Самый большой раздел. Рассмотреть разбиение на подмодули: journals/, generators/, tabs/.",
    actionable: true,
    status: "unchecked",
  },
  // ── Выполненные оптимизации ──
  {
    id: "course-learning-optimized",
    severity: "info",
    category: "architecture",
    title: "✅ CourseLearning оптимизирован (2758 → 554)",
    detail: "Логика в useCourseLearning, плееры в компонентах.",
    actionable: false,
    status: "applied",
  },
  {
    id: "hooks-migration",
    severity: "info",
    category: "code",
    title: "✅ 79 кастомных хуков создано",
    detail: "Бизнес-логика изолирована: useCourseBuilder, useBulkPipeline, useContractGenerator, useEducationDocumentsJournal и др.",
    actionable: false,
    status: "applied",
  },
  {
    id: "org-details-cleanup",
    severity: "info",
    category: "architecture",
    title: "✅ OrganizationDetailsView очищен (1969→1790)",
    detail: "Убраны устаревшие вкладки: баланс, документы, закрывающие. Из настроек убраны ИИ-помощник, ФИС ФРДО, лимиты ресурсов.",
    actionable: false,
    status: "applied",
  },
  {
    id: "backdrop-blur-fix",
    severity: "info",
    category: "performance",
    title: "✅ backdrop-blur артефакты исправлены",
    detail: "Убран backdrop-blur-sm из 3 сайдбаров (OrgSidebar, OrgSettingsSidebar, StudentSidebar) — устранены полосы помехи.",
    actionable: false,
    status: "applied",
  },
  {
    id: "context-optimization",
    severity: "info",
    category: "architecture",
    title: "✅ Context Coverage — 85%",
    detail: "OrganizationDashboard и OrgSidebar на Context, prop-drilling устранен.",
    actionable: false,
    status: "applied",
  },
  {
    id: "lazy-loading",
    severity: "info",
    category: "performance",
    title: "✅ React.lazy() на всех страницах",
    detail: "Все 58 страниц загружаются лениво.",
    actionable: false,
    status: "applied",
  },
  {
    id: "bundle-size",
    severity: "info",
    category: "performance",
    title: "✅ Динамический импорт библиотек",
    detail: "xlsx, mammoth, pdfjs грузятся только при необходимости.",
    actionable: false,
    status: "applied",
  },
  {
    id: "edge-functions-growth",
    severity: "info",
    category: "architecture",
    title: "✅ 60 edge-функций развёрнуто",
    detail: "Auth (9), Notifications (12), AI (15), Documents (9), Media (6), Payments (3), System (6).",
    actionable: false,
    status: "applied",
  },
  {
    id: "error-boundary",
    severity: "info",
    category: "architecture",
    title: "✅ Глобальный Error Boundary",
    detail: "Отлавливает ошибки рендера и логирует их в БД.",
    actionable: false,
    status: "applied",
  },
];

export const SEVERITY_CONFIG: Record<RecSeverity, { icon: React.ReactNode; color: string; bg: string; border: string; label: string }> = {
  error: { icon: React.createElement(XCircle, { className: "w-4 h-4" }), color: "text-red-500", bg: "bg-red-500/5", border: "border-red-500/30", label: "Критично" },
  warn: { icon: React.createElement(AlertTriangle, { className: "w-4 h-4" }), color: "text-yellow-500", bg: "bg-yellow-500/5", border: "border-yellow-500/30", label: "Внимание" },
  info: { icon: React.createElement(Info, { className: "w-4 h-4" }), color: "text-blue-500", bg: "bg-blue-500/5", border: "border-blue-500/30", label: "Инфо" },
};

export const CATEGORY_LABELS: Record<RecCategory, string> = {
  database: "База данных",
  code: "Код",
  architecture: "Архитектура",
  performance: "Производительность",
};

export interface CodeAnalysisItem {
  id: string;
  severity: RecSeverity;
  title: string;
  category: string;
  detail: string;
  suggestion?: string;
}
