import { useMemo, useState } from "react";
import { CourseLibraryManager } from "@/components/course-library/CourseLibraryManager";
import { CourseLibraryReader } from "@/components/course-library/CourseLibraryReader";
import { Button } from "@/components/ui/button";
import type { CourseLibraryResource } from "@/api/courseLibrary";

const modules = [
  { id: "module-1", title: "Общепрофессиональный модуль", orderIndex: 1 },
  { id: "module-3", title: "Пожарная и охранно-пожарная сигнализация", orderIndex: 3 },
  { id: "module-6", title: "Системы оповещения и эвакуации", orderIndex: 6 },
];

const base = {
  courseId: "preview-course-178",
  description: null,
  storagePath: null,
  mimeType: null,
  originalFilename: null,
  fileSize: null,
  sortOrder: 0,
  allowDownload: true,
  createdAt: "2026-09-03T00:00:00+10:00",
  updatedAt: "2026-09-03T00:00:00+10:00",
} satisfies Partial<CourseLibraryResource>;

const resources: CourseLibraryResource[] = [
  {
    ...base,
    assignmentId: "assignment-1",
    libraryDocumentId: "document-1",
    moduleId: null,
    moduleTitle: null,
    title: "Приказ МЧС России от 15.11.2022 № 1156",
    category: "legal_acts",
    description: "Типовая дополнительная профессиональная программа.",
    sourceName: "Официальное опубликование правовых актов",
    externalUrl: "https://publication.pravo.gov.ru/document/0001202211280011",
    editionLabel: "редакция с учётом приказа № 468",
    lastCheckedAt: "2026-09-03",
    usageBasis: "official_open_source",
    status: "active",
    sortOrder: 1,
  },
  {
    ...base,
    assignmentId: "assignment-2",
    libraryDocumentId: "document-2",
    moduleId: "module-3",
    moduleTitle: "Пожарная и охранно-пожарная сигнализация",
    title: "РЭ ППКУП «Сириус»",
    category: "manufacturer_guides",
    description: "Монтаж, конфигурирование, эксплуатация и диагностика СПС.",
    sourceName: "НВП «Болид»",
    externalUrl: "https://bolid.ru/files/373/566/sirius_rep_aug_26.pdf",
    editionLabel: "редакция 2026 года",
    lastCheckedAt: "2026-09-03",
    usageBasis: "official_open_source",
    status: "active",
    sortOrder: 2,
  },
  {
    ...base,
    assignmentId: "assignment-3",
    libraryDocumentId: "document-3",
    moduleId: "module-6",
    moduleTitle: "Системы оповещения и эвакуации",
    title: "Методические материалы к практическим работам",
    category: "educational_materials",
    description: "Собственный материал учебного центра; ожидает утверждения.",
    sourceName: "Центр средств защиты",
    externalUrl: null,
    editionLabel: "проект от 02.09.2026",
    lastCheckedAt: null,
    usageBasis: "own_material",
    status: "needs_review",
    sortOrder: 3,
  },
];

export default function CourseLibraryHarness() {
  const [mode, setMode] = useState<"admin" | "learner">("admin");
  const previewData = useMemo(() => ({ resources, modules }), []);

  return (
    <main className="min-h-screen bg-muted/30 p-4 md:p-8">
      <div className="mx-auto mb-5 flex max-w-6xl items-center justify-between gap-3 rounded-2xl border bg-background p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Локальный макет · данные не сохраняются</p>
          <h1 className="text-xl font-bold">Курс ЦСЗ · 178 часов</h1>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant={mode === "admin" ? "default" : "outline"} onClick={() => setMode("admin")}>Администратор</Button>
          <Button type="button" variant={mode === "learner" ? "default" : "outline"} onClick={() => setMode("learner")}>Слушатель</Button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl rounded-3xl border bg-background p-4 shadow-sm md:p-6">
        {mode === "admin" ? (
          <CourseLibraryManager
            courseId="preview-course-178"
            courseName="Пожарная безопасность · 178 часов"
            organizationId="preview-organization"
            previewData={previewData}
            previewCanWrite
          />
        ) : (
          <CourseLibraryReader courseId="preview-course-178" previewData={previewData} />
        )}
      </div>
    </main>
  );
}
