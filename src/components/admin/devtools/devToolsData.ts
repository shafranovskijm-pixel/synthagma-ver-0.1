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
      { name: "admin/ (devtools, analytics, billing, marketplace)", files: 94, lines: 19528 },
      { name: "organization/ (tabs, dialogs, journals, документы)", files: 165, lines: 34214 },
      { name: "student/ (dashboard, games, video-id)", files: 26, lines: 5260 },
      { name: "landing/", files: 16, lines: 3363 },
      { name: "course-builder/ (block-editor, sortable, test)", files: 29, lines: 5826 },
      { name: "course-editor/", files: 6, lines: 1068 },
      { name: "course-learning/ (плееры и вьюеры)", files: 7, lines: 1144 },
      { name: "course-landing/", files: 14, lines: 1588 },
      { name: "onboarding/", files: 4, lines: 489 },
      { name: "ui/", files: 52, lines: 4419 },
      { name: "company/", files: 7, lines: 1367 },
      { name: "chat/", files: 10, lines: 2000 },
      { name: "partner/", files: 5, lines: 904 },
      { name: "shared/", files: 2, lines: 170 },
    ],
    totalFiles: 447,
    totalLines: 82602,
  },
  {
    folder: "src/hooks/",
    icon: React.createElement(Layers, { className: "w-4 h-4" }),
    color: "#0ea5e9",
    subfolders: [
      { name: "useEducationDocumentsJournal", files: 1, lines: 504 },
      { name: "useAdminMarketplace", files: 1, lines: 500 },
      { name: "useCourseStoreManager", files: 1, lines: 465 },
      { name: "useContractGenerator", files: 1, lines: 443 },
      { name: "useBulkPipeline", files: 1, lines: 299 },
      { name: "useCourseBuilder", files: 1, lines: 281 },
      { name: "useAuth, useOrganization, useDashboardSettings и др.", files: 12, lines: 2400 },
      { name: "useStudents, useCourses, useStore и др.", files: 18, lines: 3600 },
      { name: "useOrgDashboard (Context), course-learning/", files: 5, lines: 1200 },
      { name: "Остальные хуки", files: 86, lines: 18233 },
    ],
    totalFiles: 127,
    totalLines: 27925,
  },
  {
    folder: "src/pages/",
    icon: React.createElement(Layout, { className: "w-4 h-4" }),
    color: "#f59e0b",
    subfolders: [
      { name: "PartnerDashboard (490)", files: 1, lines: 490 },
      { name: "OrganizationStudentDetails (484)", files: 1, lines: 484 },
      { name: "StudentDashboard (481)", files: 1, lines: 481 },
      { name: "HelpCenter (466)", files: 1, lines: 466 },
      { name: "Blog (461)", files: 1, lines: 461 },
      { name: "PartnerLanding (459)", files: 1, lines: 459 },
      { name: "CoursePreview (429)", files: 1, lines: 429 },
      { name: "Остальные страницы", files: 54, lines: 9591 },
    ],
    totalFiles: 61,
    totalLines: 12861,
  },
  {
    folder: "supabase/functions/",
    icon: React.createElement(Zap, { className: "w-4 h-4" }),
    color: "#10b981",
    subfolders: [
      { name: "Auth & Users (register, create, reset, update)", files: 10, lines: 2500 },
      { name: "Notifications (email, telegram, reminders)", files: 13, lines: 3100 },
      { name: "AI / Generation (course, lesson, blog, explanation)", files: 15, lines: 4100 },
      { name: "Documents & Import (contract, course, skillspace)", files: 9, lines: 2400 },
      { name: "Media (kinescope-*, salutespeech)", files: 6, lines: 1244 },
      { name: "Payments (tbank-*, referral-*)", files: 5, lines: 943 },
      { name: "System (secrets, smtp, dadata, storage, subscription)", files: 6, lines: 1346 },
    ],
    totalFiles: 64,
    totalLines: 15633,
  },
  {
    folder: "src/utils/",
    icon: React.createElement(FileCode, { className: "w-4 h-4" }),
    color: "#ef4444",
    subfolders: [
      { name: "Excel, Word, PDF, Helpers", files: 33, lines: 3856 },
    ],
    totalFiles: 33,
    totalLines: 3856,
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
  // Текущие крупнейшие файлы (все в пределах нормы)
  { path: "src/components/ui/sidebar.tsx", lines: 637, status: "ok", note: "UI-библиотека shadcn — не бизнес-логика." },
  { path: "src/components/admin/devtools/devToolsData.ts", lines: 596, status: "ok", note: "Статические данные для DevTools." },
  { path: "src/components/organization/FRDOExportDialog.tsx", lines: 512, status: "ok", note: "Сложный экспорт — приемлемо." },
  { path: "src/hooks/useEducationDocumentsJournal.ts", lines: 504, status: "ok", note: "Хук — допустимый размер для сложной логики." },
  { path: "src/components/organization/AutoAttendanceJournal.tsx", lines: 503, status: "ok", note: "Журнал посещаемости — специфичный UI." },
  { path: "src/components/organization/PartnerCabinet.tsx", lines: 501, status: "ok", note: "Партнёрский кабинет — на границе." },
  { path: "src/hooks/useAdminMarketplace.ts", lines: 500, status: "ok", note: "Хук — допустимый размер." },
  { path: "src/pages/PartnerDashboard.tsx", lines: 490, status: "ok", note: "Дашборд партнёра — приемлемо." },
  // Ранее оптимизированные
  { path: "src/components/organization/tabs/CoursesTab.tsx", lines: 480, status: "optimized", note: "Было 1747 → 480. Извлечены диалоги, тулбар, хук." },
  { path: "src/pages/CoursePreview.tsx", lines: 429, status: "optimized", note: "Было 1248 → 429. Логика → useCoursePreview." },
  { path: "src/components/organization/OrgDocumentsManager.tsx", lines: 374, status: "optimized", note: "Было 1075 → 374." },
  { path: "src/components/organization/tabs/StudentsTab.tsx", lines: 248, status: "optimized", note: "Было 1196 → 248." },
  { path: "src/components/admin/AdminMarketplaceManager.tsx", lines: 229, status: "optimized", note: "Было 572 → 229. Каталог → AdminMarketplaceCatalogTab." },
  { path: "src/components/organization/AutoDocumentRegistrationJournal.tsx", lines: 217, status: "optimized", note: "Было 1226 → 217." },
  { path: "src/components/admin/ContentGeneratorTab.tsx", lines: 208, status: "optimized", note: "Было 975 → 208." },
  { path: "src/components/admin/OrganizationsManager.tsx", lines: 204, status: "optimized", note: "Было 1178 → 204." },
  { path: "src/components/admin/AdminAnalytics.tsx", lines: 191, status: "optimized", note: "Было 1435 → 191." },
  { path: "src/components/admin/OrganizationDetailsView.tsx", lines: 180, status: "optimized", note: "Было 1790 → 180." },
  { path: "src/components/course-builder/block-editor/BlockEditorMain.tsx", lines: 155, status: "optimized", note: "Было 1461 → 155." },
  { path: "src/components/organization/SelfExaminationQuiz.tsx", lines: 131, status: "optimized", note: "Было 1244 → 131." },
  { path: "src/pages/CourseEditor.tsx", lines: 130, status: "optimized", note: "Было 771 → 130." },
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
  { label: "Крупнейший файл", value: 637, max: 500, unit: "строк", status: "warning" },
  { label: "Файлов >800 строк", value: 0, max: 0, unit: "штук", status: "good" },
  { label: "Файлов >500 строк", value: 6, max: 10, unit: "штук", status: "good" },
  { label: "Покрытие тестами", value: 18, max: 50, unit: "файлов", status: "good" },
  { label: "Lazy-loaded страниц", value: 61, max: 61, unit: "из 61", status: "good" },
  { label: "Dynamic imports", value: 4, max: 4, unit: "библиотек", status: "good" },
  { label: "Кастомные хуки", value: 123, max: 130, unit: "штук", status: "good" },
  { label: "Context Coverage", value: 72, max: 100, unit: "%", status: "good" },
  { label: "Edge-функции", value: 64, max: 64, unit: "штук", status: "good" },
  { label: "Таблиц в БД", value: 118, max: 150, unit: "штук", status: "good" },
];

