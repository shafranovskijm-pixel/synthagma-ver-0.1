import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
// xlsx is dynamically imported inside handleExcelFile to keep it out of the main bundle
import { MARKETPLACE_ORG_ID } from "@/constants/marketplace";
import { type MarketplaceSettingsData, getMarketplaceSettings } from "@/components/admin/MarketplaceSettings";

export interface ExcelCourse {
  title: string;
  description?: string;
  duration?: string;
}

interface UsePipelineExcelImportProps {
  onComplete: () => void;
}

export function usePipelineExcelImport({ onComplete }: UsePipelineExcelImportProps) {
  const [parsedCourses, setParsedCourses] = useState<ExcelCourse[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExcelFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (rows.length < 2) { toast.error("Файл пуст"); return; }
        const header = rows[0].map((h: any) => String(h || "").toLowerCase().trim());
        const titleIdx = header.findIndex(h => h.includes("назван") || h.includes("title") || h === "курс");
        const descIdx = header.findIndex(h => h.includes("описан") || h.includes("description"));
        const durIdx = header.findIndex(h => h.includes("длительн") || h.includes("duration") || h.includes("час"));
        if (titleIdx === -1) { toast.error("Не найдена колонка «Название»"); return; }
        const parsed: ExcelCourse[] = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const title = String(row[titleIdx] || "").trim();
          if (!title) continue;
          parsed.push({
            title,
            description: descIdx >= 0 ? String(row[descIdx] || "").trim() : undefined,
            duration: durIdx >= 0 ? String(row[durIdx] || "").trim() : undefined,
          });
        }
        setParsedCourses(parsed);
        toast.success(`Найдено ${parsed.length} курсов`);
      } catch (err) {
        console.error(err);
        toast.error("Ошибка чтения файла");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const handleCreateAll = async () => {
    if (parsedCourses.length === 0) return;
    setIsImporting(true);
    setImportProgress(0);
    setImportTotal(parsedCourses.length);
    const settings = getMarketplaceSettings();
    const priceOrg = 0;
    const priceStudent = 0;
    let created = 0;
    for (const course of parsedCourses) {
      try {
        const { data: courseData, error: courseErr } = await supabase
          .from("courses")
          .insert({
            title: course.title,
            description: course.description || null,
            duration: course.duration || null,
            organization_id: MARKETPLACE_ORG_ID,
            is_published: true,
          })
          .select("id")
          .single();
        if (courseErr) throw courseErr;
        await supabase.from("marketplace_courses").insert({
          course_id: courseData.id,
          organization_id: MARKETPLACE_ORG_ID,
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
    onComplete();
  };

  return {
    parsedCourses, setParsedCourses,
    isImporting, importProgress, importTotal,
    fileRef,
    handleExcelFile, handleCreateAll,
  };
}
