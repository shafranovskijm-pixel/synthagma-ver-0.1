import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Check, X, AlertTriangle } from "lucide-react";
import { MARKETPLACE_ORG_ID } from "@/constants/marketplace";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useAdminMarketplaceImportGuard } from "@/hooks/useAdminMarketplaceImportGuard";
import { findProgramsInImportedText, importAdminMarketplaceFile, type AdminMarketplaceImportOperation } from "@/lib/adminMarketplaceImport";
import { captureOfflineContext, isOfflineActorCurrent } from "@/utils/courseCache";

import { ProgramEntry, normalizeTitle, getParentType, knownPrograms } from "@/data/knownPrograms";

interface ImportResult {
  created: number;
  skipped: number;
  errors: { title: string; reason: string }[];
}

interface ProgramListImporterProps {
  onComplete: () => void;
}

export function ProgramListImporter({ onComplete }: ProgramListImporterProps) {
  const guard = useAdminMarketplaceImportGuard();
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ programs: ProgramEntry[]; owner: NonNullable<ReturnType<typeof captureOfflineContext>> } | null>(null);
  const programs = preview && guard.isIdentityCurrent() && isOfflineActorCurrent(preview.owner.actorId, preview.owner.revision) ? preview.programs : [];
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [defaultPriceStudent, setDefaultPriceStudent] = useState("5000");
  const [defaultPriceOrg, setDefaultPriceOrg] = useState("3000");
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);
  useEffect(() => {
    setPreview(null);
    setLastResult(null);
    setIsLoading(false);
    setIsCreating(false);
    if (fileInput.current) fileInput.current.value = "";
  }, [guard.identityKey]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const input = e.target;
    let operation: AdminMarketplaceImportOperation;
    try { operation = guard.start(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Не удалось начать импорт"); return; }
    const owner = captureOfflineContext();
    if (!owner) { operation.finish(); return; }
    setPreview(null);
    setLastResult(null);
    setIsLoading(true);
    try {
      if (!/\.docx?$/i.test(file.name) || file.size === 0 || file.size > 30 * 1024 * 1024) {
        throw new Error("Выберите непустой DOC или DOCX размером до 30 МиБ");
      }
      const document = await importAdminMarketplaceFile(file, operation);
      const parsed = findProgramsInImportedText(document.text);
      await operation.verify();
      operation.assertCurrent();
      setPreview({ programs: parsed, owner });

      if (parsed.length === 0) {
        toast.error("Не удалось найти программы в файле");
      } else {
        toast.success(`Найдено ${parsed.length} программ`);
      }
    } catch (error) {
      if (operation.isCurrent()) toast.error(`Ошибка парсинга: ${error instanceof Error ? error.message : "Не удалось прочитать файл"}`);
    } finally {
      if (operation.isCurrent()) { setIsLoading(false); input.value = ""; }
      operation.finish();
    }
  };

  const handleRemoveProgram = (idx: number) => {
    if (guard.isBusy || !guard.isIdentityCurrent()) return;
    setPreview(prev => prev && isOfflineActorCurrent(prev.owner.actorId, prev.owner.revision)
      ? { ...prev, programs: prev.programs.filter((_, i) => i !== idx) } : null);
  };

  const handleCreateAll = async () => {
    if (programs.length === 0 || !preview || !guard.isIdentityCurrent()
      || !isOfflineActorCurrent(preview.owner.actorId, preview.owner.revision)) return;
    const selectedPrograms = [...programs];
    let operation: AdminMarketplaceImportOperation;
    try { operation = guard.start(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Не удалось начать создание"); return; }
    setIsCreating(true);
    setLastResult(null);
    const toastId = toast.loading(`Создаю ${programs.length} курсов...`, { duration: Infinity });

    const result: ImportResult = { created: 0, skipped: 0, errors: [] };

    try {
      await operation.verify();
      // 1. Fetch existing categories — use name+parent_type composite key to avoid overwrites
      const { data: dbCats, error: catFetchErr } = await supabase
        .from("course_categories")
        .select("id, name, parent_type")
        .eq("organization_id", MARKETPLACE_ORG_ID);

      operation.assertCurrent();
      if (catFetchErr || !Array.isArray(dbCats)) {
        throw new Error(`Не удалось загрузить категории: ${catFetchErr?.message || "Неизвестный ответ сервера"}`);
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
      const neededCats = [...new Set(selectedPrograms.map(p => p.category))];
      for (const catName of neededCats) {
        if (!catMap.has(catName.toLowerCase())) {
          const hours = Math.max(...selectedPrograms.filter(p => p.category === catName).map(p => parseInt(p.hours) || 0));
          const parentType = getParentType(catName, hours);
          await operation.verify();
          operation.assertCurrent();
          const { data: newCat, error: catErr } = await supabase
            .from("course_categories")
            .insert({
              organization_id: MARKETPLACE_ORG_ID,
              name: catName,
              parent_type: parentType,
              order_index: catMap.size + 1 } as any)
            .select("id, name")
            .single();
          operation.assertCurrent();
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

      // Repair only courses selected for this import, never unrelated known programs.
      const { data: orphanCourses, error: orphanError } = await supabase
        .from("courses")
        .select("id, title")
        .eq("organization_id", MARKETPLACE_ORG_ID)
        .is("category_id", null);
      operation.assertCurrent();
      if (orphanError || !Array.isArray(orphanCourses)) throw new Error("Не удалось проверить категории существующих курсов");
      if (orphanCourses && orphanCourses.length > 0) {
        for (const orphan of orphanCourses) {
          const normOrphan = normalizeTitle(orphan.title);
          const matchedProg = selectedPrograms.find(p => normalizeTitle(p.title) === normOrphan);
          if (matchedProg) {
            const catId = catMap.get(matchedProg.category.toLowerCase());
            if (catId) {
              await operation.verify();
              operation.assertCurrent();
              const { error } = await supabase.from("courses").update({ category_id: catId }).eq("id", orphan.id).eq("organization_id", MARKETPLACE_ORG_ID);
              operation.assertCurrent();
              if (error) { result.errors.push({ title: orphan.title, reason: error.message }); continue; }
            }
          }
        }
      }

      // 3. Fetch ALL existing courses for this org for dedup
      const { data: existingCourses, error: existingError } = await supabase
        .from("courses")
        .select("id, title")
        .eq("organization_id", MARKETPLACE_ORG_ID);
      operation.assertCurrent();
      if (existingError || !Array.isArray(existingCourses)) throw new Error("Не удалось проверить существующие курсы");
      const existingNormalized = new Map<string, string>();
      for (const c of existingCourses || []) {
        existingNormalized.set(normalizeTitle(c.title), c.id);
      }

      // 4. Fetch existing marketplace entries to avoid duplicates
      const { data: existingMkt, error: marketplaceError } = await supabase
        .from("marketplace_courses")
        .select("course_id")
        .eq("organization_id", MARKETPLACE_ORG_ID);
      operation.assertCurrent();
      if (marketplaceError || !Array.isArray(existingMkt)) throw new Error("Не удалось проверить записи каталога");
      const mktCourseIds = new Set((existingMkt || []).map(m => m.course_id));

      // 5. Create courses
      for (const prog of selectedPrograms) {
        operation.assertCurrent();
        const norm = normalizeTitle(prog.title);
        const existingId = existingNormalized.get(norm);

        // Resolve category
        const categoryId = catMap.get(prog.category.toLowerCase()) || null;

        if (existingId) {
          // Course exists — ensure it has marketplace entry & correct category
          if (!mktCourseIds.has(existingId)) {
            await operation.verify();
            operation.assertCurrent();
            const { error: mktErr } = await supabase.from("marketplace_courses").insert({
              course_id: existingId,
              organization_id: MARKETPLACE_ORG_ID,
              price_student: parseInt(defaultPriceStudent) || 5000,
              price_organization: parseInt(defaultPriceOrg) || 3000,
              description_short: prog.title,
              is_active: true,
              is_validated: false } as any);
            operation.assertCurrent();
            if (mktErr) {
              result.errors.push({ title: prog.title, reason: `Marketplace: ${mktErr.message}` });
            }
          }
          // Update category_id if missing
          if (categoryId) {
            await operation.verify();
            operation.assertCurrent();
            const { error } = await supabase.from("courses").update({ category_id: categoryId }).eq("id", existingId).eq("organization_id", MARKETPLACE_ORG_ID);
            operation.assertCurrent();
            if (error) result.errors.push({ title: prog.title, reason: error.message });
          }
          result.skipped++;
          continue;
        }

        // Create new course
        await operation.verify();
        operation.assertCurrent();
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
        operation.assertCurrent();
        if (courseErr || !course) {
          console.error("Failed to create course:", prog.title, courseErr);
          result.errors.push({ title: prog.title, reason: courseErr?.message || "Неизвестная ошибка" });
          continue;
        }

        // Create marketplace entry
        await operation.verify();
        operation.assertCurrent();
        const { error: mktErr } = await supabase.from("marketplace_courses").insert({
          course_id: course.id,
          organization_id: MARKETPLACE_ORG_ID,
          price_student: parseInt(defaultPriceStudent) || 5000,
          price_organization: parseInt(defaultPriceOrg) || 3000,
          description_short: prog.title,
          is_active: true,
          is_validated: false } as any);
        operation.assertCurrent();
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
      operation.assertCurrent();
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
    } catch (error) {
      toast.dismiss(toastId);
      if (operation.isCurrent()) toast.error(`Ошибка: ${error instanceof Error ? error.message : "Не удалось создать курсы"}`);
    } finally {
      if (operation.isCurrent()) setIsCreating(false);
      operation.finish();
    }
  };

  const loadFromParsedList = async () => {
    let operation: AdminMarketplaceImportOperation;
    try { operation = guard.start(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Не удалось загрузить перечень"); return; }
    const owner = captureOfflineContext();
    if (!owner) { operation.finish(); return; }
    setIsLoading(true);
    try {
      await operation.verify();
      operation.assertCurrent();
      const parsed = [...knownPrograms];
      setPreview({ programs: parsed, owner });
      setLastResult(null);
      toast.success(`Загружено ${parsed.length} программ из перечня`);
    } catch (error) {
      if (operation.isCurrent()) toast.error(error instanceof Error ? error.message : "Не удалось загрузить перечень");
    } finally {
      if (operation.isCurrent()) setIsLoading(false);
      operation.finish();
    }
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
              ref={fileInput}
              id="program-file"
              type="file"
              accept=".docx,.doc"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isLoading || isCreating || guard.isBusy || !guard.canStart}
            />
          </div>
          <Button variant="outline" onClick={loadFromParsedList} disabled={isLoading || isCreating || guard.isBusy || !guard.canStart} className="rounded-xl">
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
                  disabled={isCreating}
                  onChange={(e) => setDefaultPriceStudent(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Цена для организаций (₽)</Label>
                <Input
                  type="number"
                  value={defaultPriceOrg}
                  disabled={isCreating}
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
                          disabled={guard.isBusy}
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
                disabled={isCreating || isLoading || guard.isBusy || !guard.canStart}
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
