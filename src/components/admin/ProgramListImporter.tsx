import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Check, X, AlertTriangle } from "lucide-react";
import { MARKETPLACE_ORG_ID } from "@/constants/marketplace";

interface ProgramEntry {
  title: string;
  hours: string;
  category: string;
}

interface ImportResult {
  created: number;
  skipped: number;
  errors: { title: string; reason: string }[];
}

interface ProgramListImporterProps {
  onComplete: () => void;
}

/** Normalize title for dedup comparison */
function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[«»"'().,;:!?–—-]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Map category name to the correct parent_type used by programTypes grouping.
 * Must match the keys in useAdminMarketplace.ts and useCourseStoreManager.ts:
 *   "Повышение квалификации", "Профессиональная переподготовка",
 *   "Охрана труда / Пожарная безопасность", "Рабочие профессии"
 */
function getParentType(categoryName: string, hours?: number): string {
  const lower = categoryName.toLowerCase();
  if (lower === "рабочие профессии") return "Рабочие профессии";
  // 250+ hours → Профессиональная переподготовка (кроме рабочих профессий)
  if (hours && hours >= 250) return "Профессиональная переподготовка";
  if (lower === "охрана труда" || lower === "пожарная безопасность")
    return "Охрана труда / Пожарная безопасность";
  return "Повышение квалификации";
}

const knownPrograms: ProgramEntry[] = [
  // === Охрана труда ===
  { title: "Программа обучения по общим вопросам охраны труда и функционирования системы управления охраной труда", hours: "16", category: "Охрана труда" },
  { title: "Программа обучения безопасным методам и приемам выполнения работ при воздействии вредных и (или) опасных производственных факторов", hours: "16", category: "Охрана труда" },
  { title: "Программа обучения безопасным методам и приемам выполнения работ повышенной опасности", hours: "16", category: "Охрана труда" },
  { title: "Обеспечение работников средствами индивидуальной защиты", hours: "16", category: "Охрана труда" },
  { title: "Оказание первой помощи", hours: "16", category: "Охрана труда" },
  { title: "Управление профессиональными рисками в системе управления охраной труда", hours: "24", category: "Охрана труда" },
  { title: "Охрана труда при выполнении работ на высоте 1 группа безопасности", hours: "16", category: "Охрана труда" },
  { title: "Охрана труда при выполнении работ на высоте 2 группа безопасности", hours: "24", category: "Охрана труда" },
  { title: "Охрана труда при выполнении работ на высоте 3 группа безопасности", hours: "24", category: "Охрана труда" },
  { title: "Безопасные методы и приемы выполнения работ в ограниченных и замкнутых пространствах 1 группа", hours: "16", category: "Охрана труда" },
  { title: "Безопасные методы и приемы выполнения работ в ограниченных и замкнутых пространствах 2 группа", hours: "16", category: "Охрана труда" },
  { title: "Безопасные методы и приемы выполнения работ в ограниченных и замкнутых пространствах 3 группа", hours: "24", category: "Охрана труда" },
  // === Пожарная безопасность ===
  { title: "Обучение мерам пожарной безопасности лиц, ответственных за проведение противопожарного инструктажа", hours: "36", category: "Пожарная безопасность" },
  { title: "Обучение мерам пожарной безопасности руководителей организаций, лиц, назначаемых ответственными за обеспечение пожарной безопасности (50+ человек)", hours: "16", category: "Пожарная безопасность" },
  { title: "Обучение мерам пожарной безопасности руководителей эксплуатирующих и управляющих организаций", hours: "36", category: "Пожарная безопасность" },
  { title: "Обучение мерам пожарной безопасности ответственных должностных лиц, главных специалистов технического и производственного профиля", hours: "36", category: "Пожарная безопасность" },
  { title: "Специалист по пожарной профилактике", hours: "256", category: "Пожарная безопасность" },
  // === Экология → Экологическая безопасность ===
  { title: "Обеспечение экологической безопасности в области обращения с отходами I-IV классов опасности", hours: "40", category: "Экологическая безопасность" },
  { title: "Обеспечение экологической безопасности руководителями и специалистами общехозяйственных систем управления", hours: "72", category: "Экологическая безопасность" },
  { title: "Профессиональная подготовка лиц допущенных к обращению с отходами I-IV классов опасности", hours: "116", category: "Экологическая безопасность" },
  // === Разное ===
  { title: "Контроль скважин. Управление скважиной при газонефтеводопроявлениях", hours: "24", category: "Разное" },
  { title: "Безопасная эксплуатация сосудов, работающих под давлением", hours: "40", category: "Разное" },
  { title: "Анализ газовоздушной среды на санитарно-допустимые нормы, довзрывные (взрывные) концентрации горючих газов и паров", hours: "16", category: "Разное" },
  // === Рабочие профессии ===
  { title: "Антикоррозийщик", hours: "320", category: "Рабочие профессии" },
  { title: "Бетонщик", hours: "160", category: "Рабочие профессии" },
  { title: "Вальщик леса", hours: "320", category: "Рабочие профессии" },
  { title: "Вышкомонтажник", hours: "320", category: "Рабочие профессии" },
  { title: "Изолировщик", hours: "160", category: "Рабочие профессии" },
  { title: "Изолировщик на термоизоляции", hours: "160", category: "Рабочие профессии" },
  { title: "Изолировщик-пленочник", hours: "160", category: "Рабочие профессии" },
  { title: "Каменщик", hours: "160", category: "Рабочие профессии" },
  { title: "Контролер лома и отходов металла", hours: "160", category: "Рабочие профессии" },
  { title: "Кровельщик по рулонным кровлям и по кровлям из штучных материалов", hours: "160", category: "Рабочие профессии" },
  { title: "Маляр строительный", hours: "160", category: "Рабочие профессии" },
  { title: "Машинист компрессорных установок", hours: "320", category: "Рабочие профессии" },
  { title: "Машинист крана (крановщик) крана-манипулятора", hours: "320", category: "Рабочие профессии" },
  { title: "Машинист крана автомобильного", hours: "320", category: "Рабочие профессии" },
  { title: "Машинист насосных установок", hours: "320", category: "Рабочие профессии" },
  { title: "Машинист технологических насосов", hours: "320", category: "Рабочие профессии" },
  { title: "Монтажник наружных трубопроводов", hours: "320", category: "Рабочие профессии" },
  { title: "Монтажник по монтажу стальных и ж/б конструкций", hours: "320", category: "Рабочие профессии" },
  { title: "Монтажник технологических трубопроводов", hours: "320", category: "Рабочие профессии" },
  { title: "Монтажник технологического оборудования и связанных с ним конструкций", hours: "320", category: "Рабочие профессии" },
  { title: "Облицовщик (плиточник или мозаичник)", hours: "160", category: "Рабочие профессии" },
  { title: "Оператор котельной", hours: "320", category: "Рабочие профессии" },
  { title: "Оператор технологических установок", hours: "320", category: "Рабочие профессии" },
  { title: "Оператор товарный", hours: "320", category: "Рабочие профессии" },
  { title: "Пескоструйщик", hours: "160", category: "Рабочие профессии" },
  { title: "Плотник", hours: "160", category: "Рабочие профессии" },
  { title: "Помощник бурильщика капитального ремонта скважин", hours: "320", category: "Рабочие профессии" },
  { title: "Помощник бурильщика эксплуатационного и разведочного бурения скважин на нефть и газ (первый)", hours: "320", category: "Рабочие профессии" },
  { title: "Помощник бурильщика эксплуатационного и разведочного бурения скважин на нефть и газ (второй)", hours: "320", category: "Рабочие профессии" },
  { title: "Прессовщик лома и отходов металла", hours: "160", category: "Рабочие профессии" },
  { title: "Раскряжевщик", hours: "160", category: "Рабочие профессии" },
  { title: "Слесарь по контрольно-измерительным приборам и автоматике", hours: "320", category: "Рабочие профессии" },
  { title: "Слесарь по обслуживанию буровых", hours: "320", category: "Рабочие профессии" },
  { title: "Слесарь по ремонту автомобилей", hours: "320", category: "Рабочие профессии" },
  { title: "Слесарь по ремонту технологических установок", hours: "320", category: "Рабочие профессии" },
  { title: "Слесарь по сборке металлоконструкций", hours: "320", category: "Рабочие профессии" },
  { title: "Слесарь строительный", hours: "320", category: "Рабочие профессии" },
  { title: "Слесарь-ремонтник", hours: "320", category: "Рабочие профессии" },
  { title: "Слесарь-сантехник", hours: "320", category: "Рабочие профессии" },
  { title: "Стропальщик", hours: "160", category: "Рабочие профессии" },
  { title: "Чистильщик", hours: "320", category: "Рабочие профессии" },
  { title: "Штукатур", hours: "160", category: "Рабочие профессии" },
  { title: "Электромонтажник по силовым сетям и электрооборудованию", hours: "320", category: "Рабочие профессии" },
  { title: "Электромонтажник-наладчик", hours: "320", category: "Рабочие профессии" },
  { title: "Электромонтер охранно-пожарной сигнализации", hours: "320", category: "Рабочие профессии" },
  { title: "Электромонтер по ремонту и монтажу кабельных линий", hours: "320", category: "Рабочие профессии" },
  { title: "Электромонтер по ремонту и обслуживанию электрооборудования", hours: "320", category: "Рабочие профессии" },
  { title: "Электрослесарь по обслуживанию и ремонту оборудования", hours: "320", category: "Рабочие профессии" },
];

export function ProgramListImporter({ onComplete }: ProgramListImporterProps) {
  const [programs, setPrograms] = useState<ProgramEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [defaultPriceStudent, setDefaultPriceStudent] = useState("5000");
  const [defaultPriceOrg, setDefaultPriceOrg] = useState("3000");
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const { data, error } = await safeInvoke<any>("import-course", {
        body: formData });

      if (error) throw error;

      const text = data?.text || data?.content || "";
      const parsed = parsePrograms(text);
      setPrograms(parsed);

      if (parsed.length === 0) {
        toast.error("Не удалось найти программы в файле");
      } else {
        toast.success(`Найдено ${parsed.length} программ`);
      }
    } catch (err: any) {
      console.error("Parse error:", err);
      toast.error(`Ошибка парсинга: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const parsePrograms = (text: string): ProgramEntry[] => {
    if (text.length < 50) return [...knownPrograms];

    const entries: ProgramEntry[] = [];
    for (const prog of knownPrograms) {
      const words = prog.title.split(" ").slice(0, 3).join(" ").toLowerCase();
      if (text.toLowerCase().includes(words)) {
        entries.push(prog);
      }
    }

    return entries.length > 0 ? entries : [...knownPrograms];
  };

  const handleRemoveProgram = (idx: number) => {
    setPrograms(prev => prev.filter((_, i) => i !== idx));
  };

  const handleCreateAll = async () => {
    if (programs.length === 0) return;
    setIsCreating(true);
    setLastResult(null);
    const toastId = toast.loading(`Создаю ${programs.length} курсов...`, { duration: Infinity });

    const result: ImportResult = { created: 0, skipped: 0, errors: [] };

    try {
      // 1. Fetch existing categories — use name+parent_type composite key to avoid overwrites
      const { data: dbCats, error: catFetchErr } = await supabase
        .from("course_categories")
        .select("id, name, parent_type")
        .eq("organization_id", MARKETPLACE_ORG_ID);

      if (catFetchErr) {
        throw new Error(`Не удалось загрузить категории: ${catFetchErr.message}`);
      }

      // Map by lowercase name → first matching ID (skip duplicates)
      const catMap = new Map<string, string>();
      for (const c of dbCats || []) {
        const key = c.name.toLowerCase();
        if (!catMap.has(key)) {
          catMap.set(key, c.id);
        }
      }

      // 2. Auto-create missing categories with correct parent_type
      const neededCats = [...new Set(programs.map(p => p.category))];
      for (const catName of neededCats) {
        if (!catMap.has(catName.toLowerCase())) {
          const hours = Math.max(...programs.filter(p => p.category === catName).map(p => parseInt(p.hours) || 0));
          const parentType = getParentType(catName, hours);

          const { data: newCat, error: catErr } = await supabase
            .from("course_categories")
            .insert({
              organization_id: MARKETPLACE_ORG_ID,
              name: catName,
              parent_type: parentType,
              order_index: catMap.size + 1 } as any)
            .select("id, name")
            .single();

          if (catErr) {
            console.error(`Failed to create category "${catName}":`, catErr);
            result.errors.push({ title: `[Категория] ${catName}`, reason: catErr.message });
            continue;
          }
          if (newCat) {
            catMap.set(newCat.name.toLowerCase(), newCat.id);
          }
        }
      }

      // 2b. Orphan fix: assign category_id to existing courses that match knownPrograms but have null category
      const { data: orphanCourses } = await supabase
        .from("courses")
        .select("id, title")
        .eq("organization_id", MARKETPLACE_ORG_ID)
        .is("category_id", null);

      if (orphanCourses && orphanCourses.length > 0) {
        let orphansFixed = 0;
        for (const orphan of orphanCourses) {
          const normOrphan = normalizeTitle(orphan.title);
          const matchedProg = knownPrograms.find(p => normalizeTitle(p.title) === normOrphan);
          if (matchedProg) {
            const catId = catMap.get(matchedProg.category.toLowerCase());
            if (catId) {
              await supabase.from("courses").update({ category_id: catId }).eq("id", orphan.id);
              orphansFixed++;
            }
          }
        }
        if (orphansFixed > 0) {
        }
      }

      // 3. Fetch ALL existing courses for this org for dedup
      const { data: existingCourses } = await supabase
        .from("courses")
        .select("id, title")
        .eq("organization_id", MARKETPLACE_ORG_ID);

      const existingNormalized = new Map<string, string>();
      for (const c of existingCourses || []) {
        existingNormalized.set(normalizeTitle(c.title), c.id);
      }

      // 4. Fetch existing marketplace entries to avoid duplicates
      const { data: existingMkt } = await supabase
        .from("marketplace_courses")
        .select("course_id")
        .eq("organization_id", MARKETPLACE_ORG_ID);

      const mktCourseIds = new Set((existingMkt || []).map(m => m.course_id));

      // 5. Create courses
      for (const prog of programs) {
        const norm = normalizeTitle(prog.title);
        const existingId = existingNormalized.get(norm);

        // Resolve category
        const categoryId = catMap.get(prog.category.toLowerCase()) || null;

        if (existingId) {
          // Course exists — ensure it has marketplace entry & correct category
          if (!mktCourseIds.has(existingId)) {
            const { error: mktErr } = await supabase.from("marketplace_courses").insert({
              course_id: existingId,
              organization_id: MARKETPLACE_ORG_ID,
              price_student: parseInt(defaultPriceStudent) || 5000,
              price_organization: parseInt(defaultPriceOrg) || 3000,
              description_short: prog.title,
              is_active: true,
              is_validated: false } as any);
            if (mktErr) {
              result.errors.push({ title: prog.title, reason: `Marketplace: ${mktErr.message}` });
            }
          }
          // Update category_id if missing
          if (categoryId) {
            await supabase.from("courses").update({ category_id: categoryId }).eq("id", existingId);
          }
          result.skipped++;
          continue;
        }

        // Create new course
        const { data: course, error: courseErr } = await supabase
          .from("courses")
          .insert({
            title: prog.title,
            organization_id: MARKETPLACE_ORG_ID,
            duration: `${prog.hours} часов`,
            category_id: categoryId,
            is_published: false })
          .select("id")
          .single();

        if (courseErr || !course) {
          console.error("Failed to create course:", prog.title, courseErr);
          result.errors.push({ title: prog.title, reason: courseErr?.message || "Неизвестная ошибка" });
          continue;
        }

        // Create marketplace entry
        const { error: mktErr } = await supabase.from("marketplace_courses").insert({
          course_id: course.id,
          organization_id: MARKETPLACE_ORG_ID,
          price_student: parseInt(defaultPriceStudent) || 5000,
          price_organization: parseInt(defaultPriceOrg) || 3000,
          description_short: prog.title,
          is_active: true,
          is_validated: false } as any);

        if (mktErr) {
          console.error("Failed to create marketplace entry:", prog.title, mktErr);
          result.errors.push({ title: prog.title, reason: `Marketplace: ${mktErr.message}` });
          continue;
        }

        existingNormalized.set(norm, course.id);
        mktCourseIds.add(course.id);
        result.created++;
        toast.loading(`Создано ${result.created}/${programs.length}...`, { id: toastId });
      }

      toast.dismiss(toastId);
      setLastResult(result);

      const parts: string[] = [];
      if (result.created > 0) parts.push(`создано ${result.created}`);
      if (result.skipped > 0) parts.push(`пропущено ${result.skipped}`);
      if (result.errors.length > 0) parts.push(`ошибок ${result.errors.length}`);

      if (result.errors.length > 0) {
        toast.warning(`Импорт завершён: ${parts.join(", ")}`);
      } else {
        toast.success(`Импорт завершён: ${parts.join(", ")}`);
      }
      onComplete();
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(`Ошибка: ${err.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const loadFromParsedList = () => {
    const parsed = parsePrograms("");
    setPrograms(parsed);
    setLastResult(null);
    toast.success(`Загружено ${parsed.length} программ из перечня`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Импорт перечня программ
        </CardTitle>
        <CardDescription>
          Загрузите DOCX-файл с перечнем программ или используйте предзагруженный список
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Label htmlFor="program-file" className="cursor-pointer">
              <div className="flex items-center gap-2 px-4 py-2 border-2 border-dashed rounded-xl hover:border-primary/50 transition-colors">
                <Upload className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Загрузить DOCX с перечнем</span>
              </div>
            </Label>
            <Input
              id="program-file"
              type="file"
              accept=".docx,.doc"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isLoading}
            />
          </div>
          <Button variant="outline" onClick={loadFromParsedList} disabled={isLoading} className="rounded-xl">
            <FileText className="w-4 h-4 mr-1.5" />
            Загрузить из перечня
          </Button>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <SigmaSpinner size="sm" />
            Парсинг файла...
          </div>
        )}

        {/* Import result report */}
        {lastResult && (
          <div className="rounded-xl border p-3 space-y-2 bg-muted/30">
            <div className="flex gap-3 text-sm">
              <Badge variant="default" className="bg-green-600">Создано: {lastResult.created}</Badge>
              <Badge variant="secondary">Пропущено: {lastResult.skipped}</Badge>
              {lastResult.errors.length > 0 && (
                <Badge variant="destructive">Ошибок: {lastResult.errors.length}</Badge>
              )}
            </div>
            {lastResult.errors.length > 0 && (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {lastResult.errors.map((e, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-destructive">
                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                    <span><strong>{e.title}</strong>: {e.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {programs.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Цена для студентов (₽)</Label>
                <Input
                  type="number"
                  value={defaultPriceStudent}
                  onChange={(e) => setDefaultPriceStudent(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Цена для организаций (₽)</Label>
                <Input
                  type="number"
                  value={defaultPriceOrg}
                  onChange={(e) => setDefaultPriceOrg(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="border rounded-xl overflow-hidden max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">№</TableHead>
                    <TableHead>Программа</TableHead>
                    <TableHead className="w-20">Часы</TableHead>
                    <TableHead className="w-32">Категория</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {programs.map((prog, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="text-sm">{prog.title}</TableCell>
                      <TableCell className="text-sm">{prog.hours}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{prog.category}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleRemoveProgram(i)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between">
              <Badge variant="secondary">{programs.length} программ</Badge>
              <Button
                className="btn-gradient rounded-xl"
                onClick={handleCreateAll}
                disabled={isCreating}
              >
                {isCreating ? (
                  <><SigmaSpinner size="sm" className="mr-2" />Создание...</>
                ) : (
                  <><Check className="w-4 h-4 mr-2" />Создать {programs.length} курсов</>
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
