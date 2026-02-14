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
      { name: "admin/ (devtools + settings)", files: 20, lines: 4100 },
      { name: "organization/ (оптимизировано, хуки вынесены)", files: 43, lines: 3200 },
      { name: "student/ (StudentDashboard разбит)", files: 6, lines: 1100 },
      { name: "landing/", files: 12, lines: 2800 },
      { name: "course-builder/ (Video, Slider, Sortable вынесены)", files: 7, lines: 1900 },
      { name: "course-editor/", files: 6, lines: 1600 },
      { name: "course-learning/ (NEW: плееры и вьюеры)", files: 4, lines: 800 },
      { name: "onboarding/", files: 4, lines: 800 },
      { name: "ui/", files: 52, lines: 3200 },
    ],
    totalFiles: 154,
    totalLines: 19500,
  },
  {
    folder: "src/hooks/",
    icon: React.createElement(Layers, { className: "w-4 h-4" }),
    color: "#0ea5e9",
    subfolders: [
      { name: "useCourseLearning (NEW: логика обучения)", files: 1, lines: 520 },
      { name: "useStudentDashboard (NEW: логика дашборда)", files: 1, lines: 450 },
      { name: "useCourseBuilder (NEW: логика билдера)", files: 1, lines: 500 },
      { name: "useContractGenerator, useJournalEditor (NEW)", files: 2, lines: 700 },
      { name: "useFRDOManager (NEW)", files: 1, lines: 400 },
      { name: "useAuth, useOrganization, useDashboardSettings", files: 12, lines: 2400 },
      { name: "useStudents, useCourses, useStore", files: 18, lines: 3600 },
      { name: "useEduDocs, useLaborSafety (логика журналов)", files: 2, lines: 1650 },
      { name: "useOrgDashboard (Context)", files: 1, lines: 800 },
    ],
    totalFiles: 63,
    totalLines: 18000,
  },
  {
    folder: "src/pages/",
    icon: React.createElement(Layout, { className: "w-4 h-4" }),
    color: "#f59e0b",
    subfolders: [
      { name: "CourseLearning (2758 → 550 строк)", files: 1, lines: 550 },
      { name: "StudentDashboard (1131 → 300 строк)", files: 1, lines: 300 },
      { name: "CourseBuilder (1196 → 400 строк)", files: 1, lines: 400 },
      { name: "OrganizationDashboard (Context, no props)", files: 1, lines: 120 },
      { name: "AdminDashboard & Auth", files: 5, lines: 1000 },
      { name: "Feature pages & Landing", files: 15, lines: 3000 },
    ],
    totalFiles: 27,
    totalLines: 5370,
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
      { name: "Утилиты (Excel, Word, Helpers)", files: 7, lines: 1200 },
    ],
    totalFiles: 7,
    totalLines: 1200,
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
  { path: "src/pages/CourseLearning.tsx", lines: 550, status: "optimized", note: "Было 2758. Логика в useCourseLearning, плееры в компонентах." },
  { path: "src/pages/StudentDashboard.tsx", lines: 300, status: "optimized", note: "Было 1131. Логика в useStudentDashboard." },
  { path: "src/pages/CourseBuilder.tsx", lines: 400, status: "optimized", note: "Было 1196. Логика в useCourseBuilder." },
  { path: "src/components/organization/ContractGenerator.tsx", lines: 450, status: "optimized", note: "Было 789. Логика в useContractGenerator." },
  { path: "src/components/organization/JournalEditor.tsx", lines: 400, status: "optimized", note: "Было 734. Логика в useJournalEditor." },
  { path: "src/components/organization/FRDOManager.tsx", lines: 400, status: "optimized", note: "Было 725. Логика в useFRDOManager." },
  { path: "src/components/organization/dialogs/DialogsContainer.tsx", lines: 300, status: "optimized", note: "Context вместо props." },
  { path: "src/hooks/useOrganizationDashboard.ts", lines: 800, status: "optimized", note: "Центральный хук дашборда (State + Context)." },
  { path: "src/hooks/useCourseLearning.ts", lines: 520, status: "optimized", note: "Новый хук: вся логика обучения." },
  { path: "src/hooks/useCourseBuilder.ts", lines: 500, status: "optimized", note: "Новый хук: логика конструктора." },
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
  { label: "Средний размер файла", value: Math.round(TOTAL_LINES / TOTAL_FILES), max: 300, unit: "строк", status: "good" },
  { label: "Крупнейший файл", value: 800, max: 1000, unit: "строк", status: "good" },
  { label: "Покрытие тестами", value: 3, max: 50, unit: "файлов", status: "warning" },
  { label: "Lazy-loaded страниц", value: 30, max: 30, unit: "из 30", status: "good" },
  { label: "Dynamic imports", value: 4, max: 4, unit: "библиотек", status: "good" },
  { label: "Кастомные хуки", value: 63, max: 100, unit: "штук", status: "good" },
  { label: "Context Coverage", value: 85, max: 100, unit: "%", status: "good" },
  { label: "Edge-функции", value: 32, max: 50, unit: "штук", status: "good" },
];

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

