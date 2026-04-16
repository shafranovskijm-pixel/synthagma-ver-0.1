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
      { name: "admin/ (devtools, analytics, billing, marketplace)", files: 85, lines: 23851 },
      { name: "organization/ (tabs, dialogs, journals, документы)", files: 141, lines: 45400 },
      { name: "student/ (dashboard, games, video-id)", files: 25, lines: 6257 },
      { name: "landing/", files: 16, lines: 3351 },
      { name: "course-builder/ (block-editor, sortable, test)", files: 27, lines: 6391 },
      { name: "course-editor/", files: 5, lines: 1782 },
      { name: "course-learning/ (плееры и вьюеры)", files: 4, lines: 883 },
      { name: "course-landing/", files: 14, lines: 1588 },
      { name: "onboarding/", files: 4, lines: 489 },
      { name: "ui/", files: 52, lines: 4419 },
      { name: "company/", files: 7, lines: 1367 },
      { name: "shared/", files: 2, lines: 170 },
    ],
    totalFiles: 382,
    totalLines: 95948,
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
      { name: "Остальные хуки", files: 44, lines: 8628 },
    ],
    totalFiles: 86,
    totalLines: 19981,
  },
  {
    folder: "src/pages/",
    icon: React.createElement(Layout, { className: "w-4 h-4" }),
    color: "#f59e0b",
    subfolders: [
      { name: "CoursePreview (1248 строк)", files: 1, lines: 1248 },
      { name: "PartnerLanding (817)", files: 1, lines: 817 },
      { name: "CourseEditor (771)", files: 1, lines: 771 },
      { name: "StudentProfile (711)", files: 1, lines: 711 },
      { name: "CourseLandingEditor (704)", files: 1, lines: 704 },
      { name: "CourseLearning (554 — оптимизирован)", files: 1, lines: 554 },
      { name: "RegisterOrg, Features, Blog и др.", files: 4, lines: 2200 },
      { name: "Остальные страницы", files: 50, lines: 9616 },
    ],
    totalFiles: 60,
    totalLines: 16621,
  },
  {
    folder: "supabase/functions/",
    icon: React.createElement(Zap, { className: "w-4 h-4" }),
    color: "#10b981",
    subfolders: [
      { name: "Auth & Users (register, create, reset, update)", files: 9, lines: 2400 },
      { name: "Notifications (email, telegram, reminders)", files: 12, lines: 2900 },
      { name: "AI / Generation (course, lesson, blog, explanation)", files: 15, lines: 4100 },
      { name: "Documents & Import (contract, course, skillspace)", files: 9, lines: 2400 },
      { name: "Media (kinescope-*, salutespeech, elevenlabs)", files: 6, lines: 1244 },
      { name: "Payments (tbank-*, referral-*)", files: 5, lines: 943 },
      { name: "System (secrets, smtp, dadata, storage, subscription)", files: 7, lines: 1346 },
    ],
    totalFiles: 63,
    totalLines: 15333,
  },
  {
    folder: "src/utils/",
    icon: React.createElement(FileCode, { className: "w-4 h-4" }),
    color: "#ef4444",
    subfolders: [
      { name: "Excel, Word, PDF, Helpers", files: 31, lines: 3600 },
    ],
    totalFiles: 31,
    totalLines: 3600,
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
  { path: "src/components/organization/tabs/CoursesTab.tsx", lines: 1379, status: "optimized", note: "Было 1747. Извлечены диалоги и SortableCourseListRow." },
  { path: "src/pages/CoursePreview.tsx", lines: 1248, status: "needs-work", note: "Разбить на preview-секции (Hero, Content, Sidebar)." },
  { path: "src/components/organization/SelfExaminationQuiz.tsx", lines: 1244, status: "needs-work", note: "Вынести логику в useSelfExaminationQuiz." },
  { path: "src/components/organization/AutoDocumentRegistrationJournal.tsx", lines: 1226, status: "needs-work", note: "Логика в хук, UI в подкомпоненты." },
  { path: "src/components/organization/tabs/StudentsTab.tsx", lines: 1196, status: "needs-work", note: "Вынести таблицу и фильтры в подкомпоненты." },
  { path: "src/components/admin/OrganizationsManager.tsx", lines: 1178, status: "needs-work", note: "Декомпозиция: таблица + диалоги + фильтры." },
  { path: "src/components/admin/AdminBillingOverview.tsx", lines: 1076, status: "needs-work", note: "Вынести таблицы и фильтры." },
  { path: "src/components/organization/OrgDocumentsManager.tsx", lines: 1075, status: "needs-work", note: "Разбить по типам документов." },
  { path: "src/components/organization/dialogs/CompanyDetailDialog.tsx", lines: 975, status: "needs-work", note: "Разбить на табы-компоненты." },
  { path: "src/components/admin/ContentGeneratorTab.tsx", lines: 975, status: "needs-work", note: "Вынести форму и результат." },
  { path: "src/components/admin/AISettingsManager.tsx", lines: 874, status: "needs-work", note: "Вынести секции настроек." },
  { path: "src/components/admin/BulkContentGenerator.tsx", lines: 867, status: "needs-work", note: "Логика уже в хуке, разбить UI." },
  { path: "src/components/organization/InvoiceGenerator.tsx", lines: 846, status: "needs-work", note: "Вынести preview и форму." },
  { path: "src/components/organization/JournalsManager.tsx", lines: 841, status: "needs-work", note: "Декомпозиция по типам журналов." },
  { path: "src/components/organization/ConsentGenerator.tsx", lines: 834, status: "needs-work", note: "Вынести шаблоны и preview." },
  { path: "src/components/organization/CourseDetailsContent.tsx", lines: 827, status: "needs-work", note: "Разбить на секции." },
  { path: "src/components/organization/ActGenerator.tsx", lines: 827, status: "needs-work", note: "Вынести preview и форму." },
  { path: "src/pages/PartnerLanding.tsx", lines: 817, status: "needs-work", note: "Разбить на секции лендинга." },
  { path: "src/components/organization/CopiesDuplicatesJournal.tsx", lines: 805, status: "needs-work", note: "Логика в хук." },
  { path: "src/components/organization/AutoFinalAttestationJournal.tsx", lines: 791, status: "ok", note: "Ниже порога 800. Логика в хук при росте." },
  // Оптимизированные
  { path: "src/components/organization/dialogs/CourseDetailsModal.tsx", lines: 250, status: "optimized", note: "Было 1416. Логика → useCourseDetailsLogic + CourseStudentsTab + CourseSettingsTab." },
  { path: "src/components/organization/LaborSafetyStudentDetailCard.tsx", lines: 140, status: "optimized", note: "Было 1295. Логика → useLaborSafetyStudent + 4 таб-компонента." },
  { path: "src/pages/CourseLearning.tsx", lines: 554, status: "optimized", note: "Было 2758. Логика в useCourseLearning." },
  { path: "src/components/admin/OrganizationDetailsView.tsx", lines: 180, status: "optimized", note: "Было 1790. Логика в useOrgDetailsView + 5 панелей." },
  { path: "src/components/course-builder/block-editor/BlockEditorMain.tsx", lines: 155, status: "optimized", note: "Было 1461. Разбит на 7 подкомпонентов в blocks/." },
  { path: "src/components/admin/AdminAnalytics.tsx", lines: 191, status: "optimized", note: "Было 1435. Логика в useAdminAnalytics + 7 графиков." },
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
  { label: "Крупнейший файл", value: 1379, max: 500, unit: "строк", status: "critical" },
  { label: "Файлов >800 строк", value: 20, max: 0, unit: "штук", status: "critical" },
  { label: "Файлов >500 строк", value: 62, max: 10, unit: "штук", status: "critical" },
  { label: "Покрытие тестами", value: 10, max: 50, unit: "файлов", status: "warning" },
  { label: "Lazy-loaded страниц", value: 60, max: 60, unit: "из 60", status: "good" },
  { label: "Dynamic imports", value: 4, max: 4, unit: "библиотек", status: "good" },
  { label: "Кастомные хуки", value: 86, max: 100, unit: "штук", status: "good" },
  { label: "Context Coverage", value: 63, max: 100, unit: "%", status: "warning" },
  { label: "Edge-функции", value: 63, max: 63, unit: "штук", status: "good" },
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
  { name: "elevenlabs-tts", category: "media", description: "Text-to-Speech (ElevenLabs)" },
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
  // ── Критичные (error) — план рефакторинга ──
  {
    id: "course-preview-decompose",
    severity: "error",
    category: "architecture",
    title: "🔴 CoursePreview.tsx — 1248 строк",
    detail: "Разбить на preview-секции: CoursePreviewHero, CoursePreviewContent, CoursePreviewSidebar, CoursePreviewModules. Вынести логику в useCoursePreview.",
    actionable: true,
    status: "unchecked",
  },
  {
    id: "self-examination-decompose",
    severity: "error",
    category: "architecture",
    title: "🔴 SelfExaminationQuiz.tsx — 1244 строки",
    detail: "Логика квиза → useSelfExaminationQuiz. UI: QuizQuestion, QuizResults, QuizProgress — отдельные компоненты.",
    actionable: true,
    status: "unchecked",
  },
  {
    id: "auto-doc-journal-decompose",
    severity: "error",
    category: "architecture",
    title: "🔴 AutoDocumentRegistrationJournal.tsx — 1226 строк",
    detail: "Логика → useDocumentRegistrationJournal. UI: таблица, фильтры, модалки — в подкомпоненты.",
    actionable: true,
    status: "unchecked",
  },
  {
    id: "students-tab-decompose",
    severity: "error",
    category: "architecture",
    title: "🔴 StudentsTab.tsx — 1196 строк",
    detail: "Вынести StudentTable, StudentFilters, StudentBulkActions. Логика фильтрации в useStudentFilters.",
    actionable: true,
    status: "unchecked",
  },
  {
    id: "org-manager-decompose",
    severity: "error",
    category: "architecture",
    title: "🔴 OrganizationsManager.tsx — 1178 строк",
    detail: "Декомпозиция: OrgTable + OrgFilters + OrgDialogs. Логика → useOrganizationsManager.",
    actionable: true,
    status: "unchecked",
  },
  // ── Предупреждения (warn) — задачи ──
  {
    id: "large-files-count",
    severity: "warn",
    category: "architecture",
    title: "⚠️ 20 файлов > 800 строк",
    detail: "Было 23 → 20 за счёт декомпозиции. Следующие кандидаты: AdminBillingOverview (1076), OrgDocumentsManager (1075), CompanyDetailDialog (975), ContentGeneratorTab (975).",
    actionable: true,
    status: "checked",
  },
  {
    id: "org-components-size",
    severity: "warn",
    category: "architecture",
    title: "⚠️ organization/ — 45K строк в 141 файле",
    detail: "Самый большой раздел (47% компонентов). Рассмотреть группировку по доменам: journals/, generators/, documents/.",
    actionable: true,
    status: "unchecked",
  },
  {
    id: "admin-components-growth",
    severity: "warn",
    category: "architecture",
    title: "⚠️ admin/ — 24K строк в 85 файлах",
    detail: "Вырос с 69 до 85 файлов. ContentGeneratorTab (975) и BulkContentGenerator (867) — кандидаты на разбиение.",
    actionable: true,
    status: "unchecked",
  },
  {
    id: "test-coverage",
    severity: "warn",
    category: "code",
    title: "⚠️ Покрытие тестами — 10 из 622+ файлов",
    detail: "Менее 2% файлов покрыто тестами. Приоритет: хуки с бизнес-логикой (useCourseBuilder, useBulkPipeline, useCourseLearning).",
    actionable: true,
    status: "unchecked",
  },
  {
    id: "parse-skillspace-size",
    severity: "warn",
    category: "code",
    title: "⚠️ parse-skillspace-course — 1146 строк",
    detail: "Самая крупная edge-функция. Рассмотреть разбиение парсера на модули: парсинг HTML, маппинг данных, обработка медиа.",
    actionable: true,
    status: "unchecked",
  },
  {
    id: "context-coverage-low",
    severity: "warn",
    category: "architecture",
    title: "⚠️ Context Coverage — 63%",
    detail: "CoursesTab, StudentsTab и DocumentsTab всё ещё на prop-drilling. Перевести на Context для уменьшения рендеров.",
    actionable: true,
    status: "unchecked",
  },
  // ── Выполненные оптимизации ──
  {
    id: "course-details-modal-decomposed",
    severity: "info",
    category: "architecture",
    title: "✅ CourseDetailsModal декомпозирован (1416 → 250)",
    detail: "Логика → useCourseDetailsLogic. Табы: CourseStudentsTab, CourseSettingsTab.",
    actionable: false,
    status: "applied",
  },
  {
    id: "labor-safety-card-decomposed",
    severity: "info",
    category: "architecture",
    title: "✅ LaborSafetyStudentDetailCard декомпозирован (1295 → 140)",
    detail: "Логика → useLaborSafetyStudent. 4 таба: LSProfileTab, LSIdentificationTab, LSCoursesTab, LSDocumentsTab.",
    actionable: false,
    status: "applied",
  },
  {
    id: "org-details-decomposed",
    severity: "info",
    category: "architecture",
    title: "✅ OrganizationDetailsView декомпозирован (1790 → 180)",
    detail: "Логика → useOrgDetailsView. 5 панелей: Students, Courses, Settings, Tariffs, Stats.",
    actionable: false,
    status: "applied",
  },
  {
    id: "block-editor-decomposed",
    severity: "info",
    category: "architecture",
    title: "✅ BlockEditorMain декомпозирован (1461 → 155)",
    detail: "7 подкомпонентов в blocks/.",
    actionable: false,
    status: "applied",
  },
  {
    id: "admin-analytics-decomposed",
    severity: "info",
    category: "architecture",
    title: "✅ AdminAnalytics декомпозирован (1435 → 191)",
    detail: "Логика → useAdminAnalytics. 7 графиков.",
    actionable: false,
    status: "applied",
  },
  {
    id: "courses-tab-decomposed",
    severity: "info",
    category: "architecture",
    title: "✅ CoursesTab оптимизирован (1747 → 1379)",
    detail: "Извлечены CoursesEmptyState, SortableCourseListRow, диалоги.",
    actionable: false,
    status: "applied",
  },
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
    title: "✅ 86 кастомных хуков создано",
    detail: "Бизнес-логика изолирована: useCourseBuilder, useBulkPipeline, useOrgDetailsView, useAdminAnalytics и др.",
    actionable: false,
    status: "applied",
  },
  {
    id: "tbank-migration",
    severity: "info",
    category: "architecture",
    title: "✅ Миграция на T-Bank (Тинькофф)",
    detail: "Robokassa заменена на tbank-init, tbank-init-subscription, tbank-webhook. SHA-256 подпись.",
    actionable: false,
    status: "applied",
  },
  {
    id: "backdrop-blur-fix",
    severity: "info",
    category: "performance",
    title: "✅ backdrop-blur артефакты исправлены",
    detail: "Убран backdrop-blur-sm из 3 сайдбаров.",
    actionable: false,
    status: "applied",
  },
  {
    id: "lazy-loading",
    severity: "info",
    category: "performance",
    title: "✅ React.lazy() на всех 60 страницах",
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
    title: "✅ 63 edge-функции развёрнуто",
    detail: "Auth (10), Notifications (13), AI (14), Documents (9), Media (6), Payments (5), System (6).",
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
