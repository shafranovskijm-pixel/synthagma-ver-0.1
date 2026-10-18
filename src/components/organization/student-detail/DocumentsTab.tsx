import { useEffect, useRef, useState, type RefObject } from "react";
import { z } from "zod";
import { AlertTriangle, FileText, Eye, Trash2, Upload, Save, User, Calendar, ScanLine, Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatSnils, isValidSnils } from "@/utils/formatSnils";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import type { StudentEnrollment } from "@/types/student";
import { StudentLaborSafetyXmlCard } from "@/components/organization/student-detail/StudentLaborSafetyXmlCard";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";

interface DocumentsTabProps {
  h: any;
  orgPlan?: string;
  organizationId?: string | null;
  studentUserId?: string | null;
  actorUserId?: string | null;
  laborSafetyXml?: {
    organizationId: string;
    student: {
      userId: string;
      fullName: string;
      companyId?: string | null;
    };
    enrollments: StudentEnrollment[];
    enrollmentsLoading?: boolean;
    enrollmentsError?: string | null;
    onOpenProfile?: () => void;
    onOpenCourse?: (courseId: string) => void;
    onOpenEducationDocument?: (target: {
      enrollmentId: string;
      recordId: string | null;
    }) => void;
    onCompanyChanged?: () => void | Promise<void>;
  };
}

const DOC_TYPES = [
  { type: "passport", label: "Паспорт" },
  { type: "snils", label: "СНИЛС" },
  { type: "education_document", label: "Документ об образовании" },
  { type: "birth_certificate", label: "Свидетельство о рождении" },
];

function matchingFrdoData(h: any, organizationId?: string | null, studentUserId?: string | null): Record<string, string | null> | null {
  const value = h.frdoData;
  if (!organizationId || !studentUserId || h.isLoading || h.dataLoadError || !value || typeof value !== "object" || Array.isArray(value)) return null;
  // A successful scoped read may find no row yet. Nonempty rows must carry
  // the actual identity selected by that read, never another card's values.
  return Object.keys(value).length === 0 || value.user_id === studentUserId && value.organization_id === organizationId ? value : null;
}

export function DocumentsTab({ h, orgPlan, organizationId, studentUserId, actorUserId, laborSafetyXml }: DocumentsTabProps) {
  const snilsInputRef = useRef<HTMLInputElement>(null);
  const personalDocumentsBoundaryRef = useRef<HTMLDivElement>(null);
  const personalDocumentsUnavailable = h.isLoading || Boolean(h.dataLoadError);
  const currentFrdoData = matchingFrdoData(h, organizationId, studentUserId);
  const focusSnils = () => {
    const target = snilsInputRef.current ?? personalDocumentsBoundaryRef.current;
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus({ preventScroll: true });
  };

  return (
    <div className="space-y-6">
      {laborSafetyXml && (
        <StudentLaborSafetyXmlCard
          {...laborSafetyXml}
          snils={personalDocumentsUnavailable ? null : currentFrdoData?.snils ?? null}
          position={personalDocumentsUnavailable || !currentFrdoData ? null : h.jobPosition ?? null}
          onOpenSnils={focusSnils}
        />
      )}

      {h.isLoading ? (
        <div ref={personalDocumentsBoundaryRef} tabIndex={-1} role="status" className="rounded-2xl border border-border p-6 text-center">
          <SigmaSpinner />
          <p className="mt-3 text-sm text-muted-foreground">Загрузка личных документов…</p>
        </div>
      ) : h.dataLoadError ? (
        <div ref={personalDocumentsBoundaryRef} tabIndex={-1} role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" />
          <h3 className="font-semibold">Не удалось загрузить личные документы</h3>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">{h.dataLoadError}</p>
          {laborSafetyXml && (
            <p className="mt-2 text-sm text-muted-foreground">Раздел XML по охране труда доступен отдельно. Личные данные можно проверить после повторной загрузки.</p>
          )}
          <Button variant="outline" className="mt-4 gap-2 rounded-xl" onClick={() => void h.retryLoadStudentData()}>
            <RefreshCw className="h-4 w-4" /> Повторить
          </Button>
        </div>
      ) : (
        <PersonalDocumentsContent key={`${organizationId ?? ""}:${studentUserId ?? ""}`} h={h} orgPlan={orgPlan}
          organizationId={organizationId} studentUserId={studentUserId} actorUserId={actorUserId} snilsInputRef={snilsInputRef} />
      )}
    </div>
  );
}

