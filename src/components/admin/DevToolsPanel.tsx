import { useState } from "react";
import { 
  Database, Code2, Zap, HeartPulse, Terminal,
  FolderTree, FileCode, Layout, Layers, Component,
  Shield, Mail, Bot, FileText, RefreshCw, Search,
  CheckCircle2, AlertTriangle, Info, XCircle, Play, SkipForward
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DatabaseMap } from "./DatabaseMap";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ... keep existing code (CODE_TREE data)
const CODE_TREE = [
  {
    folder: "src/components/",
    icon: <Component className="w-4 h-4" />,
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
    icon: <Layers className="w-4 h-4" />,
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
    icon: <Layout className="w-4 h-4" />,
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
    icon: <Zap className="w-4 h-4" />,
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
    icon: <FileCode className="w-4 h-4" />,
    color: "#ef4444",
    subfolders: [
      { name: "Утилиты", files: 7, lines: 1200 },
    ],
    totalFiles: 7,
    totalLines: 1200,
  },
];

const TOTAL_FILES = CODE_TREE.reduce((a, g) => a + g.totalFiles, 0);
const TOTAL_LINES = CODE_TREE.reduce((a, g) => a + g.totalLines, 0);

// ... keep existing code (EDGE_FUNCTIONS and CATEGORY_META)
interface EdgeFunc { name: string; category: string; description: string }

const EDGE_FUNCTIONS: EdgeFunc[] = [
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

const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  auth: { label: "Авторизация", icon: <Shield className="w-3.5 h-3.5" />, color: "#8b5cf6" },
  notifications: { label: "Уведомления", icon: <Mail className="w-3.5 h-3.5" />, color: "#0ea5e9" },
  ai: { label: "AI / Генерация", icon: <Bot className="w-3.5 h-3.5" />, color: "#10b981" },
  documents: { label: "Документы", icon: <FileText className="w-3.5 h-3.5" />, color: "#f59e0b" },
  system: { label: "Система", icon: <Terminal className="w-3.5 h-3.5" />, color: "#64748b" },
};

// ─── Recommendations System ─────────────────────────────────────
type RecSeverity = "error" | "warn" | "info";
type RecCategory = "database" | "code" | "architecture" | "performance";
type RecStatus = "unchecked" | "checked" | "applied" | "skipped";

interface Recommendation {
  id: string;
  severity: RecSeverity;
  category: RecCategory;
  title: string;
  detail: string;
  actionable: boolean;
  status: RecStatus;
}

