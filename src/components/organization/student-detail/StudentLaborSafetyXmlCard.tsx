import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, ExternalLink, FileCode2, Info, Pencil, RefreshCw, ShieldCheck } from "lucide-react";
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
import { StudentLaborSafetyCompanyDialog } from "@/components/organization/student-detail/StudentLaborSafetyCompanyDialog";
import { StudentLaborSafetyProtocolDialog } from "@/components/organization/student-detail/StudentLaborSafetyProtocolDialog";

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
  onOpenCourse?: (courseId: string) => void;
  onOpenEducationDocument?: (target: {
    enrollmentId: string;
    recordId: string | null;
  }) => void;
  onCompanyChanged?: () => void | Promise<void>;
  canEditCompanies?: boolean;
  canAssignCompany?: boolean;
  canEditProtocol?: boolean;
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
  onOpenCourse,
  onCompanyChanged,
  canEditCompanies = false,
  canAssignCompany = false,
  canEditProtocol = false,
}: StudentLaborSafetyXmlCardProps) {
  const [context, setContext] = useState<StudentLaborSafetyXmlContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const requestPendingRef = useRef(false);
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [protocolEnrollmentId, setProtocolEnrollmentId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (enrollmentsLoading || enrollmentsError) {
      requestPendingRef.current = false;
      setContext(null);
      setLoadError(null);
      setLoading(false);
      return () => { active = false; };
    }

    requestPendingRef.current = true;
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
      setLoadError("Не удалось подтвердить данные для XML. Повторите загрузку.");
    }).finally(() => {
      if (active) {
        requestPendingRef.current = false;
        setLoading(false);
      }
    });

    return () => { active = false; };
  }, [organizationId, student.userId, student.companyId, enrollments, enrollmentsLoading, enrollmentsError, loadAttempt]);

  const handleRetryContext = () => {
    if (requestPendingRef.current || loading || enrollmentsLoading || enrollmentsError || !loadError) return;
    // Only retry this card's metadata; the parent owns the confirmed enrollments.
    // Lock synchronously so rapid clicks cannot enqueue duplicate requests.
    requestPendingRef.current = true;
    setLoading(true);
    setLoadAttempt(attempt => attempt + 1);
  };

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
  const invalidCount = records.reduce((sum, result) => sum + result.invalidFields.length, 0);
  const issueCount = missingCount + invalidCount;
  const canDownloadDraft = records.length > 0
    && !isLoadingContext
    && !enrollmentsLoading
    && !loadError
    && !enrollmentsError;
  const isReadyForValidation = canDownloadDraft && issueCount === 0;
  const protocolStorageAvailable = context?.protocolStorageAvailable !== false;
  const protocolTarget = records.find(result => result.enrollmentId === protocolEnrollmentId) ?? null;

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
    if (issueCount > 0) {
      toast.warning(`Внутренний XML-черновик сформирован: ${records.length} записей, полей для проверки — ${issueCount}`);
    } else {
      toast.success(`Внутренний XML-черновик сформирован: ${records.length} записей`);
    }
  };

  const missingFieldAction = (
    field: string,
    result: (typeof records)[number],
  ): (() => void) | null => {
    if (field === "ФИО" || field === "Должность") return onOpenProfile ?? null;
    if (field === "СНИЛС") return onOpenSnils ?? null;
    if (field === "ИНН организации" || field === "Наименование организации") {
      const mayManageCompany = canEditCompanies && (Boolean(student.companyId) || canAssignCompany);
      return mayManageCompany ? () => setCompanyDialogOpen(true) : null;
    }
    if (["Номер протокола", "Дата проверки знаний", "Результат проверки знаний"].includes(field)) {
      return canEditProtocol && protocolStorageAvailable
        ? () => setProtocolEnrollmentId(result.enrollmentId)
        : null;
    }
    if (field === "Программа обучения" && onOpenCourse) {
      return () => onOpenCourse(result.courseId);
    }
    return null;
  };

  return (
    <>
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
          Не импортируйте файл в ЛКОТ без отдельной проверки схемы и тестового импорта.
        </p>
      </div>

      <details
        className="mt-3 rounded-xl border border-border bg-background/80 p-3 text-sm"
        data-testid="labor-safety-legal-help"
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-foreground">
          <Info className="h-4 w-4 shrink-0 text-primary" />
          Правовая справка по заполнению
        </summary>
        <div className="mt-3 space-y-2 text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Для записи в реестр:</span>{" "}
            ФИО, СНИЛС, должность, наименование и ИНН направившей организации,
            программа, результат, дата проверки знаний и номер протокола.
          </p>
          <p>
            <span className="font-medium text-foreground">В этот XML не входят:</span>{" "}
            паспорт, дата рождения, образование, специальность, удостоверение и приказы
            о зачислении или отчислении. Они не должны блокировать скачивание черновика.
          </p>
          <p>
            <span className="font-medium text-foreground">Основной итоговый документ — протокол.</span>{" "}
            Удостоверение по общему правилу оформляется дополнительно либо когда его требует
            специальный нормативный акт. Если удостоверение не выдаётся, не создавайте его
            фиктивно только ради XML.
          </p>
          <p>
            Дата и номер приказа о создании комиссии относятся к протоколу и настройкам
            организации, а не к карточке ученика. Эта справка — подсказка в интерфейсе,
            а не новый документ для выдачи.
          </p>
          <a
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            href="https://publication.pravo.gov.ru/document/0001202112290004"
            target="_blank"
            rel="noreferrer"
          >
            Правила обучения по охране труда № 2464
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </details>

      {!protocolStorageAvailable && (
        <p className="mt-3 rounded-xl border border-amber-300/80 bg-background/80 p-3 text-sm" role="alert">
          Сохранение протоколов пока недоступно: обновление базы ещё не установлено.
          Черновик остаётся доступен, но дату и результат нельзя считать подтверждёнными по старому журналу.
        </p>
      )}
      {context?.legacyProtocolLookupFailed && (
        <p className="mt-3 text-sm text-muted-foreground" role="note">
          Старые номера из журнала документов загрузить не удалось. Это не мешает заполнить отдельный протокол охраны труда.
        </p>
      )}

      {enrollmentsLoading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <SigmaSpinner size="sm" /> Проверяем завершённые курсы…
        </div>
      ) : enrollmentsError ? (
        <p className="mt-4 text-sm text-destructive" role="alert">{enrollmentsError}</p>
      ) : isLoadingContext ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <SigmaSpinner size="sm" /> {loadAttempt > 0 ? "Загружаем данные повторно…" : "Проверяем категорию и реквизиты…"}
        </div>
      ) : loadError ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-destructive" role="alert">{loadError}</p>
          <Button type="button" variant="outline" size="sm" className="gap-2 rounded-xl"
            onClick={handleRetryContext} disabled={loading || enrollmentsLoading || Boolean(enrollmentsError)}>
            <RefreshCw className="h-4 w-4" /> Повторить загрузку
          </Button>
        </div>
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
              ? `Записей без найденных синтаксических ошибок: ${records.length}. Совместимость всё равно требуется проверить по актуальной XSD Минтруда.`
              : `Черновик можно скачать для демонстрации. Для последующей XSD-проверки заполните пропуски (${missingCount}) и исправьте некорректные значения (${invalidCount}).`}
          </div>
          {records.map(result => (
            <div key={result.enrollmentId} className="rounded-xl border border-border bg-background/80 p-3">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{result.courseTitle}</p>
                  <p className="mt-1 text-xs text-muted-foreground" data-testid={`protocol-source-${result.enrollmentId}`}>
                    {result.protocolRecord
                      ? `Протокол сохранён оператором: № ${result.protocolRecord.protocol_number}, ${result.protocolRecord.knowledge_check_date.split("-").reverse().join(".")} — ${result.protocolRecord.is_passed ? "Сдал" : "Не сдал"}. Это не подтверждение регистрации в Минтруде.`
                      : result.record.protocol_source === "legacy_unconfirmed"
                        ? `Номер из старого журнала: ${result.record.protocol_number}. Дата и результат проверки знаний не подтверждены.`
                        : "Протокол проверки знаний ещё не заполнен."}
                  </p>
                  {canEditProtocol && (
                    <Button type="button" variant="outline" size="sm" className="mt-2 gap-1 rounded-lg"
                      disabled={!protocolStorageAvailable}
                      aria-label={`${result.protocolRecord ? "Изменить" : "Заполнить"} протокол: ${result.courseTitle}`}
                      onClick={() => setProtocolEnrollmentId(result.enrollmentId)}>
                      <Pencil className="h-3 w-3" /> {result.protocolRecord ? "Изменить протокол" : "Заполнить протокол"}
                    </Button>
                  )}
                  {result.missingFields.length === 0 && result.invalidFields.length === 0 ? (
                    <p className="mt-1 text-xs text-emerald-700">Поля внутреннего XML-черновика заполнены и прошли синтаксическую проверку.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-destructive">
                        Заполните или исправьте данные перед XSD-проверкой:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {[...result.missingFields, ...result.invalidFields.filter(field => !result.missingFields.includes(field))].map((field) => {
                          const action = missingFieldAction(field, result);
                          const isInvalid = result.invalidFields.includes(field);
                          return action ? (
                            <Button
                              key={field}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 rounded-lg border-destructive/30 px-2 text-xs text-destructive hover:bg-destructive/5 hover:text-destructive"
                              aria-label={`${isInvalid ? "Исправить" : "Заполнить"}: ${field}`}
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

      {protocolTarget && (
        <StudentLaborSafetyProtocolDialog
          key={`${organizationId}:${protocolTarget.enrollmentId}`}
          organizationId={organizationId}
          enrollmentId={protocolTarget.enrollmentId}
          courseTitle={protocolTarget.courseTitle}
          legacyProtocolNumber={context?.courses.find(course => course.enrollmentId === protocolTarget.enrollmentId)?.protocolNumber}
          canEdit={canEditProtocol}
          onClose={() => setProtocolEnrollmentId(null)}
          onSaved={protocol => setContext(current => current ? {
            ...current,
            protocolStorageAvailable: true,
            courses: current.courses.map(course => course.enrollmentId === protocol.source_enrollment_id
              ? { ...course, protocolRecord: protocol }
              : course),
          } : current)}
        />
      )}

      <StudentLaborSafetyCompanyDialog
        open={companyDialogOpen}
        onOpenChange={setCompanyDialogOpen}
        organizationId={organizationId}
        userId={student.userId}
        currentCompanyId={student.companyId}
        currentCompany={context?.company ?? null}
        canEditCompanies={canEditCompanies}
        canAssignCompany={canAssignCompany}
        onSaved={async (company) => {
          setContext(current => current ? {
            ...current,
            company: { name: company.name, inn: company.inn },
          } : current);
          await onCompanyChanged?.();
        }}
      />
    </>
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
    onOpenCourse: can("courses.write") ? props.onOpenCourse : undefined,
    onOpenEducationDocument: can("journals.read") && can("journals.write")
      ? props.onOpenEducationDocument
      : undefined,
    canEditCompanies: can("companies.write"),
    canAssignCompany: can("students.write"),
    canEditProtocol: can("labor_safety.write"),
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