const ocrText = z.string().max(4000).nullable();
const ocrDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}).nullable();
const ocrResponseSchema = z.object({
  documentId: z.string().uuid(), doc_type: z.enum(["passport", "snils"]),
  snils: z.string().regex(/^\d{3}-\d{3}-\d{3} \d{2}$/).nullable(), birth_date: ocrDate,
  passport_series: z.string().regex(/^\d{2} \d{2}$/).nullable(), passport_number: z.string().regex(/^\d{6}$/).nullable(),
  passport_issue_date: ocrDate, passport_issued_by: ocrText, passport_department_code: z.string().regex(/^\d{3}-\d{3}$/).nullable(),
  confidence: z.number().finite().min(0).max(1).nullable(),
}).strict().refine(value => value.doc_type === "passport" ? value.snils === null
  : [value.passport_series, value.passport_number, value.passport_issue_date, value.passport_issued_by, value.passport_department_code].every(field => field === null));
type OcrValues = z.infer<typeof ocrResponseSchema>;
type OcrField = "snils" | "birth_date" | "passport_series" | "passport_number" | "passport_issue_date" | "passport_issued_by" | "passport_department_code";
const ocrFields: OcrField[] = ["snils", "birth_date", "passport_series", "passport_number", "passport_issue_date", "passport_issued_by", "passport_department_code"];
type OcrSource = { actorId: string; organizationId: string; studentUserId: string; documentId: string; docType: "passport" | "snils"; path: string; url: string | null; updatedAt: string | null; accessKey: string };
type OcrCandidate = { source: OcrSource; values: OcrValues; generation: number };

