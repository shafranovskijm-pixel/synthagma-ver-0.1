import { useState, useRef } from "react";
import { Settings, Brain, FileSpreadsheet, DollarSign, RotateCcw, Upload, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

// Default prompts extracted from edge functions
const DEFAULT_PROMPTS = {
  structure: `Ты - эксперт по созданию образовательных курсов для дополнительного профессионального образования (ДПО).

Твоя задача - создать структуру учебного курса на основе названия и описания.

ТИПЫ УРОКОВ (используй ТОЛЬКО эти три):
- "text" — теоретическая лекция (основной тип)
- "test" — промежуточный или итоговый тест для проверки знаний
- "practice" — практическое задание: ситуационная задача, кейс, анализ документа, разбор реальной ситуации

ЗАПРЕЩЕНО использовать типы "video" и "audio" — курс полностью текстовый.

ПРАВИЛА СТРУКТУРЫ:
1. Создай от 8 до 15 уроков в зависимости от сложности темы
2. Начинай с вводной лекции (общие понятия, цели курса, нормативная база)
3. После каждых 2-3 теоретических лекций ставь промежуточный тест
4. Включи 1-2 практических задания (кейсы, ситуационные задачи, анализ документов)
5. ОБЯЗАТЕЛЬНО: последний урок курса должен быть тестом с названием "Итоговое тестирование" (тип "test")
6. Названия уроков должны быть конкретными и профессиональными
7. Логика: от базовых понятий → к деталям → к практике → к проверке`,

  content: `Ты эксперт по промышленной безопасности и нормативам Ростехнадзора. Создай подробный учебный материал.
Правила:
1. Структурированный текст с заголовками (используй Markdown)
2. Ссылки на нормативные документы (ФЗ, приказы, постановления)
3. Практические примеры и ситуации
4. Минимум 500 слов
5. На русском языке`,

  answers: `Ты эксперт в области промышленной безопасности, охраны труда и нормативов Ростехнадзора. 
Тебе даны тестовые вопросы с вариантами ответов. Определи правильный ответ для каждого вопроса.
Отвечай СТРОГО в формате JSON-массива, где каждый элемент — объект с полями:
- "questionIndex": номер вопроса (начиная с 0)
- "correctAnswer": индекс правильного ответа (начиная с 0)
- "explanation": краткое пояснение, почему этот ответ правильный (1-2 предложения)

Пример: [{"questionIndex": 0, "correctAnswer": 2, "explanation": "Согласно ФЗ-116..."}]
Отвечай ТОЛЬКО JSON-массивом, без markdown-обертки.`,
};

export interface MarketplacePrompts {
  structure: string;
  content: string;
  answers: string;
}

export interface MarketplaceSettingsData {
  freeForOrgs: boolean;
  defaultPriceStudent: number;
  defaultPriceOrg: number;
}

const PROMPTS_KEY = "marketplace_prompts";
const SETTINGS_KEY = "marketplace_settings";

export function getMarketplacePrompts(): MarketplacePrompts {
  try {
    const saved = localStorage.getItem(PROMPTS_KEY);
    if (saved) return { ...DEFAULT_PROMPTS, ...JSON.parse(saved) };
  } catch {}
  return { ...DEFAULT_PROMPTS };
}

export function getMarketplaceSettings(): MarketplaceSettingsData {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return { freeForOrgs: true, defaultPriceStudent: 0, defaultPriceOrg: 0 };
}

interface ExcelCourse {
  title: string;
  description?: string;
  duration?: string;
}

interface Props {
  onRefresh: () => void;
}

export function MarketplaceSettings({ onRefresh }: Props) {
  // Prompts
  const [prompts, setPrompts] = useState<MarketplacePrompts>(getMarketplacePrompts);
  const [promptsOpen, setPromptsOpen] = useState(false);

  // Excel import
  const [excelOpen, setExcelOpen] = useState(false);
  const [parsedCourses, setParsedCourses] = useState<ExcelCourse[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<MarketplaceSettingsData>(getMarketplaceSettings);

  // Save prompts
  const savePrompts = (newPrompts: MarketplacePrompts) => {
    setPrompts(newPrompts);
    localStorage.setItem(PROMPTS_KEY, JSON.stringify(newPrompts));
    toast.success("Промты сохранены");
  };

  const resetPrompt = (key: keyof MarketplacePrompts) => {
    const updated = { ...prompts, [key]: DEFAULT_PROMPTS[key] };
    setPrompts(updated);
    localStorage.setItem(PROMPTS_KEY, JSON.stringify(updated));
    toast.info("Промт сброшен к дефолту");
  };

  // Save settings
  const saveSettings = (newSettings: MarketplaceSettingsData) => {
    setSettings(newSettings);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    toast.success("Настройки сохранены");
  };

  // Apply free pricing to all existing courses
  const applyFreePricing = async () => {
    try {
      const { error } = await supabase
        .from("marketplace_courses")
        .update({ price_organization: 0 } as any)
        .gte("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
      toast.success("Все курсы стали бесплатными для организаций");
      onRefresh();
    } catch (e) {
      console.error(e);
      toast.error("Ошибка обновления цен");
    }
  };

  // Excel parsing
  const handleExcelFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (rows.length < 2) {
          toast.error("Файл пуст или не содержит данных");
          return;
        }

        // Find header row
        const header = rows[0].map((h: any) => String(h || "").toLowerCase().trim());
        const titleIdx = header.findIndex(h => h.includes("назван") || h.includes("title") || h === "курс");
        const descIdx = header.findIndex(h => h.includes("описан") || h.includes("description"));
        const durIdx = header.findIndex(h => h.includes("длительн") || h.includes("duration") || h.includes("час"));

        if (titleIdx === -1) {
          toast.error("Не найдена колонка «Название». Убедитесь, что первая строка — заголовки.");
          return;
        }

        const courses: ExcelCourse[] = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const title = String(row[titleIdx] || "").trim();
          if (!title) continue;
          courses.push({
            title,
            description: descIdx >= 0 ? String(row[descIdx] || "").trim() : undefined,
            duration: durIdx >= 0 ? String(row[durIdx] || "").trim() : undefined,
          });
        }

        setParsedCourses(courses);
        toast.success(`Найдено ${courses.length} курсов`);
      } catch (err) {
        console.error(err);
        toast.error("Ошибка чтения файла");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  // Create courses from parsed Excel data
  const handleCreateAll = async () => {
    if (parsedCourses.length === 0) return;
    setIsImporting(true);
    setImportProgress(0);
    setImportTotal(parsedCourses.length);

    const priceOrg = settings.freeForOrgs ? 0 : settings.defaultPriceOrg;
    const priceStudent = settings.defaultPriceStudent;

    let created = 0;
    for (const course of parsedCourses) {
      try {
        // Create course
        const { data: courseData, error: courseErr } = await supabase
          .from("courses")
          .insert({
            title: course.title,
            description: course.description || null,
            duration: course.duration || null,
            organization_id: "00000000-0000-0000-0000-000000000000",
            is_published: true,
          })
          .select("id")
          .single();
        if (courseErr) throw courseErr;

        // Add to marketplace
        await supabase.from("marketplace_courses").insert({
          course_id: courseData.id,
          organization_id: "00000000-0000-0000-0000-000000000000",
          price_student: priceStudent,
          price_organization: priceOrg,
          is_active: true,
          is_validated: false,
        } as any);

        created++;
      } catch (e) {
        console.error(`Failed to create "${course.title}":`, e);
      }
      setImportProgress(prev => prev + 1);
    }

    setIsImporting(false);
    setParsedCourses([]);
    toast.success(`Создано ${created} из ${parsedCourses.length} курсов`);
    onRefresh();
  };

  const promptSections: Array<{ key: keyof MarketplacePrompts; label: string; description: string }> = [
    { key: "structure", label: "Генерация структуры", description: "Промт для создания списка уроков курса" },
    { key: "content", label: "Генерация контента", description: "Промт для заполнения текстовых уроков" },
    { key: "answers", label: "Решение тестов", description: "Промт для определения правильных ответов" },
  ];

  return (
    <div className="space-y-4">
      {/* AI Prompts Section */}
      <Collapsible open={promptsOpen} onOpenChange={setPromptsOpen}>
        <Card>
          <CollapsibleTrigger className="w-full">
            <CardHeader className="flex flex-row items-center gap-3 cursor-pointer hover:bg-secondary/30 transition-colors">
              <Brain className="w-5 h-5 text-primary" />
              <div className="text-left flex-1">
                <CardTitle className="text-base">Промты ИИ</CardTitle>
                <CardDescription>Настройте системные промты для генерации контента</CardDescription>
              </div>
              <Badge variant="outline">3 промта</Badge>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6 pt-0">
              {promptSections.map(({ key, label, description }) => (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="font-medium">{label}</Label>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => resetPrompt(key)}
                      className="gap-1 text-xs"
                    >
                      <RotateCcw className="w-3 h-3" />Сброс
                    </Button>
                  </div>
                  <Textarea
                    value={prompts[key]}
                    onChange={(e) => setPrompts(prev => ({ ...prev, [key]: e.target.value }))}
                    rows={6}
                    className="rounded-xl text-xs font-mono"
                  />
                </div>
              ))}
              <Button onClick={() => savePrompts(prompts)} className="w-full rounded-xl">
                Сохранить промты
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Excel Import Section */}
      <Collapsible open={excelOpen} onOpenChange={setExcelOpen}>
        <Card>
          <CollapsibleTrigger className="w-full">
            <CardHeader className="flex flex-row items-center gap-3 cursor-pointer hover:bg-secondary/30 transition-colors">
              <FileSpreadsheet className="w-5 h-5 text-green-600" />
              <div className="text-left flex-1">
                <CardTitle className="text-base">Быстрый импорт из Excel</CardTitle>
                <CardDescription>Загрузите файл с названиями курсов для массового создания</CardDescription>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
              <div className="border-2 border-dashed rounded-xl p-6 text-center space-y-3">
                <FileSpreadsheet className="w-10 h-10 text-muted-foreground mx-auto" />
                <div>
                  <p className="text-sm font-medium">Загрузите Excel-файл</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Колонки: «Название» (обязательно), «Описание», «Длительность»
                  </p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleExcelFile}
                />
                <Button variant="outline" onClick={() => fileRef.current?.click()} className="rounded-xl">
                  <Upload className="w-4 h-4 mr-2" />Выбрать файл
                </Button>
              </div>

              {parsedCourses.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">{parsedCourses.length} курсов найдено</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setParsedCourses([])}
                    >
                      Очистить
                    </Button>
                  </div>
                  <ScrollArea className="max-h-60 border rounded-xl">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8">#</TableHead>
                          <TableHead>Название</TableHead>
                          <TableHead>Описание</TableHead>
                          <TableHead className="w-24">Длительность</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedCourses.map((c, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                            <TableCell className="text-sm font-medium">{c.title}</TableCell>
                            <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">{c.description || "—"}</TableCell>
                            <TableCell className="text-xs">{c.duration || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>

                  {isImporting && (
                    <div className="space-y-2">
                      <Progress value={(importProgress / importTotal) * 100} className="h-2" />
                      <p className="text-xs text-muted-foreground text-center">
                        {importProgress} / {importTotal}
                      </p>
                    </div>
                  )}

                  <Button
                    onClick={handleCreateAll}
                    disabled={isImporting}
                    className="w-full rounded-xl"
                  >
                    {isImporting ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Создание...</>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4 mr-2" />Создать все ({parsedCourses.length})</>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Marketplace Access Settings */}
      <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
        <Card>
          <CollapsibleTrigger className="w-full">
            <CardHeader className="flex flex-row items-center gap-3 cursor-pointer hover:bg-secondary/30 transition-colors">
              <DollarSign className="w-5 h-5 text-amber-600" />
              <div className="text-left flex-1">
                <CardTitle className="text-base">Настройки доступа</CardTitle>
                <CardDescription>Ценообразование и бесплатный доступ для организаций</CardDescription>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-5 pt-0">
              <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                <div>
                  <p className="text-sm font-medium">Бесплатные курсы для организаций</p>
                  <p className="text-xs text-muted-foreground">Все курсы будут доступны бесплатно</p>
                </div>
                <Switch
                  checked={settings.freeForOrgs}
                  onCheckedChange={(v) => {
                    const updated = { ...settings, freeForOrgs: v };
                    if (v) updated.defaultPriceOrg = 0;
                    saveSettings(updated);
                  }}
                />
              </div>

              {settings.freeForOrgs && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full rounded-xl"
                  onClick={applyFreePricing}
                >
                  Применить ко всем существующим курсам
                </Button>
              )}

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Цена для студентов (₽)</Label>
                  <Input
                    type="number"
                    value={settings.defaultPriceStudent}
                    onChange={(e) => setSettings(prev => ({ ...prev, defaultPriceStudent: parseInt(e.target.value) || 0 }))}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Цена для организаций (₽)</Label>
                  <Input
                    type="number"
                    value={settings.freeForOrgs ? 0 : settings.defaultPriceOrg}
                    disabled={settings.freeForOrgs}
                    onChange={(e) => setSettings(prev => ({ ...prev, defaultPriceOrg: parseInt(e.target.value) || 0 }))}
                    className="rounded-xl"
                  />
                </div>
              </div>

              <Button
                onClick={() => saveSettings(settings)}
                variant="outline"
                className="w-full rounded-xl"
              >
                Сохранить настройки
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
