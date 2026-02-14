import React from "react";
import {
  Shield, Mail, Bot, FileText, Terminal,
  Component, Layers, Layout, Zap, FileCode,
  XCircle, AlertTriangle, Info,
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
      { name: "admin/", files: 18, lines: 4200 },
      { name: "organization/", files: 42, lines: 9800 },
      { name: "student/", files: 6, lines: 1400 },
      { name: "landing/", files: 12, lines: 2800 },
      { name: "course-builder/", files: 4, lines: 1100 },
      { name: "course-editor/", files: 6, lines: 1600 },
      { name: "onboarding/", files: 4, lines: 800 },
      { name: "ui/", files: 52, lines: 3200 },
    ],
    totalFiles: 144,
    totalLines: 24900,
  },
  {
    folder: "src/hooks/",
    icon: React.createElement(Layers, { className: "w-4 h-4" }),
    color: "#0ea5e9",
    subfolders: [
      { name: "useAuth, useOrganization...", files: 12, lines: 2400 },
      { name: "useStudents, useCourses...", files: 18, lines: 3600 },
      { name: "useCompanies, useJournals...", files: 10, lines: 1800 },
      { name: "Остальные хуки", files: 8, lines: 1200 },
    ],
    totalFiles: 48,
    totalLines: 9000,
  },
  {
    folder: "src/pages/",
    icon: React.createElement(Layout, { className: "w-4 h-4" }),
    color: "#f59e0b",
    subfolders: [
      { name: "Dashboard (Admin, Org, Student)", files: 3, lines: 800 },
      { name: "Auth (Login, Register, Reset)", files: 4, lines: 600 },
      { name: "Course (Builder, Editor, Learning)", files: 5, lines: 1400 },
      { name: "Feature pages", files: 9, lines: 1800 },
      { name: "Landing, Blog, About", files: 6, lines: 1200 },
    ],
    totalFiles: 27,
    totalLines: 5800,
  },
  {
    folder: "supabase/functions/",
    icon: React.createElement(Zap, { className: "w-4 h-4" }),
    color: "#10b981",
    subfolders: [
      { name: "Auth & Users", files: 7, lines: 1400 },
      { name: "Notifications", files: 6, lines: 1200 },
      { name: "AI / Generation", files: 6, lines: 1800 },
      { name: "Documents & Email", files: 7, lines: 1400 },
      { name: "System & Other", files: 6, lines: 1000 },
    ],
    totalFiles: 32,
    totalLines: 6800,
  },
  {
    folder: "src/utils/",
    icon: React.createElement(FileCode, { className: "w-4 h-4" }),
    color: "#ef4444",
    subfolders: [
      { name: "Утилиты", files: 7, lines: 1200 },
    ],
    totalFiles: 7,
    totalLines: 1200,
  },
];

export const TOTAL_FILES = CODE_TREE.reduce((a, g) => a + g.totalFiles, 0);
export const TOTAL_LINES = CODE_TREE.reduce((a, g) => a + g.totalLines, 0);

// ─── Edge Functions ─────────────────────────────────────────────
export interface EdgeFunc {
  name: string;
  category: string;
  description: string;
}

export const EDGE_FUNCTIONS: EdgeFunc[] = [
  { name: "register-student", category: "auth", description: "Регистрация студента" },
  { name: "create-org-user", category: "auth", description: "Создание пользователя организации" },
  { name: "reset-org-password", category: "auth", description: "Сброс пароля организации" },
  { name: "reset-student-password", category: "auth", description: "Сброс пароля студента" },
  { name: "generate-org-credentials", category: "auth", description: "Генерация учётных данных" },
  { name: "update-org-credentials", category: "auth", description: "Обновление учётных данных орг." },
  { name: "update-student-credentials", category: "auth", description: "Обновление учётных данных студ." },
  { name: "send-email", category: "notifications", description: "Отправка email" },
  { name: "send-credentials", category: "notifications", description: "Отправка учётных данных" },
  { name: "send-password-reset", category: "notifications", description: "Отправка ссылки сброса" },
  { name: "send-course-invitation", category: "notifications", description: "Приглашение на курс" },
  { name: "send-documents-reminder", category: "notifications", description: "Напоминание о документах" },
  { name: "send-telegram-notification", category: "notifications", description: "Telegram уведомление" },
  { name: "notify-course-completion", category: "notifications", description: "Уведомление о завершении курса" },
  { name: "notify-course-order", category: "notifications", description: "Уведомление о заказе курса" },
  { name: "notify-order-status", category: "notifications", description: "Статус заказа" },
  { name: "process-reminders", category: "notifications", description: "Обработка напоминаний" },
  { name: "generate-course-structure", category: "ai", description: "Генерация структуры курса" },
  { name: "generate-course-content", category: "ai", description: "Генерация контента курса" },
  { name: "generate-lesson-content", category: "ai", description: "Генерация контента урока" },
  { name: "generate-blog-post", category: "ai", description: "Генерация блог-поста" },
  { name: "generate-explanation", category: "ai", description: "Генерация объяснения" },
  { name: "generate-self-examination-report", category: "ai", description: "Отчёт самообследования" },
  { name: "student-chat", category: "ai", description: "AI-чат студента" },
  { name: "process-contract-template", category: "documents", description: "Обработка шаблона договора" },
  { name: "import-course", category: "documents", description: "Импорт курса" },
  { name: "get-test-results", category: "documents", description: "Получение результатов теста" },
  { name: "grade-test", category: "documents", description: "Оценка теста" },
  { name: "test-smtp", category: "system", description: "Тестирование SMTP" },
  { name: "dadata-company", category: "system", description: "Поиск компании через DaData" },
  { name: "elevenlabs-tts", category: "system", description: "Text-to-Speech" },
  { name: "get-external-storage-config", category: "system", description: "Конфигурация хранилища" },
];