function PersonalDocumentsContent({ h, orgPlan, organizationId, studentUserId, actorUserId, snilsInputRef }: Pick<DocumentsTabProps, "h" | "orgPlan" | "organizationId" | "studentUserId" | "actorUserId"> & {
  snilsInputRef: RefObject<HTMLInputElement>;
}) {
  const currentFrdoData = matchingFrdoData(h, organizationId, studentUserId);
  const frdoContextKey = currentFrdoData ? `${organizationId}:${studentUserId}` : null;
  const [snilsValue, setSnilsValue] = useState(currentFrdoData?.snils || "");
  const [lastName, setLastName] = useState(currentFrdoData?.last_name || "");
  const [firstName, setFirstName] = useState(currentFrdoData?.first_name || "");
  const [middleName, setMiddleName] = useState(currentFrdoData?.middle_name || "");
  const [birthDate, setBirthDate] = useState(currentFrdoData?.birth_date || "");
  const [ocrDocId, setOcrDocId] = useState<string | null>(null);
  const [ocrCandidate, setOcrCandidate] = useState<OcrCandidate | null>(null);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [applyingOcr, setApplyingOcr] = useState(false);
  const applyingOcrRef = useRef(false);
  const requestGeneration = useRef(0);
  const mounted = useRef(true);
  const permissions = useStaffPermissions();
  const ocrPlanEnabled = orgPlan === "professional" || orgPlan === "maximum";
  const hasCurrentContext = z.string().uuid().safeParse(organizationId).success && z.string().uuid().safeParse(studentUserId).success
    && z.string().uuid().safeParse(actorUserId).success
    && (permissions.organizationId === organizationId || permissions.organizationId === null && permissions.isOrgOwner);
  const writableContext = hasCurrentContext && !!currentFrdoData && !permissions.loading && !permissions.error
    && permissions.adminRole !== "viewer" && permissions.adminRole !== "sales_manager";
  const canProcessOcr = ocrPlanEnabled && writableContext && permissions.can("documents.write") && permissions.can("students.write");
  const canRequestFrdoWrite = writableContext && permissions.can("frdo.write");
  const [frdoWriteScope, setFrdoWriteScope] = useState<{ key: string; allowed: boolean } | null>(null);
  const accessKey = JSON.stringify([actorUserId, permissions.organizationId, permissions.orgRole, permissions.adminRole,
    permissions.isOrgOwner, [...(permissions.orgPermissions ?? [])].sort(), canProcessOcr, canRequestFrdoWrite]);
  const frdoWriteKey = JSON.stringify([organizationId, studentUserId, accessKey, frdoContextKey]);
  const canWriteFrdo = canRequestFrdoWrite && frdoWriteScope?.key === frdoWriteKey && frdoWriteScope.allowed;
  const canApplyOcr = canProcessOcr && canWriteFrdo;
  useEffect(() => {
    let cancelled = false;
    setFrdoWriteScope(null);
    if (!canRequestFrdoWrite || !organizationId || !studentUserId) return;
    const check = async () => {
      let allowed = false;
      try {
        const rpc = supabase.rpc.bind(supabase) as unknown as (name: "can_write_student_frdo_data", args: { p_organization_id: string; p_user_id: string }) => PromiseLike<{ data: unknown; error: unknown }>;
        const response = await rpc("can_write_student_frdo_data", { p_organization_id: organizationId, p_user_id: studentUserId });
        allowed = !response.error && response.data === true;
      } catch { /* A failed permission read never enables saving. */ }
      if (!cancelled) setFrdoWriteScope({ key: frdoWriteKey, allowed });
    };
    void check();
    return () => { cancelled = true; };
  }, [canRequestFrdoWrite, organizationId, studentUserId, frdoWriteKey]);
  const identityDocs: any[] = Array.isArray(h.identityDocs) ? h.identityDocs : [];
  const sourceKey = JSON.stringify(identityDocs.map(doc => [doc.id, doc.user_id, doc.organization_id, doc.type,
    doc.file_path, doc.file_url, doc.updated_at]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  const current = useRef({ canProcessOcr, canApplyOcr, canWriteFrdo, organizationId, studentUserId, actorUserId, accessKey, identityDocs, ocrCandidate, saveFrdoField: h.saveFrdoField });
  current.current = { canProcessOcr, canApplyOcr, canWriteFrdo, organizationId, studentUserId, actorUserId, accessKey, identityDocs, ocrCandidate, saveFrdoField: h.saveFrdoField };
  const sourceFor = (documentId: string): OcrSource | null => {
    const context = current.current;
    if (!mounted.current || !context.canProcessOcr) return null;
    const matches = context.identityDocs.filter(doc => doc.id === documentId);
    const doc = matches.length === 1 ? matches[0] : null;
    if (!doc || !z.string().uuid().safeParse(doc.id).success || doc.organization_id !== context.organizationId
      || doc.user_id !== context.studentUserId || !["passport", "snils"].includes(doc.type)
      || typeof doc.file_path !== "string" || !doc.file_path.trim()
      || doc.file_url != null && typeof doc.file_url !== "string" || doc.updated_at != null && typeof doc.updated_at !== "string") return null;
    return { actorId: context.actorUserId!, organizationId: context.organizationId!, studentUserId: context.studentUserId!,
      documentId: doc.id, docType: doc.type, path: doc.file_path, url: doc.file_url ?? null, updatedAt: doc.updated_at ?? null, accessKey: context.accessKey };
  };
  const sourceIsCurrent = (source: OcrSource) => JSON.stringify(sourceFor(source.documentId)) === JSON.stringify(source);
  const candidateIsCurrent = (candidate: OcrCandidate | null): candidate is OcrCandidate => !!candidate && mounted.current
    && current.current.ocrCandidate === candidate && requestGeneration.current === candidate.generation && sourceIsCurrent(candidate.source);
  const candidateCanApply = (candidate: OcrCandidate | null): candidate is OcrCandidate => current.current.canApplyOcr && candidateIsCurrent(candidate);
  const ocrResult = candidateIsCurrent(ocrCandidate) ? ocrCandidate.values : null;
  const ocrDocType = ocrResult ? ocrCandidate!.source.docType : null;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requestGeneration.current += 1; };
  }, []);
  useEffect(() => {
    requestGeneration.current += 1;
    setOcrDocId(null); setOcrCandidate(null); setOcrOpen(false);
  }, [organizationId, studentUserId, accessKey, sourceKey]);

  useEffect(() => {
    setSnilsValue(currentFrdoData?.snils || ""); setLastName(currentFrdoData?.last_name || "");
    setFirstName(currentFrdoData?.first_name || ""); setMiddleName(currentFrdoData?.middle_name || ""); setBirthDate(currentFrdoData?.birth_date || "");
    // Preserve edits to other fields during a same-card single-field save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frdoContextKey]);

  const handleSnilsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSnilsValue(formatSnils(e.target.value));
  };
  const saveManualFrdoField = (field: string, value: string) => {
    if (!mounted.current || !current.current.canWriteFrdo) return;
    return current.current.saveFrdoField(field, value);
  };

  const handleRecognize = async (doc: any) => {
    const source = sourceFor(doc.id);
    if (!source || applyingOcrRef.current) return;
    const generation = ++requestGeneration.current;
    setOcrDocId(doc.id);
    setOcrCandidate(null); setOcrOpen(false);
    try {
      const { data, error } = await supabase.functions.invoke("ocr-snils", {
        body: { documentId: source.documentId, organizationId: source.organizationId, studentUserId: source.studentUserId, doc_type: source.docType },
      });
      if (requestGeneration.current !== generation || !sourceIsCurrent(source)) return;
      if (error) throw error;
      const parsed = ocrResponseSchema.safeParse(data);
      if (!parsed.success || parsed.data.documentId !== source.documentId || parsed.data.doc_type !== source.docType) {
        toast.error("Не удалось подтвердить результат для выбранного документа. Повторите распознавание.");
        return;
      }
      const res = parsed.data;
      const hasAny = ocrFields.some(field => !!res[field]?.trim());
      if (!hasAny) {
        toast.error("Не удалось распознать данные — проверьте качество скана");
        return;
      }
      setOcrCandidate({ source, values: res, generation });
      setOcrOpen(true);
    } catch {
      if (requestGeneration.current === generation && sourceIsCurrent(source)) toast.error("Не удалось распознать документ. Повторите попытку.");
    } finally {
      if (mounted.current && requestGeneration.current === generation) setOcrDocId(null);
    }
  };

  const updateOcrInput = (field: OcrField, value: string) => {
    if (field === "snils") setSnilsValue(value);
    if (field === "birth_date") setBirthDate(value);
  };
  const applyOcrAll = async () => {
    const candidate = current.current.ocrCandidate;
    if (!candidateCanApply(candidate) || applyingOcrRef.current) return;
    const save = current.current.saveFrdoField;
    applyingOcrRef.current = true; setApplyingOcr(true);
    try {
      for (const field of ocrFields) {
        if (!candidateCanApply(candidate)) return;
        const value = candidate.values[field];
        if (value) {
          // eslint-disable-next-line no-await-in-loop
          const saved = await save(field, value);
          if (!candidateCanApply(candidate)) return;
          if (saved !== true) return;
          updateOcrInput(field, value);
        }
      }
      setOcrOpen(false);
    } catch {
      if (candidateIsCurrent(candidate)) toast.error("Не удалось сохранить распознанные данные.");
    } finally {
      applyingOcrRef.current = false;
      if (mounted.current) setApplyingOcr(false);
    }
  };

  const applyOcrField = async (field: OcrField) => {
    const candidate = current.current.ocrCandidate;
    if (!candidateCanApply(candidate) || applyingOcrRef.current) return;
    const value = candidate.values[field];
    if (!value) return;
    const save = current.current.saveFrdoField;
    applyingOcrRef.current = true; setApplyingOcr(true);
    try {
      const saved = await save(field, value);
      if (saved === true && candidateCanApply(candidate)) updateOcrInput(field, value);
    } catch {
      if (candidateIsCurrent(candidate)) toast.error("Не удалось сохранить распознанные данные.");
    } finally {
      applyingOcrRef.current = false;
      if (mounted.current) setApplyingOcr(false);
    }
  };


  return (
    <div className="space-y-6">
      {/* Upload documents section */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5 text-primary" />
          Загрузить документы
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {DOC_TYPES.map((doc) => {
            const existing = h.identityDocs.find((d: any) => d.type === doc.type);
            return (
              <Button
                key={doc.type}
                variant={existing ? "outline" : "default"}
                className="justify-start gap-2 rounded-xl h-auto py-3"
                disabled={h.uploadingType === doc.type}
                onClick={() => h.handleUploadClick(doc.type)}
              >
                {h.uploadingType === doc.type ? (
                  <SigmaSpinner size="sm" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                <span className="text-left">
                  {doc.label}
                  {existing && <span className="block text-xs opacity-60">Загружен</span>}
                </span>
              </Button>
            );
          })}
        </div>
        <input
          ref={h.fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.doc,.docx"
          onChange={h.handleFileChange}
        />
      </div>

      {/* SNILS & Personal data section */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-primary" />
          Персональные данные (ФРДО)
        </h3>
        {!currentFrdoData && <p role="alert" className="mb-4 text-sm text-muted-foreground">Данные выбранного ученика ещё не подтверждены. Повторите загрузку карточки.</p>}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Фамилия</Label>
            <div className="flex gap-2">
              <Input value={currentFrdoData ? lastName : ""} readOnly={!canWriteFrdo} onChange={(e) => setLastName(e.target.value)} placeholder="Иванов" />
              <Button size="sm" variant="ghost" className="shrink-0" aria-label="Сохранить фамилию" disabled={!canWriteFrdo || h.savingFrdoField === "last_name"} onClick={() => void saveManualFrdoField("last_name", lastName)}>
                {h.savingFrdoField === "last_name" ? <SigmaSpinner size="sm" /> : <Save className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Имя</Label>
            <div className="flex gap-2">
              <Input value={currentFrdoData ? firstName : ""} readOnly={!canWriteFrdo} onChange={(e) => setFirstName(e.target.value)} placeholder="Иван" />
              <Button size="sm" variant="ghost" className="shrink-0" aria-label="Сохранить имя" disabled={!canWriteFrdo || h.savingFrdoField === "first_name"} onClick={() => void saveManualFrdoField("first_name", firstName)}>
                {h.savingFrdoField === "first_name" ? <SigmaSpinner size="sm" /> : <Save className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Отчество</Label>
            <div className="flex gap-2">
              <Input value={currentFrdoData ? middleName : ""} readOnly={!canWriteFrdo} onChange={(e) => setMiddleName(e.target.value)} placeholder="Иванович" />
              <Button size="sm" variant="ghost" className="shrink-0" aria-label="Сохранить отчество" disabled={!canWriteFrdo || h.savingFrdoField === "middle_name"} onClick={() => void saveManualFrdoField("middle_name", middleName)}>
                {h.savingFrdoField === "middle_name" ? <SigmaSpinner size="sm" /> : <Save className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Дата рождения</Label>
            <div className="flex gap-2">
              <Input type="date" value={currentFrdoData ? birthDate : ""} readOnly={!canWriteFrdo} onChange={(e) => setBirthDate(e.target.value)} />
              <Button size="sm" variant="ghost" className="shrink-0" aria-label="Сохранить дату рождения" disabled={!canWriteFrdo || h.savingFrdoField === "birth_date"} onClick={() => void saveManualFrdoField("birth_date", birthDate)}>
                {h.savingFrdoField === "birth_date" ? <SigmaSpinner size="sm" /> : <Save className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2 col-span-2">
            <Label>СНИЛС</Label>
            <div className="flex gap-2">
              <Input
                ref={snilsInputRef}
                id="student-frdo-snils"
                data-testid="student-frdo-snils-input"
                value={currentFrdoData ? snilsValue : ""}
                readOnly={!canWriteFrdo}
                onChange={handleSnilsChange}
                placeholder="XXX-XXX-XXX XX"
                maxLength={14}
                className="max-w-xs"
              />
              <Button size="sm" variant="ghost" className="shrink-0" aria-label="Сохранить СНИЛС" disabled={!canWriteFrdo || h.savingFrdoField === "snils" || (snilsValue && !isValidSnils(snilsValue))} onClick={() => void saveManualFrdoField("snils", snilsValue)}>
                {h.savingFrdoField === "snils" ? <SigmaSpinner size="sm" /> : <Save className="w-4 h-4" />}
              </Button>
            </div>
            {snilsValue && !isValidSnils(snilsValue) && (
              <p className="text-xs text-destructive">СНИЛС должен содержать 11 цифр</p>
            )}
          </div>
        </div>
      </div>

      {/* Existing documents list */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          Загруженные документы ({h.identityDocs.length})
        </h3>
        {h.identityDocs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Нет загруженных документов</p>
          </div>
        ) : (
          <div className="space-y-3">
            {h.identityDocs.map((doc: any) => (
              <div key={doc.id} className="flex items-center justify-between p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium">{doc.name}</div>
                    <div className="text-xs text-muted-foreground">{h.formatDate(doc.created_at)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {(doc.type === "snils" || doc.type === "passport") && (
                    canProcessOcr ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="ghost" className="rounded-lg text-primary" aria-label={`Распознать ${doc.name}`}
                              disabled={ocrDocId !== null || applyingOcr || !sourceFor(doc.id)} onClick={() => handleRecognize(doc)}>
                              {ocrDocId === doc.id ? <SigmaSpinner size="sm" /> : <ScanLine className="w-4 h-4" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Распознать данные (ИИ)</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="ghost" className="rounded-lg text-muted-foreground" aria-label={`Распознать ${doc.name}`} disabled>
                              <Lock className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{ocrPlanEnabled ? "Для распознавания нужны права изменения документов и учеников." : "Распознавание доступно на тарифах «Профессиональный» и «Максимальный»"}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )
                  )}
                  <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => h.handlePreviewDoc(doc)}>
                    {h.isLoadingPreview ? <SigmaSpinner size="sm" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button size="sm" variant="ghost" className="rounded-lg text-destructive hover:text-destructive" onClick={() => h.handleDeleteIdentityDoc(doc)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={ocrOpen && !!ocrResult} onOpenChange={setOcrOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {ocrDocType === "passport" ? "Распознанные данные паспорта" : "Распознанные данные СНИЛС"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {[
                  { label: "СНИЛС", value: ocrResult?.snils, field: "snils", setter: setSnilsValue },
                  { label: "Дата рождения", value: ocrResult?.birth_date, field: "birth_date", setter: setBirthDate },
                  { label: "Серия паспорта", value: ocrResult?.passport_series, field: "passport_series" },
                  { label: "Номер паспорта", value: ocrResult?.passport_number, field: "passport_number" },
                  { label: "Дата выдачи", value: ocrResult?.passport_issue_date, field: "passport_issue_date" },
                  { label: "Код подразделения", value: ocrResult?.passport_department_code, field: "passport_department_code" },
                  { label: "Кем выдан", value: ocrResult?.passport_issued_by, field: "passport_issued_by" },
                ].filter(r => r.value).map((r) => (
                  <div key={r.field} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">{r.label}</div>
                      <div className="font-medium truncate">{r.value}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0"
                      disabled={applyingOcr || !ocrResult || !canApplyOcr}
                      onClick={() => void applyOcrField(r.field as OcrField)}
                    >
                      Применить
                    </Button>
                  </div>
                ))}
                {typeof ocrResult?.confidence === "number" && (
                  <div className="flex justify-between text-xs pt-1"><span className="text-muted-foreground">Уверенность модели:</span><span>{Math.round((ocrResult.confidence || 0) * 100)}%</span></div>
                )}
                <p className="text-xs text-muted-foreground pt-2">Проверьте данные — распознавание может содержать ошибки.</p>
                {!canApplyOcr && <p className="text-xs text-muted-foreground">Для сохранения нужно право изменения данных ФРДО.</p>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-wrap gap-2">
            <AlertDialogCancel>Закрыть</AlertDialogCancel>
            <AlertDialogAction disabled={applyingOcr || !ocrResult || !canApplyOcr} onClick={(event) => { event.preventDefault(); void applyOcrAll(); }}>Применить все</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