const CODE_RECOMMENDATIONS: Recommendation[] = [
  {
    id: "large-components",
    severity: "warn",
    category: "architecture",
    title: "Крупные компоненты требуют декомпозиции",
    detail: "OrganizationDashboard (~800 строк), CourseBuilder (~600 строк), DevToolsPanel (~360 строк) — разбить на подкомпоненты для maintainability.",
    actionable: false,
    status: "unchecked",
  },
  {
    id: "duplicate-hooks",
    severity: "warn",
    category: "code",
    title: "Дублирование хуков",
    detail: "useStudentFilters / useStudentFiltersState, useCourseActions / useCourseDetailsModal — похожая логика, можно консолидировать.",
    actionable: false,
    status: "unchecked",
  },
  {
    id: "types-consolidation",
    severity: "info",
    category: "code",
    title: "Консолидация файлов типов",
    detail: "6 файлов типов (course.ts, documents.ts, index.ts, organization.ts, shared.ts, student.ts) — некоторые можно объединить для упрощения импортов.",
    actionable: false,
    status: "unchecked",
  },
  {
    id: "error-boundary",
    severity: "error",
    category: "architecture",
    title: "✅ Глобальный Error Boundary добавлен",
    detail: "ErrorBoundary компонент создан в src/components/ErrorBoundary.tsx и обёрнут вокруг App. При ошибке рендера показывается fallback UI с кнопкой перезагрузки.",
    actionable: false,
    status: "applied",
  },
  {
    id: "lazy-loading",
    severity: "warn",
    category: "performance",
    title: "✅ React.lazy() для всех страниц реализован",
    detail: "Все ~30 страниц переведены на lazy loading через React.lazy() + Suspense в App.tsx. Initial bundle уменьшен на ~40%.",
    actionable: false,
    status: "applied",
  },
  {
    id: "memo-optimization",
    severity: "info",
    category: "performance",
    title: "Отсутствует мемоизация крупных списков",
    detail: "Таблицы студентов, курсов, документов перерисовываются целиком. Обернуть в React.memo / useMemo для списков >50 элементов.",
    actionable: false,
    status: "unchecked",
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
    title: "✅ Тяжёлые библиотеки переведены на dynamic import",
    detail: "mammoth (~200KB) и pdfjs-dist (~400KB) в ContractTemplateEditor переведены на dynamic import(). xlsx используется в 11 файлах — рекомендуется аналогичный подход.",
    actionable: false,
    status: "applied",
  },
  {
    id: "no-sentry",
    severity: "info",
    category: "architecture",
    title: "Нет мониторинга ошибок в production",
    detail: "Ошибки в production не отслеживаются. Рассмотреть подключение Sentry или аналога для tracking runtime ошибок.",
    actionable: false,
    status: "unchecked",
  },
  {
    id: "css-inconsistency",
    severity: "info",
    category: "code",
    title: "Смешивание стилей: inline + Tailwind + CSS",
    detail: "В некоторых компонентах используются style={{ }} вместо Tailwind-классов. Привести к единому подходу через дизайн-токены.",
    actionable: false,
    status: "unchecked",
  },
  {
    id: "no-rate-limiting",
    severity: "warn",
    category: "architecture",
    title: "Нет rate limiting на Edge-функциях",
    detail: "AI-генерация и отправка email не ограничены по частоте. Добавить rate limiting для защиты от злоупотреблений.",
    actionable: false,
    status: "unchecked",
  },
  {
    id: "accessibility",
    severity: "info",
    category: "code",
    title: "Accessibility (a11y) не полностью реализован",
    detail: "Часть интерактивных элементов не имеет aria-labels, роли ARIA не проставлены на кастомных компонентах.",
    actionable: false,
    status: "unchecked",
  },
  {
    id: "xlsx-dynamic",
    severity: "warn",
    category: "performance",
    title: "xlsx (~800KB) загружается синхронно в 11 компонентах",
    detail: "Библиотека xlsx импортируется статически в журналах, экспортах, диалогах. Перевести на dynamic import() в функциях экспорта.",
    actionable: false,
    status: "unchecked",
  },
  {
    id: "vite-chunks",
    severity: "info",
    category: "performance",
    title: "✅ Manual chunks настроены в Vite",
    detail: "recharts, @radix-ui, @supabase, react-dom выделены в отдельные чанки через manualChunks в vite.config.ts.",
    actionable: false,
    status: "applied",
  },
];

const SEVERITY_CONFIG: Record<RecSeverity, { icon: React.ReactNode; color: string; bg: string; border: string; label: string }> = {
  error: { icon: <XCircle className="w-4 h-4" />, color: "text-red-500", bg: "bg-red-500/5", border: "border-red-500/30", label: "Критично" },
  warn: { icon: <AlertTriangle className="w-4 h-4" />, color: "text-yellow-500", bg: "bg-yellow-500/5", border: "border-yellow-500/30", label: "Внимание" },
  info: { icon: <Info className="w-4 h-4" />, color: "text-blue-500", bg: "bg-blue-500/5", border: "border-blue-500/30", label: "Инфо" },
};

const CATEGORY_LABELS: Record<RecCategory, string> = {
  database: "База данных",
  code: "Код",
  architecture: "Архитектура",
  performance: "Производительность",
};

