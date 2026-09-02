import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, ExternalLink, FileCode2, Pencil, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import type { StudentEnrollment } from "@/types/student";
import {
  buildLaborSafetyXmlFilename,
  buildStudentLaborSafetyRecords,
  serializeLaborSafetyRecordsXml,
} from "@/lib/laborSafetyXml";
import {
  fetchStudentLaborSafetyXmlContext,
  type StudentLaborSafetyXmlContext,
} from "@/api/studentLaborSafetyXml";

interface StudentLaborSafetyXmlCardProps {
  organizationId: string;
  student: {
    userId: string;
    fullName: string;
    companyId?: string | null;
  };
  enrollments: StudentEnrollment[];
  enrollmentsLoading?: boolean;
  enrollmentsError?: string | null;
  snils?: string | null;
  position?: string | null;
  onOpenProfile?: () => void;
  onOpenSnils?: () => void;
  onOpenCompany?: () => void;
  onOpenCourse?: (courseId: string) => void;
  onOpenEducationDocument?: (target: {
    enrollmentId: string;
    recordId: string | null;
  }) => void;
}

function StudentLaborSafetyXmlCardContent({
  organizationId,
  student,
  enrollments,
  enrollmentsLoading = false,
  enrollmentsError = null,
  snils = null,
  position = null,
  onOpenProfile,
  onOpenSnils,
  onOpenCompany,
  onOpenCourse,
  onOpenEducationDocument,
}: StudentLaborSafetyXmlCardProps) {
  const [context, setContext] = useState<StudentLaborSafetyXmlContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (enrollmentsLoading || enrollmentsError) {
      setContext(null);
      setLoadError(null);
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    setLoadError(null);
    void fetchStudentLaborSafetyXmlContext({
      organizationId,
      userId: student.userId,
      companyId: student.companyId,
      enrollments,
    }).then(result => {
      if (active) setContext(result);
    }).catch(error => {
      if (!active) return;
      console.error("[StudentLaborSafetyXmlCard] load failed:", error);
      setContext(null);
      setLoadError("Не удалось подтвердить данные для XML. Повторите загрузку позже.");
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [organizationId, student.userId, student.companyId, enrollments, enrollmentsLoading, enrollmentsError]);

  const records = useMemo(() => buildStudentLaborSafetyRecords({
    fullName: student.fullName,
    snils,
    position,
    companyName: context?.company?.name ?? null,
    companyInn: context?.company?.inn ?? null,
    courses: context?.courses ?? [],
  }), [context, position, snils, student.fullName]);

  const isLoadingContext = loading || (
    !context && !loadError && !enrollmentsLoading && !enrollmentsError
  );
  const missingCount = records.reduce((sum, result) => sum + result.missingFields.length, 0);
  const canDownloadDraft = records.length > 0
    && !isLoadingContext
    && !enrollmentsLoading
    && !loadError
    && !enrollmentsError;
  const isReadyForValidation = canDownloadDraft && missingCount === 0;

  const handleDownload = () => {
    if (!canDownloadDraft) return;
    const exportDate = new Date().toISOString().slice(0, 10);
    const xml = serializeLaborSafetyRecordsXml({
      groupName: `Личное дело: ${student.fullName}`,
      exportDate,
      records: records.map(result => result.record),
    });
    const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = buildLaborSafetyXmlFilename({ exportDate, subject: student.fullName });
    anchor.click();
    URL.revokeObjectURL(url);
    if (missingCount > 0) {
      toast.warning(`Черновик XML сформирован: ${records.length} записей, незаполненных полей — ${missingCount}`);
    } else {
      toast.success(`Черновик XML сформирован: ${records.length} записей`);
    }
  };

  const missingFieldAction = (
    field: string,
    result: (typeof records)[number],
  ): (() => void) | null => {
    if (field === "ФИО" || field === "Должность") return onOpenProfile ?? null;
    if (field === "СНИЛС") return onOpenSnils ?? null;
    if (field === "ИНН организации" || field === "Наименование организации") {
      return onOpenCompany ?? null;
    }
    if (field === "Номер протокола" && onOpenEducationDocument) {
      return () => onOpenEducationDocument({
        enrollmentId: result.enrollmentId,
        recordId: result.educationDocumentRecordId,
      });
    }
    if ((field === "Программа обучения" || field === "Дата экзамена") && onOpenCourse) {
      return () => onOpenCourse(result.courseId);
    }
    return null;
  };

  return (
    <div className="rounded-2xl border border-amber-300/70 bg-amber-50/50 p-6 dark:bg-amber-950/10" data-testid="student-labor-safety-xml-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <FileCode2 className="h-5 w-5 text-amber-700" />
            <h3 className="font-semibold">XML по охране труда</h3>
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">Beta</span>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            В файл попадёт по одной записи на каждый завершённый курс из категории «Охрана труда».
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-2 rounded-xl" asChild>
            <a href="https://lkot.mintrud.gov.ru/" target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Открыть ЛКОТ
            </a>
          </Button>
          <Button className="gap-2 rounded-xl" onClick={handleDownload} disabled={!canDownloadDraft}>
            {isLoadingContext || enrollmentsLoading ? <SigmaSpinner size="sm" /> : <Download className="h-4 w-4" />}
            Скачать черновик XML
          </Button>
        </div>
      </div>

      <div className="mt-4 flex gap-2 rounded-xl border border-amber-300/80 bg-background/80 p-3 text-sm" role="note">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <p>
          Это внутренний XML-формат СИНТАГМЫ. Совместимость с актуальной XSD Минтруда пока не подтверждена.
          Не отправляйте файл в Минтруд без отдельной проверки схемы и тестового импорта.
        </p>
      </div>

      {enrollmentsLoading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <SigmaSpinner size="sm" /> Проверяем завершённые курсы…
        </div>
      ) : enrollmentsError ? (
        <p className="mt-4 text-sm text-destructive" role="alert">{enrollmentsError}</p>
      ) : isLoadingContext ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <SigmaSpinner size="sm" /> Проверяем категорию и реквизиты…
        </div>
      ) : loadError ? (
        <p className="mt-4 text-sm text-destructive" role="alert">{loadError}</p>
      ) : records.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Нет завершённых курсов, отнесённых к категории «Охрана труда». Название курса само по себе не используется как признак.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <div
            className={`rounded-xl border p-3 text-sm ${
              isReadyForValidation
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20"
                : "border-amber-300 bg-background/80 text-amber-900 dark:text-amber-200"
            }`}
            role="status"
          >
            {isReadyForValidation
              ? `Записей с заполненными данными: ${records.length}. Перед отправкой всё равно требуется проверка по актуальной XSD Минтруда.`
              : `Черновик можно скачать для демонстрации. Для рабочего экспорта заполните недостающие поля (${missingCount}); затем проверьте файл по актуальной XSD Минтруда.`}
          </div>
          {records.map(result => (
            <div key={result.enrollmentId} className="rounded-xl border border-border bg-background/80 p-3">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{result.courseTitle}</p>
                  {result.missingFields.length === 0 ? (
                    <p className="mt-1 text-xs text-emerald-700">Все поля внутреннего XML заполнены.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-destructive">
                        Не заполнено. Выберите поле, чтобы перейти к месту заполнения:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {result.missingFields.map((field) => {
                          const action = missingFieldAction(field, result);
                          return action ? (
                            <Button
                              key={field}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 rounded-lg border-destructive/30 px-2 text-xs text-destructive hover:bg-destructive/5 hover:text-destructive"
                              aria-label={`Заполнить: ${field}`}
                              onClick={action}
                            >
                              <Pencil className="h-3 w-3" /> {field}
                            </Button>
                          ) : (
                            <span
                              key={field}
                              className="inline-flex h-7 items-center rounded-lg border border-destructive/20 px-2 text-xs text-destructive"
                            >
                              {field}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Permission boundary stays above the component that performs labor-safety
 * requests, so users without labor_safety.read neither see nor load the block.
 */
export function StudentLaborSafetyXmlCard(props: StudentLaborSafetyXmlCardProps) {
  const { can, loading } = useStaffPermissions();
  if (loading || !can("labor_safety.read")) return null;
  const actionableProps: StudentLaborSafetyXmlCardProps = {
    ...props,
    onOpenProfile: can("students.write") ? props.onOpenProfile : undefined,
    onOpenSnils: can("students.write") ? props.onOpenSnils : undefined,
    onOpenCompany: can("companies.write") ? props.onOpenCompany : undefined,
    onOpenCourse: can("courses.write") ? props.onOpenCourse : undefined,
    onOpenEducationDocument: can("journals.read") && can("journals.write")
      ? props.onOpenEducationDocument
      : undefined,
  };
  const identityKey = [
    props.organizationId,
    props.student.userId,
    props.student.companyId ?? "",
    ...props.enrollments.map(enrollment => [
      enrollment.id,
      enrollment.course_id,
      enrollment.status,
      enrollment.completed_at ?? "",
    ].join(":")),
  ].join("|");
  return <StudentLaborSafetyXmlCardContent key={identityKey} {...actionableProps} />;
}