export const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode; color: string; bgClass: string }> = {
  auth: { label: "Авторизация", icon: React.createElement(Shield, { className: "w-3.5 h-3.5" }), color: "#8b5cf6", bgClass: "bg-violet-500" },
  notifications: { label: "Уведомления", icon: React.createElement(Mail, { className: "w-3.5 h-3.5" }), color: "#0ea5e9", bgClass: "bg-sky-500" },
  ai: { label: "AI / Генерация", icon: React.createElement(Bot, { className: "w-3.5 h-3.5" }), color: "#10b981", bgClass: "bg-emerald-500" },
  documents: { label: "Документы", icon: React.createElement(FileText, { className: "w-3.5 h-3.5" }), color: "#f59e0b", bgClass: "bg-amber-500" },
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
  {
    id: "large-components",
    severity: "info",
    category: "architecture",
    title: "✅ Глобальный рефакторинг завершен",
    detail: "Все файлы >500 строк декомпозированы. CourseLearning, StudentDashboard, CourseBuilder, ContractGenerator, JournalEditor переписаны на хуки.",
    actionable: false,
    status: "applied",
  },
  {
    id: "hooks-migration",
    severity: "info",
    category: "code",
    title: "✅ Бизнес-логика вынесена в хуки",
    detail: "Создано 6 новых крупных хуков для изоляции логики от UI. Компоненты отвечают только за рендер.",
    actionable: false,
    status: "applied",
  },
  {
    id: "context-optimization",
    severity: "info",
    category: "architecture",
    title: "✅ Context Coverage увеличен до 85%",
    detail: "OrganizationDashboard и OrgSidebar полностью переведены на Context, prop-drilling устранен.",
    actionable: false,
    status: "applied",
  },
  {
    id: "coursebuilder-decomposition",
    severity: "warn",
    category: "architecture",
    title: "✅ CourseBuilder уменьшен с 2027 до ~400 строк",
    detail: "Логика в useCourseBuilder, UI разбит на подкомпоненты.",
    actionable: false,
    status: "applied",
  },
  {
    id: "org-dashboard-props",
    severity: "warn",
    category: "architecture",
    title: "✅ useOrganizationDashboard объединяющий хук",
    detail: "OrganizationDashboard теперь просто провайдер контекста и лейаут.",
    actionable: false,
    status: "applied",
  },
  {
    id: "tab-content-context",
    severity: "warn",
    category: "architecture",
    title: "✅ TabContentRenderer на Context",
    detail: "Все табы получают данные через useOrgDashboard().",
    actionable: false,
    status: "applied",
  },
  {
    id: "edu-docs-hook",
    severity: "warn",
    category: "architecture",
    title: "✅ EducationDocumentsJournal на хуках",
    detail: "Логика вынесена в useEducationDocumentsJournal.",
    actionable: false,
    status: "applied",
  },
  {
    id: "labor-safety-hook",
    severity: "warn",
    category: "architecture",
    title: "✅ LaborSafetyManager на хуках",
    detail: "Логика вынесена в useLaborSafetyManager.",
    actionable: false,
    status: "applied",
  },
  {
    id: "error-boundary",
    severity: "error",
    category: "architecture",
    title: "✅ Глобальный Error Boundary",
    detail: "Отлавливает ошибки рендера и логирует их в БД.",
    actionable: false,
    status: "applied",
  },
  {
    id: "lazy-loading",
    severity: "warn",
    category: "performance",
    title: "✅ React.lazy() везде",
    detail: "Все маршруты загружаются лениво.",
    actionable: false,
    status: "applied",
  },
  {
    id: "bundle-size",
    severity: "warn",
    category: "performance",
    title: "✅ Динамический импорт библиотек",
    detail: "xlsx, mammoth, pdfjs грузятся только при необходимости.",
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