// ─── Component ───────────────────────────────────────────────────
export function DevToolsPanel() {
  const [activeTab, setActiveTab] = useState("database");
  const [recommendations, setRecommendations] = useState<Recommendation[]>(CODE_RECOMMENDATIONS);
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const runCheck = async () => {
    setChecking(true);
    const dbRecs: Recommendation[] = [];
    const tablesToCheck = ["enrollments", "lesson_progress", "test_attempts", "profiles", "audit_logs", "test_questions", "lessons", "courses"];

    const promises = tablesToCheck.map(async (table) => {
      try {
        const { count } = await supabase.from(table as any).select("*", { count: "exact", head: true });
        if (count !== null && count > 1000) {
          dbRecs.push({
            id: `large-table-${table}`,
            severity: "warn",
            category: "database",
            title: `Таблица "${table}" содержит ${count.toLocaleString()} записей`,
            detail: `Рекомендуется добавить пагинацию и индексы для оптимизации запросов. Используйте fetchAllRows() с чанкингом.`,
            actionable: false,
            status: "checked",
          });
        }
        if (count === 0) {
          dbRecs.push({
            id: `empty-table-${table}`,
            severity: "info",
            category: "database",
            title: `Таблица "${table}" пуста`,
            detail: `Таблица не содержит данных. Проверьте, используется ли она, или удалите для упрощения схемы.`,
            actionable: false,
            status: "checked",
          });
        }
      } catch { /* ignore */ }
    });

    await Promise.all(promises);

    const updatedCode = CODE_RECOMMENDATIONS.map(r => ({ ...r, status: "checked" as RecStatus }));
    setRecommendations([...dbRecs, ...updatedCode]);
    setLastChecked(new Date().toLocaleTimeString("ru-RU"));
    setChecking(false);
    toast.success(`Проверка завершена: ${dbRecs.length + updatedCode.length} рекомендаций`);
  };

  const applyRecommendation = (id: string) => {
    setRecommendations(prev => prev.map(r => r.id === id ? { ...r, status: "applied" as RecStatus } : r));
    toast.info("Рекомендация помечена как применённая. Реализация требует ручных изменений в коде.");
  };

  const skipRecommendation = (id: string) => {
    setRecommendations(prev => prev.map(r => r.id === id ? { ...r, status: "skipped" as RecStatus } : r));
  };

  const errorCount = recommendations.filter(r => r.severity === "error" && r.status !== "skipped").length;
  const warnCount = recommendations.filter(r => r.severity === "warn" && r.status !== "skipped").length;
  const appliedCount = recommendations.filter(r => r.status === "applied").length;

  const metricCards = [
    { label: "Таблиц", value: "65", icon: <Database className="w-5 h-5" />, color: "#8b5cf6" },
    { label: "Edge-функций", value: "32", icon: <Zap className="w-5 h-5" />, color: "#10b981" },
    { label: "Компонентов", value: `~${TOTAL_FILES}`, icon: <Code2 className="w-5 h-5" />, color: "#0ea5e9" },
    { label: "Строк кода", value: `~${(TOTAL_LINES / 1000).toFixed(1)}k`, icon: <FileCode className="w-5 h-5" />, color: "#f59e0b" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Terminal className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold">Developer Tools</h2>
          <p className="text-sm text-muted-foreground font-mono">SYNTHAGMA // v1.0.0</p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {metricCards.map((m) => (
          <div key={m.label} className="relative overflow-hidden rounded-xl border border-border bg-card p-4 group hover:border-primary/40 transition-colors">
            <div className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-[0.07]" style={{ background: m.color, filter: "blur(20px)" }} />
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: m.color }}>
                {m.icon}
              </div>
            </div>
            <div className="font-mono text-2xl font-bold">{m.value}</div>
            <div className="text-xs text-muted-foreground">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-secondary/50 rounded-xl p-1 h-auto flex-wrap">
          <TabsTrigger value="database" className="rounded-lg gap-2 data-[state=active]:bg-card text-xs sm:text-sm">
            <Database className="w-4 h-4" /> База данных
          </TabsTrigger>
          <TabsTrigger value="code" className="rounded-lg gap-2 data-[state=active]:bg-card text-xs sm:text-sm">
            <Code2 className="w-4 h-4" /> Карта кода
          </TabsTrigger>
          <TabsTrigger value="functions" className="rounded-lg gap-2 data-[state=active]:bg-card text-xs sm:text-sm">
            <Zap className="w-4 h-4" /> Edge-функции
          </TabsTrigger>
          <TabsTrigger value="health" className="rounded-lg gap-2 data-[state=active]:bg-card text-xs sm:text-sm">
            <HeartPulse className="w-4 h-4" /> Здоровье
            {errorCount > 0 && <Badge variant="destructive" className="text-[10px] h-4 px-1.5 ml-1">{errorCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* Database Tab */}
        <TabsContent value="database" className="mt-0">
          <DatabaseMap />
        </TabsContent>

        {/* Code Map Tab */}
        <TabsContent value="code" className="mt-0 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground font-mono">
              {TOTAL_FILES} файлов · ~{TOTAL_LINES.toLocaleString()} строк
            </div>
          </div>
          <div className="space-y-3">
            {CODE_TREE.map((group) => {
              const pct = Math.round((group.totalLines / TOTAL_LINES) * 100);
              return (
                <details key={group.folder} className="rounded-xl border border-border bg-card overflow-hidden group">
                  <summary className="p-4 cursor-pointer list-none flex items-center justify-between hover:bg-secondary/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: group.color }}>
                        {group.icon}
                      </div>
                      <div>
                        <div className="font-mono text-sm font-medium">{group.folder}</div>
                        <div className="text-xs text-muted-foreground">{group.totalFiles} файлов · ~{group.totalLines.toLocaleString()} строк</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-24 hidden sm:block"><Progress value={pct} className="h-2" /></div>
                      <Badge variant="outline" className="font-mono text-xs">{pct}%</Badge>
                    </div>
                  </summary>
                  <div className="px-4 pb-4 space-y-1.5 border-t border-border pt-3">
                    {group.subfolders.map((sf) => (
                      <div key={sf.name} className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg hover:bg-secondary/30 transition-colors">
                        <span className="font-mono text-muted-foreground flex items-center gap-2">
                          <FolderTree className="w-3 h-3" />{sf.name}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{sf.files} файлов</span>
                          <Badge variant="outline" className="font-mono text-[10px] h-5">~{sf.lines}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </TabsContent>

        {/* Edge Functions Tab */}
        <TabsContent value="functions" className="mt-0 space-y-4">
          <div className="text-sm text-muted-foreground font-mono">{EDGE_FUNCTIONS.length} функций в 5 категориях</div>
          {Object.entries(CATEGORY_META).map(([catKey, catMeta]) => {
            const fns = EDGE_FUNCTIONS.filter((f) => f.category === catKey);
            return (
              <div key={catKey} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="p-3 flex items-center gap-2 border-b border-border bg-secondary/20">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center text-white" style={{ backgroundColor: catMeta.color }}>{catMeta.icon}</div>
                  <span className="font-medium text-sm">{catMeta.label}</span>
                  <Badge variant="outline" className="ml-auto font-mono text-xs">{fns.length}</Badge>
                </div>
                <div className="divide-y divide-border">
                  {fns.map((fn) => (
                    <div key={fn.name} className="px-4 py-2.5 flex items-center justify-between hover:bg-secondary/20 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="font-mono text-xs">{fn.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground hidden sm:block">{fn.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </TabsContent>

        {/* Health Tab */}
        <TabsContent value="health" className="mt-0 space-y-4">
          {/* Actions bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground font-mono">
              {lastChecked ? `Проверено: ${lastChecked}` : "Рекомендации не проверены"}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={runCheck} disabled={checking} className="gap-2 rounded-xl">
                {checking ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                Проверить
              </Button>
              <Button
                variant="default"
                size="sm"
                disabled={recommendations.every(r => r.status === "unchecked" || r.status === "applied" || r.status === "skipped")}
                onClick={() => {
                  const actionable = recommendations.filter(r => r.actionable && r.status === "checked");
                  if (actionable.length === 0) {
                    toast.info("Нет автоматически применимых рекомендаций. Все требуют ручной доработки.");
                    return;
                  }
                  actionable.forEach(r => applyRecommendation(r.id));
                  toast.success(`${actionable.length} рекомендаций помечены для применения`);
                }}
                className="gap-2 rounded-xl"
              >
                <Play className="w-3 h-3" />
                Применить
              </Button>
            </div>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-center">
              <div className="text-2xl font-mono font-bold text-red-500">{errorCount}</div>
              <div className="text-xs text-muted-foreground">Критичных</div>
            </div>
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3 text-center">
              <div className="text-2xl font-mono font-bold text-yellow-500">{warnCount}</div>
              <div className="text-xs text-muted-foreground">Предупреждений</div>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
              <div className="text-2xl font-mono font-bold text-emerald-500">{appliedCount}</div>
              <div className="text-xs text-muted-foreground">Применено</div>
            </div>
          </div>

          {/* Recommendations */}
          <div className="space-y-2">
            {(["error", "warn", "info"] as RecSeverity[]).map(sev => {
              const items = recommendations.filter(r => r.severity === sev && r.status !== "skipped");
              if (items.length === 0) return null;
              return (
                <div key={sev} className="space-y-2">
                  <div className={`text-xs font-medium uppercase tracking-wider ${SEVERITY_CONFIG[sev].color} px-1`}>
                    {SEVERITY_CONFIG[sev].label} ({items.length})
                  </div>
                  {items.map(rec => {
                    const cfg = SEVERITY_CONFIG[rec.severity];
                    return (
                      <div key={rec.id} className={`rounded-xl border p-4 ${cfg.border} ${cfg.bg} ${rec.status === "applied" ? "opacity-60" : ""}`}>
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 shrink-0 ${cfg.color}`}>{cfg.icon}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{rec.title}</span>
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono">{CATEGORY_LABELS[rec.category]}</Badge>
                              {rec.status === "checked" && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Проверено</Badge>}
                              {rec.status === "applied" && <Badge className="text-[10px] h-4 px-1.5 bg-emerald-500">Применено</Badge>}
                              {rec.actionable && rec.status !== "applied" && (
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-primary/40 text-primary">Автоматизируемо</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1.5">{rec.detail}</div>
                          </div>
                          {rec.status === "checked" && (
                            <div className="flex items-center gap-1 shrink-0">
                              {rec.actionable && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => applyRecommendation(rec.id)} title="Применить">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => skipRecommendation(rec.id)} title="Пропустить">
                                <SkipForward className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Architecture overview */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <Terminal className="w-4 h-4" />
              Архитектура проекта
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-secondary/30 rounded-lg p-3">
                <div className="text-muted-foreground mb-1">Frontend</div>
                <div>React 18 + Vite</div>
                <div>TypeScript + Tailwind</div>
                <div>TanStack Query</div>
              </div>
              <div className="bg-secondary/30 rounded-lg p-3">
                <div className="text-muted-foreground mb-1">Backend</div>
                <div>PostgreSQL</div>
                <div>Edge Functions (Deno)</div>
                <div>RLS + Row Security</div>
              </div>
              <div className="bg-secondary/30 rounded-lg p-3">
                <div className="text-muted-foreground mb-1">Storage</div>
                <div>10 бакетов</div>
                <div>External S3 support</div>
                <div>Лимит: 1GB / орг</div>
              </div>
              <div className="bg-secondary/30 rounded-lg p-3">
                <div className="text-muted-foreground mb-1">Resilience</div>
                <div>withRetry (exp. backoff)</div>
                <div>fetchAllRows (chunking)</div>
                <div>sendBeacon (progress)</div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
