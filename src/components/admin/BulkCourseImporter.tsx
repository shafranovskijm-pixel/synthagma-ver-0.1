import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ParsedSection } from "@/utils/excelTestBulkParser";
import { FileUploadStep } from "./bulk-import/FileUploadStep";
import { ConfigStep } from "./bulk-import/ConfigStep";
import { CreationStep } from "./bulk-import/CreationStep";
import { CourseCombo, VOLTAGE_OPTIONS, GROUP_OPTIONS } from "./bulk-import/types";
import { Button } from "@/components/ui/button";

export function BulkCourseImporter() {
  const [step, setStep] = useState<"upload" | "config" | "creating" | "done">("upload");
  const [sections, setSections] = useState<ParsedSection[]>([]);
  const [creationState, setCreationState] = useState({
    current: 0,
    total: 0,
    currentName: "",
    completed: [] as string[],
  });

  const handleParsed = (parsed: ParsedSection[]) => {
    setSections(parsed);
    setStep("config");
  };

  const handleReset = () => {
    setSections([]);
    setStep("upload");
    setCreationState({ current: 0, total: 0, currentName: "", completed: [] });
  };

  const handleGenerate = async (
    combos: CourseCombo[],
    priceStudent: number,
    priceOrg: number
  ) => {
    setStep("creating");
    setCreationState({ current: 0, total: combos.length, currentName: "", completed: [] });

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

      const completed: string[] = [];

      for (let i = 0; i < combos.length; i++) {
        const combo = combos[i];
        setCreationState(prev => ({
          ...prev,
          current: i,
          currentName: combo.customTitle,
        }));

        // Get filtered questions for this combo
        const section = sections[combo.sectionIdx];
        let questions;

        if (combo.voltageLabel === "Все") {
          // Non-combo mode: include all questions matching any selected filter
          questions = section.questions;
        } else {
          questions = section.questions.filter(
            q => q.tags[combo.voltage] && q.tags[combo.group]
          );
        }

        if (questions.length === 0) continue;

        // 1. Create course
        const { data: courseData, error: courseError } = await supabase
          .from("courses")
          .insert({
            title: combo.customTitle.trim(),
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
            title: combo.customTitle.trim(),
            type: "test",
            order_index: 0,
            test_questions_count: Math.min(questions.length, 50),
            test_passing_score: 60,
          })
          .select("id")
          .single();
        if (lessonError) throw lessonError;

        // 3. Create test questions in batches
        const batchSize = 50;
        for (let b = 0; b < questions.length; b += batchSize) {
          const batch = questions.slice(b, b + batchSize).map((q, idx) => ({
            lesson_id: lessonData.id,
            question: q.question,
            options: JSON.stringify(q.options),
            correct_answer: 0,
            order_index: b + idx,
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
            price_student: priceStudent,
            price_organization: priceOrg,
            is_active: true,
          });
        if (mpError) throw mpError;

        completed.push(combo.customTitle);
        setCreationState(prev => ({
          ...prev,
          current: i + 1,
          completed: [...completed],
        }));
      }

      setStep("done");
      toast.success(`Создано ${completed.length} курсов!`);
    } catch (err: any) {
      console.error("Bulk create error:", err);
      toast.error(`Ошибка: ${err.message || "Не удалось создать курсы"}`);
      setStep("config");
    }
  };

  if (step === "upload") {
    return <FileUploadStep onParsed={handleParsed} />;
  }

  if (step === "config") {
    return (
      <ConfigStep
        sections={sections}
        onGenerate={handleGenerate}
        onReset={handleReset}
      />
    );
  }

  // creating or done
  return (
    <div className="space-y-4">
      <CreationStep {...creationState} />
      {step === "done" && (
        <Button variant="outline" className="w-full rounded-xl" onClick={handleReset}>
          Импортировать ещё
        </Button>
      )}
    </div>
  );
}
