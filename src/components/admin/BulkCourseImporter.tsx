import { useState, useRef } from "react";
import {
  Upload, FileSpreadsheet, Loader2, CheckCircle2, Package, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { parseExcelBulkTests, ParsedSection } from "@/utils/excelTestBulkParser";

export function BulkCourseImporter() {
  const [sections, setSections] = useState<ParsedSection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [defaultPriceStudent, setDefaultPriceStudent] = useState("5000");
  const [defaultPriceOrg, setDefaultPriceOrg] = useState("3000");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const parsed = await parseExcelBulkTests(file);
      if (parsed.length === 0) {
        toast.error("Не удалось найти разделы с вопросами");
        return;
      }
      setSections(parsed);
      toast.success(`Найдено ${parsed.length} разделов, ${parsed.reduce((s, p) => s + p.questions.length, 0)} вопросов`);
    } catch (err) {
      console.error("Parse error:", err);
      toast.error("Ошибка чтения файла");
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleSection = (idx: number) => {
    setSections(prev => prev.map((s, i) => i === idx ? { ...s, selected: !s.selected } : s));
  };

  const updateTitle = (idx: number, title: string) => {
    setSections(prev => prev.map((s, i) => i === idx ? { ...s, customTitle: title } : s));
  };

  const selectedSections = sections.filter(s => s.selected);

  const handleCreateAll = async () => {
    if (selectedSections.length === 0) {
      toast.error("Выберите хотя бы один раздел");
      return;
    }
    if (!defaultPriceStudent || !defaultPriceOrg) {
      toast.error("Укажите цены");
      return;
    }

    setIsCreating(true);
    setProgress(0);

    try {
      // Get or create platform org
      let platformOrgId: string;
      const { data: existingOrg } = await supabase
        .from("organizations")
        .select("id")
        .eq("name", "Платформа Синтагма")
        .maybeSingle();

      if (existingOrg) {
        platformOrgId = existingOrg.id;
      } else {
        const { data: newOrg, error: orgError } = await supabase
          .from("organizations")
          .insert({ name: "Платформа Синтагма", email: "platform@synthagma.ru" })
          .select("id")
          .single();
        if (orgError) throw orgError;
        platformOrgId = newOrg.id;
      }

      let created = 0;
      for (const section of selectedSections) {
        setProgressText(`Создание: ${section.customTitle}`);

        // 1. Create course
        const { data: courseData, error: courseError } = await supabase
          .from("courses")
          .insert({
            title: section.customTitle.trim(),
            organization_id: platformOrgId,
            is_published: true,
          })
          .select("id")
          .single();
        if (courseError) throw courseError;

        // 2. Create test lesson
        const { data: lessonData, error: lessonError } = await supabase
          .from("lessons")
          .insert({
            course_id: courseData.id,
            title: section.customTitle.trim(),
            type: "test",
            order_index: 0,
            test_questions_count: Math.min(section.questions.length, 50),
            test_passing_score: 60,
          })
          .select("id")
          .single();
        if (lessonError) throw lessonError;

        // 3. Create test questions in batches of 50
        const batchSize = 50;
        for (let i = 0; i < section.questions.length; i += batchSize) {
          const batch = section.questions.slice(i, i + batchSize).map((q, idx) => ({
            lesson_id: lessonData.id,
            question: q.question,
            options: JSON.stringify(q.options),
            correct_answer: 0,
            order_index: i + idx,
            is_bank_question: true,
          }));

          const { error: qError } = await supabase
            .from("test_questions")
            .insert(batch);
          if (qError) throw qError;
        }

        // 4. Create marketplace entry
        const { error: mpError } = await supabase
          .from("marketplace_courses")
          .insert({
            course_id: courseData.id,
            organization_id: platformOrgId,
            price_student: parseFloat(defaultPriceStudent),
            price_organization: parseFloat(defaultPriceOrg),
            is_active: true,
          });
        if (mpError) throw mpError;

        created++;
        setProgress(Math.round((created / selectedSections.length) * 100));
      }

      toast.success(`Создано ${created} курсов!`);
      setSections([]);
    } catch (err: any) {
      console.error("Bulk create error:", err);
      toast.error(`Ошибка: ${err.message || "Не удалось создать курсы"}`);
    } finally {
      setIsCreating(false);
      setProgress(0);
      setProgressText("");
    }
  };

  return (
    <div className="space-y-6">
      {sections.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Массовый импорт курсов</CardTitle>
            <CardDescription>
              Загрузите Excel-файл с вопросами. Система найдёт разделы и создаст по курсу на каждый.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-dashed border-border rounded-xl p-12 text-center">
              <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground mb-4">
                Формат: заголовки разделов → «Вопрос N» → текст вопроса → варианты ответов
              </p>
              <label className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl cursor-pointer hover:bg-primary/90 transition-colors">
                {isLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Обработка...</>
                ) : (
                  <><Upload className="w-4 h-4" />Выбрать Excel-файл</>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={isLoading}
                />
              </label>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-display">Настройки импорта</CardTitle>
                  <CardDescription>
                    {selectedSections.length} из {sections.length} разделов выбрано,{" "}
                    {selectedSections.reduce((s, p) => s + p.questions.length, 0)} вопросов
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSections([])}>
                  <Trash2 className="w-4 h-4 mr-1" />Сбросить
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Цена для студентов (₽)</Label>
                  <Input
                    type="number"
                    value={defaultPriceStudent}
                    onChange={e => setDefaultPriceStudent(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Цена для организаций (₽)</Label>
                  <Input
                    type="number"
                    value={defaultPriceOrg}
                    onChange={e => setDefaultPriceOrg(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sections list */}
          <div className="space-y-3">
            {sections.map((section, idx) => (
              <Card key={idx} className={!section.selected ? "opacity-50" : ""}>
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={section.selected}
                      onCheckedChange={() => toggleSection(idx)}
                      className="mt-1"
                    />
                    <div className="flex-1 space-y-2">
                      <Input
                        value={section.customTitle}
                        onChange={e => updateTitle(idx, e.target.value)}
                        className="rounded-xl font-medium"
                        disabled={!section.selected}
                      />
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          {section.questions.length} вопросов
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Исходное название: {section.title}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Create button */}
          {isCreating ? (
            <Card>
              <CardContent className="py-6 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground truncate max-w-[70%]">{progressText}</span>
                  <span className="font-medium">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </CardContent>
            </Card>
          ) : (
            <Button
              className="w-full btn-gradient rounded-xl"
              size="lg"
              onClick={handleCreateAll}
              disabled={selectedSections.length === 0}
            >
              <Package className="w-4 h-4 mr-2" />
              Создать {selectedSections.length} курсов ({selectedSections.reduce((s, p) => s + p.questions.length, 0)} вопросов)
            </Button>
          )}
        </>
      )}
    </div>
  );
}
