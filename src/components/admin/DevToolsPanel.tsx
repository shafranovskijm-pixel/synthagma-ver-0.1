import { useState } from "react";
import { 
  Database, Code2, Zap, HeartPulse, Terminal,
  FolderTree, FileCode, Layout, Layers, Component,
  Shield, Mail, Bot, FileText, RefreshCw
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DatabaseMap } from "./DatabaseMap";

// ─── Code Map Data ───────────────────────────────────────────────
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

// ─── Edge Functions Data ─────────────────────────────────────────
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

// ─── Health Recommendations ──────────────────────────────────────
const RECOMMENDATIONS = [
  { severity: "info", text: "65 таблиц в базе данных — хорошая нормализация", detail: "Схема покрывает все основные домены" },
  { severity: "warn", text: "Таблицы enrollments, lesson_progress могут быстро расти", detail: "Рекомендуется добавить автоархивацию и пагинацию для запросов >1000 записей" },
  { severity: "warn", text: "32 Edge-функции — контролируйте холодный старт", detail: "Функции AI-генерации могут занимать до 25с. Рассмотрите увеличение таймаутов" },
  { severity: "info", text: "RLS-политики настроены на всех пользовательских таблицах", detail: "Проверяйте политики при добавлении новых таблиц" },
  { severity: "warn", text: "Лимит 1000 строк на запрос Supabase SDK", detail: "Используйте fetchAllRows() с чанкингом для больших таблиц" },
  { severity: "info", text: "withRetry утилита реализована для устойчивости", detail: "Экспоненциальная задержка при ошибках запросов" },
];

// ─── Component ───────────────────────────────────────────────────
export function DevToolsPanel() {
  const [activeTab, setActiveTab] = useState("database");

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
          <div
            key={m.label}
            className="relative overflow-hidden rounded-xl border border-border bg-card p-4 group hover:border-primary/40 transition-colors"
          >
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
                        <div className="text-xs text-muted-foreground">
                          {group.totalFiles} файлов · ~{group.totalLines.toLocaleString()} строк
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-24 hidden sm:block">
                        <Progress value={pct} className="h-2" />
                      </div>
                      <Badge variant="outline" className="font-mono text-xs">{pct}%</Badge>
                    </div>
                  </summary>
                  <div className="px-4 pb-4 space-y-1.5 border-t border-border pt-3">
                    {group.subfolders.map((sf) => (
                      <div key={sf.name} className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg hover:bg-secondary/30 transition-colors">
                        <span className="font-mono text-muted-foreground flex items-center gap-2">
                          <FolderTree className="w-3 h-3" />
                          {sf.name}
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
          <div className="text-sm text-muted-foreground font-mono">
            {EDGE_FUNCTIONS.length} функций в 5 категориях
          </div>

          {Object.entries(CATEGORY_META).map(([catKey, catMeta]) => {
            const fns = EDGE_FUNCTIONS.filter((f) => f.category === catKey);
            return (
              <div key={catKey} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="p-3 flex items-center gap-2 border-b border-border bg-secondary/20">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center text-white" style={{ backgroundColor: catMeta.color }}>
                    {catMeta.icon}
                  </div>
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
          <div className="text-sm text-muted-foreground font-mono">
            Рекомендации и диагностика
          </div>

          <div className="space-y-3">
            {RECOMMENDATIONS.map((rec, i) => (
              <div
                key={i}
                className={`rounded-xl border p-4 ${
                  rec.severity === "warn"
                    ? "border-yellow-500/30 bg-yellow-500/5"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                    rec.severity === "warn" ? "bg-yellow-500" : "bg-emerald-500"
                  }`} />
                  <div>
                    <div className="text-sm font-medium">{rec.text}</div>
                    <div className="text-xs text-muted-foreground mt-1">{rec.detail}</div>
                  </div>
                </div>
              </div>
            ))}
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
                <div>Supabase (PostgreSQL)</div>
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
