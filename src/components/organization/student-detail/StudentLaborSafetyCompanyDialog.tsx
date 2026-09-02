import { useEffect, useMemo, useState } from "react";
import { Building2, Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import {
  assignStudentLaborSafetyCompany,
  createStudentLaborSafetyCompany,
  fetchStudentLaborSafetyCompanies,
  updateStudentLaborSafetyCompany,
  type StudentLaborSafetyCompany,
} from "@/api/studentLaborSafetyCompany";

interface StudentLaborSafetyCompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  userId: string;
  currentCompanyId?: string | null;
  currentCompany?: { name: string; inn: string | null } | null;
  canEditCompanies: boolean;
  canAssignCompany: boolean;
  onSaved: (company: StudentLaborSafetyCompany) => void | Promise<void>;
}

type CompanyMode = "existing" | "create";

export function StudentLaborSafetyCompanyDialog({
  open,
  onOpenChange,
  organizationId,
  userId,
  currentCompanyId = null,
  currentCompany = null,
  canEditCompanies,
  canAssignCompany,
  onSaved,
}: StudentLaborSafetyCompanyDialogProps) {
  const [companies, setCompanies] = useState<StudentLaborSafetyCompany[]>([]);
  const [mode, setMode] = useState<CompanyMode>(currentCompanyId ? "existing" : "create");
  const [selectedCompanyId, setSelectedCompanyId] = useState(currentCompanyId ?? "");
  const [name, setName] = useState(currentCompany?.name ?? "");
  const [inn, setInn] = useState(currentCompany?.inn ?? "");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCompany = useMemo(
    () => companies.find(company => company.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    void fetchStudentLaborSafetyCompanies(organizationId)
      .then((result) => {
        if (!active) return;
        setCompanies(result);
        const current = currentCompanyId
          ? result.find(company => company.id === currentCompanyId) ?? null
          : null;
        const first = current ?? result[0] ?? null;
        if (first) {
          setMode("existing");
          setSelectedCompanyId(first.id);
          setName(first.name);
          setInn(first.inn ?? "");
        } else {
          setMode("create");
          setSelectedCompanyId("");
          setName(currentCompany?.name ?? "");
          setInn(currentCompany?.inn ?? "");
        }
      })
      .catch((cause) => {
        if (!active) return;
        console.error("[StudentLaborSafetyCompanyDialog] load failed:", cause);
        setError("Не удалось загрузить компании текущей организации");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [currentCompany?.inn, currentCompany?.name, currentCompanyId, open, organizationId]);

  useEffect(() => {
    if (mode !== "existing" || !selectedCompany) return;
    setName(selectedCompany.name);
    setInn(selectedCompany.inn ?? "");
  }, [mode, selectedCompany]);

  const selectCompany = (company: StudentLaborSafetyCompany) => {
    setMode("existing");
    setSelectedCompanyId(company.id);
    setName(company.name);
    setInn(company.inn ?? "");
    setError(null);
  };

  const startCreate = () => {
    setMode("create");
    setSelectedCompanyId("");
    setName("");
    setInn("");
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      let company: StudentLaborSafetyCompany;
      if (mode === "create") {
        if (!canEditCompanies || !canAssignCompany) {
          throw new Error("Недостаточно прав для создания и назначения компании");
        }
        company = await createStudentLaborSafetyCompany({ organizationId, name, inn });
        // If the subsequent profile assignment fails, keep the newly created
        // company selected so a retry cannot create a duplicate.
        setCompanies(current => current.some(item => item.id === company.id) ? current : [...current, company]);
        setMode("existing");
        setSelectedCompanyId(company.id);
        setName(company.name);
        setInn(company.inn ?? "");
      } else {
        if (!selectedCompany) throw new Error("Выберите компанию");
        if (!canEditCompanies) throw new Error("Недостаточно прав для изменения реквизитов компании");
        company = await updateStudentLaborSafetyCompany({
          organizationId,
          companyId: selectedCompany.id,
          name,
          inn,
        });
      }

      if (company.id !== currentCompanyId) {
        if (!canAssignCompany) throw new Error("Недостаточно прав для назначения компании ученику");
        company = await assignStudentLaborSafetyCompany({
          organizationId,
          userId,
          companyId: company.id,
        });
      }

      await onSaved(company);
      toast.success("Компания назначена, реквизиты сохранены");
      onOpenChange(false);
    } catch (cause) {
      console.error("[StudentLaborSafetyCompanyDialog] save failed:", cause);
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить компанию");
    } finally {
      setSaving(false);
    }
  };

  const canChooseAnother = canAssignCompany;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-2xl" data-testid="labor-safety-company-dialog">
        <DialogHeader>
          <DialogTitle>Компания ученика для XML-черновика</DialogTitle>
          <DialogDescription>
            Выберите направившую компанию или создайте её, затем проверьте название и ИНН. После сохранения вы вернётесь в документы ученика.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8" role="status">
            <SigmaSpinner size="sm" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {canChooseAnother && companies.length > 0 && (
              <div className="space-y-2">
                <Label>Выберите существующую компанию</Label>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border p-2">
                  {companies.map(company => (
                    <button
                      key={company.id}
                      type="button"
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                        mode === "existing" && selectedCompanyId === company.id
                          ? "border-primary bg-primary/5"
                          : "border-transparent hover:bg-muted"
                      }`}
                      onClick={() => selectCompany(company)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{company.name}</span>
                        <span className="block text-xs text-muted-foreground">ИНН: {company.inn || "не заполнен"}</span>
                      </span>
                      {mode === "existing" && selectedCompanyId === company.id && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {canChooseAnother && (
              <Button type="button" variant="outline" className="w-full gap-2 rounded-xl" onClick={startCreate}>
                <Plus className="h-4 w-4" /> Создать новую компанию
              </Button>
            )}

            <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center gap-2 font-medium">
                <Building2 className="h-4 w-4" />
                {mode === "create" ? "Новая компания" : "Реквизиты выбранной компании"}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="labor-company-name">Наименование компании</Label>
                <Input
                  id="labor-company-name"
                  value={name}
                  onChange={event => setName(event.target.value)}
                  placeholder="ООО «Компания»"
                  disabled={!canEditCompanies}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="labor-company-inn">ИНН компании</Label>
                <Input
                  id="labor-company-inn"
                  inputMode="numeric"
                  value={inn}
                  onChange={event => setInn(event.target.value.replace(/\D/g, "").slice(0, 12))}
                  placeholder="10 или 12 цифр"
                  disabled={!canEditCompanies}
                />
                <p className="text-xs text-muted-foreground">Проверяются длина и контрольная сумма ИНН.</p>
              </div>
            </div>

            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Вернуться к документам</Button>
          <Button type="button" onClick={handleSave} disabled={loading || saving || !canEditCompanies}>
            {saving && <SigmaSpinner size="sm" className="mr-2" />}
            Сохранить и вернуться
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