export const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  auth: { label: "Авторизация", icon: React.createElement(Shield, { className: "w-3.5 h-3.5" }), color: "#8b5cf6" },
  notifications: { label: "Уведомления", icon: React.createElement(Mail, { className: "w-3.5 h-3.5" }), color: "#0ea5e9" },
  ai: { label: "AI / Генерация", icon: React.createElement(Bot, { className: "w-3.5 h-3.5" }), color: "#10b981" },
  documents: { label: "Документы", icon: React.createElement(FileText, { className: "w-3.5 h-3.5" }), color: "#f59e0b" },
  system: { label: "Система", icon: React.createElement(Terminal, { className: "w-3.5 h-3.5" }), color: "#64748b" },
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
  {
    id: "large-components",
    severity: "warn",
    category: "architecture",
    title: "✅ Декомпозиция крупных компонентов выполнена",
    detail: "DevToolsPanel, CourseBuilder, OrganizationDashboard — разбиты на подкомпоненты, helpers и хуки.",
    actionable: false,
    status: "applied",
  },
  {
    id: "duplicate-hooks",
    severity: "warn",
    category: "code",
    title: "✅ Хуки консолидированы",
    detail: "useStudentFiltersState удалён. useCourseActions использует импорт типов из shared.ts.",
    actionable: false,
    status: "applied",
  },
  {
    id: "types-consolidation",
    severity: "info",
    category: "code",
    title: "✅ Типы консолидированы",
    detail: "shared.ts реэкспортирует типы из доменных файлов (student.ts, course.ts, organization.ts). Дублирование устранено.",
    actionable: false,
    status: "applied",
  },
  {
    id: "error-boundary",
    severity: "error",
    category: "architecture",
    title: "✅ Глобальный Error Boundary добавлен",
    detail: "ErrorBoundary компонент создан в src/components/ErrorBoundary.tsx и обёрнут вокруг App.",
    actionable: false,
    status: "applied",
  },
  {
    id: "lazy-loading",
    severity: "warn",
    category: "performance",
    title: "✅ React.lazy() для всех страниц реализован",
    detail: "Все ~30 страниц переведены на lazy loading через React.lazy() + Suspense в App.tsx.",
    actionable: false,
    status: "applied",
  },
  {
    id: "memo-optimization",
    severity: "info",
    category: "performance",
    title: "✅ React.memo добавлен для крупных списков",
    detail: "StudentsTab, CoursesTab, DocumentsTab обёрнуты в React.memo для предотвращения лишних перерисовок.",
    actionable: false,
    status: "applied",
  },
  {
    id: "no-tests",
    severity: "error",
    category: "code",
    title: "Нет unit-тестов",
    detail: "0 файлов .test.ts / .test.tsx в проекте. Критичные хуки (useAuth, useOrganization, useStudents) должны быть покрыты тестами.",
    actionable: false,
    status: "unchecked",
  },
  {
    id: "bundle-size",
    severity: "warn",
    category: "performance",
    title: "✅ Все тяжёлые библиотеки переведены на dynamic import",
    detail: "mammoth (~200KB), pdfjs-dist (~400KB) и xlsx (~800KB) переведены на dynamic import().",
    actionable: false,
    status: "applied",
  },
  {
    id: "no-sentry",
    severity: "info",
    category: "architecture",
    title: "Нет мониторинга ошибок в production",
    detail: "Ошибки в production не отслеживаются. Рассмотреть подключение Sentry или аналога.",
    actionable: false,
    status: "unchecked",
  },
  {
    id: "css-inconsistency",
    severity: "info",
    category: "code",
    title: "Смешивание стилей: inline + Tailwind + CSS",
    detail: "В некоторых компонентах используются style={{ }} вместо Tailwind-классов.",
    actionable: false,
    status: "unchecked",
  },
  {
    id: "no-rate-limiting",
    severity: "warn",
    category: "architecture",
    title: "Нет rate limiting на Edge-функциях",
    detail: "AI-генерация и отправка email не ограничены по частоте.",
    actionable: false,
    status: "unchecked",
  },
  {
    id: "accessibility",
    severity: "info",
    category: "code",
    title: "Accessibility (a11y) не полностью реализован",
    detail: "Часть интерактивных элементов не имеет aria-labels.",
    actionable: false,
    status: "unchecked",
  },
  {
    id: "xlsx-dynamic",
    severity: "warn",
    category: "performance",
    title: "✅ xlsx переведён на dynamic import во всех компонентах",
    detail: "Создан утилитный модуль xlsxHelper.ts с getXLSX() и exportToExcel().",
    actionable: false,
    status: "applied",
  },
  {
    id: "vite-chunks",
    severity: "info",
    category: "performance",
    title: "✅ Manual chunks настроены в Vite",
    detail: "recharts, @radix-ui, @supabase, react-dom выделены в отдельные чанки.",
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
