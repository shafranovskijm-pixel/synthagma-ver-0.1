import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import {
  fetchStudentLaborSafetyProtocol,
  saveStudentLaborSafetyProtocol,
} from "@/api/studentLaborSafetyProtocol";
import type { LaborSafetyEnrollmentProtocol } from "@/types/laborSafetyProtocol";

interface StudentLaborSafetyProtocolDialogProps {
  organizationId: string;
  enrollmentId: string;
  courseTitle: string;
  legacyProtocolNumber?: string | null;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (protocol: LaborSafetyEnrollmentProtocol) => void;
}

/** Mount with an organization/enrollment key; no student UI or certificate issuance is involved. */
export function StudentLaborSafetyProtocolDialog({
  organizationId,
  enrollmentId,
  courseTitle,
  legacyProtocolNumber = null,
  canEdit,
  onClose,
  onSaved,
}: StudentLaborSafetyProtocolDialogProps) {
  const [protocolNumber, setProtocolNumber] = useState("");
  const [knowledgeCheckDate, setKnowledgeCheckDate] = useState("");
  const [result, setResult] = useState<"passed" | "failed" | "">("");
  const [expectedVersion, setExpectedVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsReload, setNeedsReload] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setNeedsReload(false);
    void fetchStudentLaborSafetyProtocol({ organizationId, enrollmentId })
      .then(protocol => {
        if (!active) return;
        setProtocolNumber(protocol?.protocol_number ?? "");
        setKnowledgeCheckDate(protocol?.knowledge_check_date ?? "");
        setResult(protocol ? protocol.is_passed ? "passed" : "failed" : "");
        setExpectedVersion(protocol?.version ?? null);
      })
      .catch(cause => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Не удалось загрузить протокол");
        setNeedsReload(true);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId, enrollmentId, reloadVersion]);

  const handleSave = async () => {
    if (!canEdit || loading || saving || needsReload) return;
    if (!protocolNumber.trim() || !knowledgeCheckDate || !result) {
      setError("Заполните номер протокола, дату проверки знаний и выберите результат");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const protocol = await saveStudentLaborSafetyProtocol({
        organizationId,
        enrollmentId,
        protocolNumber,
        knowledgeCheckDate,
        isPassed: result === "passed",
        expectedVersion,
      });
      if (!activeRef.current) return;
      onSaved(protocol);
      toast.success("Протокол сохранён и проверен повторным чтением");
      onClose();
    } catch (cause) {
      if (!activeRef.current) return;
      setError(cause instanceof Error ? cause.message : "Не удалось подтвердить сохранение протокола");
      // A timed-out request may already have been committed. Read it back before
      // allowing another save, rather than retrying a blind insert/update.
      setNeedsReload(true);
    } finally {
      if (activeRef.current) setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-w-lg rounded-2xl" data-testid="labor-safety-protocol-dialog">
        <DialogHeader>
          <DialogTitle>Протокол проверки знаний по охране труда</DialogTitle>
          <DialogDescription>{courseTitle}</DialogDescription>
        </DialogHeader>
        <p className="rounded-xl border bg-muted/30 p-3 text-sm" role="note">
          Сохраняются только реквизиты протокола для этого курса. Удостоверение не выпускается,
          приказы и номер удостоверения не нужны. Дата завершения курса и результат теста
          не подставляются автоматически — сверьте данные с протоколом.
        </p>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6" role="status">
            <SigmaSpinner size="sm" /> Загружаем сохранённый протокол…
          </div>
        ) : (
          <div className="space-y-4">
            {!needsReload && (
              <>
                {expectedVersion === null && legacyProtocolNumber && (
                  <div className="rounded-xl border border-amber-300/70 bg-amber-50/60 p-3 text-sm dark:bg-amber-950/10">
                    <p>В старом журнале указан номер: <strong>{legacyProtocolNumber}</strong>. Дата и результат не подтверждены.</p>
                    {canEdit && (
                      <Button type="button" variant="link" className="h-auto px-0 pt-2" onClick={() => setProtocolNumber(legacyProtocolNumber)}>
                        Использовать этот номер
                      </Button>
                    )}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="labor-protocol-number">Номер протокола *</Label>
                  <Input id="labor-protocol-number" value={protocolNumber} maxLength={200} aria-required
                    disabled={!canEdit || saving} onChange={event => setProtocolNumber(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="labor-protocol-date">Дата проверки знаний по протоколу *</Label>
                  <Input id="labor-protocol-date" type="date" value={knowledgeCheckDate} aria-required
                    disabled={!canEdit || saving} onChange={event => setKnowledgeCheckDate(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label id="labor-protocol-result-label">Результат проверки знаний *</Label>
                  <RadioGroup value={result} onValueChange={value => setResult(value as "passed" | "failed")}
                    aria-labelledby="labor-protocol-result-label" aria-required disabled={!canEdit || saving}>
                    <div className="flex items-center gap-2"><RadioGroupItem id="labor-protocol-passed" value="passed" /><Label htmlFor="labor-protocol-passed">Сдал</Label></div>
                    <div className="flex items-center gap-2"><RadioGroupItem id="labor-protocol-failed" value="failed" /><Label htmlFor="labor-protocol-failed">Не сдал</Label></div>
                  </RadioGroup>
                </div>
                <p className="text-xs text-muted-foreground">
                  Это запись оператора. Она не подтверждает регистрацию в Минтруде или совместимость XML с актуальной XSD.
                </p>
              </>
            )}
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            {needsReload && (
              <Button type="button" variant="outline" className="gap-2" onClick={() => setReloadVersion(value => value + 1)}>
                <RefreshCw className="h-4 w-4" /> Обновить данные протокола
              </Button>
            )}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Закрыть</Button>
          <Button type="button" onClick={handleSave} disabled={loading || saving || needsReload || !canEdit}>
            {saving && <SigmaSpinner size="sm" className="mr-2" />}
            Сохранить протокол
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