// ─── Context Coverage ──────────────────────────────────────────
export const CONTEXT_COMPONENTS = [
  { name: "OrgSidebar", migrated: true },
  { name: "OrgDashboardHeader", migrated: true },
  { name: "TabContentRenderer", migrated: true },
  { name: "SettingsTab", migrated: true },
  { name: "DialogsContainer", migrated: true },
  { name: "CoursesTab", migrated: true },
  { name: "StudentsTab", migrated: true },
  { name: "DocumentsTab", migrated: false },
  { name: "JournalsManager", migrated: true },
  { name: "CompanyDetailDialog", migrated: false },
  { name: "InvoiceGenerator", migrated: false },
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
  { name: "create-demo-org", category: "auth", description: "Создание демо-организации" },
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
  { name: "notify-enrollment-request", category: "notifications", description: "Запрос на зачисление" },
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
  { name: "parse-skillspace-course", category: "documents", description: "Парсинг курса SkillSpace (1146 строк)" },
  { name: "batch-skillspace-import", category: "documents", description: "Массовый импорт из SkillSpace" },
  { name: "reimport-skillspace-batch", category: "documents", description: "Реимпорт пакета SkillSpace" },
  { name: "convert-lesson-content", category: "documents", description: "Конвертация контента урока" },
  { name: "seed-welcome-course", category: "documents", description: "Создание приветственного курса" },
  // Media
  // (elevenlabs-tts removed)
  { name: "salutespeech-tts", category: "media", description: "Text-to-Speech (SaluteSpeech)" },
  { name: "kinescope-proxy", category: "media", description: "Kinescope API прокси" },
  { name: "kinescope-drm-auth", category: "media", description: "Kinescope DRM авторизация" },
  { name: "kinescope-migrate-videos", category: "media", description: "Миграция видео в Kinescope" },
  { name: "migrate-course-media", category: "media", description: "Миграция медиа курса" },
  // Payments
  { name: "tbank-init", category: "payments", description: "Инициализация платежа T-Bank" },
  { name: "tbank-init-subscription", category: "payments", description: "Инициализация подписки T-Bank" },
  { name: "tbank-webhook", category: "payments", description: "Webhook обработчик T-Bank" },
  { name: "referral-commission", category: "payments", description: "Реферальная комиссия" },
  { name: "referral-monthly-stats", category: "payments", description: "Месячная статистика рефералов" },
  // System
  { name: "test-org-smtp", category: "system", description: "Тестирование SMTP (платформа/организация)" },
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
  // ── Все крупные файлы оптимизированы ──
  {
    id: "zero-files-over-800",
    severity: "info",
    category: "architecture",
    title: "✅ 0 файлов > 800 строк (было 20+)",
    detail: "Все крупные файлы декомпозированы. Крупнейший бизнес-файл — 637 строк (sidebar.tsx, UI-библиотека).",
    actionable: false,
    status: "applied",
  },
  {
    id: "hooks-migration-complete",
    severity: "info",
    category: "code",
    title: "✅ 123 кастомных хука создано",
    detail: "Вся бизнес-логика изолирована в хуках. Компоненты содержат только UI.",
    actionable: false,
    status: "applied",
  },
  {
    id: "courses-tab-decomposed",
    severity: "info",
    category: "architecture",
    title: "✅ CoursesTab оптимизирован (1747 → 480)",
    detail: "Извлечены CoursesToolbar, ContentTabPlaceholders, диалоги, SortableCourseListRow.",
    actionable: false,
    status: "applied",
  },
  {
    id: "course-preview-decompose",
    severity: "info",
    category: "architecture",
    title: "✅ CoursePreview.tsx — 1248 → 429 строк",
    detail: "Логика → useCoursePreview. Секции: VideoPreview, SliderPreview и др.",
    actionable: false,
    status: "applied",
  },
  {
    id: "self-examination-decompose",
    severity: "info",
    category: "architecture",
    title: "✅ SelfExaminationQuiz.tsx — 1244 → 131 строка",
    detail: "Логика → useSelfExaminationQuiz.",
    actionable: false,
    status: "applied",
  },
  {
    id: "auto-doc-journal-decompose",
    severity: "info",
    category: "architecture",
    title: "✅ AutoDocumentRegistrationJournal.tsx — 1226 → 217",
    detail: "Логика → useDocumentRegistrationJournal.",
    actionable: false,
    status: "applied",
  },
  {
    id: "students-tab-decompose",
    severity: "info",
    category: "architecture",
    title: "✅ StudentsTab.tsx — 1196 → 248 строк",
    detail: "Подкомпоненты: StudentTableRow, StudentMobileCard, StudentsEmptyState.",
    actionable: false,
    status: "applied",
  },
  {
    id: "org-manager-decompose",
    severity: "info",
    category: "architecture",
    title: "✅ OrganizationsManager.tsx — 1178 → 204",
    detail: "Логика → useOrganizationsManager + OrgFormDialog + OrgStatsCards.",
    actionable: false,
    status: "applied",
  },
  {
    id: "org-details-decomposed",
    severity: "info",
    category: "architecture",
    title: "✅ OrganizationDetailsView — 1790 → 180",
    detail: "Логика → useOrgDetailsView. 5 панелей.",
    actionable: false,
    status: "applied",
  },
  {
    id: "block-editor-decomposed",
    severity: "info",
    category: "architecture",
    title: "✅ BlockEditorMain — 1461 → 155",
    detail: "7 подкомпонентов в blocks/.",
    actionable: false,
    status: "applied",
  },
  {
    id: "admin-analytics-decomposed",
    severity: "info",
    category: "architecture",
    title: "✅ AdminAnalytics — 1435 → 191",
    detail: "Логика → useAdminAnalytics. 7 графиков.",
    actionable: false,
    status: "applied",
  },
  {
    id: "course-learning-optimized",
    severity: "info",
    category: "architecture",
    title: "✅ CourseLearning — 2758 → 554",
    detail: "Логика в useCourseLearning, плееры в компонентах.",
    actionable: false,
    status: "applied",
  },
  {
    id: "marketplace-decomposed",
    severity: "info",
    category: "architecture",
    title: "✅ AdminMarketplaceManager — 572 → 229",
    detail: "Каталог → AdminMarketplaceCatalogTab. Диалоги → MarketplaceDialogs.",
    actionable: false,
    status: "applied",
  },
  {
    id: "platform-presentation-decomposed",
    severity: "info",
    category: "architecture",
    title: "✅ PlatformPresentation — 532 → 252",
    detail: "12 блоков → presentationBlocks.tsx.",
    actionable: false,
    status: "applied",
  },
  {
    id: "tbank-migration",
    severity: "info",
    category: "architecture",
    title: "✅ Миграция на T-Bank (Тинькофф)",
    detail: "Robokassa → tbank-init, tbank-webhook. SHA-256 подпись.",
    actionable: false,
    status: "applied",
  },
  {
    id: "lazy-loading",
    severity: "info",
    category: "performance",
    title: "✅ React.lazy() на всех 61 странице",
    detail: "Все страницы загружаются лениво.",
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
    title: "✅ 64 edge-функции развёрнуто",
    detail: "Auth (10), Notifications (13), AI (15), Documents (9), Media (6), Payments (5), System (6).",
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
  // ── Предупреждения — оставшиеся возможности ──
  {
    id: "test-coverage",
    severity: "info",
    category: "code",
    title: "✅ Покрытие тестами — 18 файлов, 130+ тестов",
    detail: "Утилиты (СНИЛС, парсеры, ФРДО, сетевые ошибки, реферальные куки), константы (тарифы), хуки (AI-лимиты, билдер, ФРДО, журналы).",
    actionable: false,
    status: "applied",
  },
  {
    id: "parse-skillspace-size",
    severity: "info",
    category: "code",
    title: "✅ parse-skillspace-course — модуляризирован",
    detail: "Разбит на 4 модуля (_shared/editorjs-converter, skillspace-auth, skillspace-media, skillspace-lessons). index.ts ~310 строк.",
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
