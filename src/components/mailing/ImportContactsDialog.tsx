import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, AlertTriangle } from "lucide-react";
import {
  CONTACT_FIELDS,
  ColumnMapping,
  ImportPlan,
  ParsedFile,
  autoDetectMapping,
  buildImportPlan,
  customFieldKey,
  mappingHasEmail,
  parseCsv,
  parseContactsFile,
} from "@/utils/mailing/contactsImport";

interface Props {
  open: boolean;
  onClose: () => void;
  organizationId: string | null;
  onImported?: () => void;
}

interface CampaignOption {
  id: string;
  name: string;
  status: string;
}

type Step = "file" | "mapping" | "confirm" | "done";

/**
 * Этап 2: импорт контактов в ЯВНО выбранную черновую кампанию.
 * Ничего не пишется в базу до подтверждения на шаге «Проверка».
 */
export function ImportContactsDialog({ open, onClose, organizationId, onImported }: Props) {
  const [step, setStep] = useState<Step>("file");
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [fileName, setFileName] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [existingEmails, setExistingEmails] = useState<string[]>([]);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep("file");
      setParsed(null);
      setPlan(null);
      setMapping({});
      setFileName("");
      setPastedText("");
      setCampaignId("");
      return;
    }
    if (!organizationId) return;
    supabase
      .from("email_campaigns")
      .select("id, name, status")
      .eq("scope", "org")
      .eq("organization_id", organizationId)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setCampaigns((data || []) as CampaignOption[]));
  }, [open, organizationId]);

  useEffect(() => {
    if (!campaignId) {
      setExistingEmails([]);
      return;
    }
    supabase
      .from("email_campaign_recipients")
      .select("email")
      .eq("campaign_id", campaignId)
      .limit(20000)
      .then(({ data }) => setExistingEmails((data || []).map((r) => r.email)));
  }, [campaignId]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const result = await parseContactsFile(file);
      if (!result.headers.length || !result.rows.length) {
        toast.error("Файл пустой или без строк данных");
        return;
      }
      setParsed(result);
      setFileName(file.name);
      setMapping(autoDetectMapping(result.headers));
      setStep("mapping");
    } catch (e) {
      toast.error("Не удалось прочитать файл");
    }
  };

  const handlePaste = () => {
    const result = parseCsv(pastedText);
    if (!result.headers.length || !result.rows.length) {
      toast.error("Вставленный CSV/TSV пуст или не содержит строк данных");
      return;
    }
    setParsed(result);
    setFileName("вставленные данные");
    setMapping(autoDetectMapping(result.headers));
    setPastedText("");
    setStep("mapping");
  };

  const emailMapped = mappingHasEmail(mapping);

  const preview = useMemo(() => (parsed ? parsed.rows.slice(0, 5) : []), [parsed]);

  const goCheck = () => {
    if (!parsed || !emailMapped) return;
    setPlan(buildImportPlan(parsed, mapping, existingEmails));
    setStep("confirm");
  };

  const runImport = async () => {
    if (!plan || !campaignId) return;
    setBusy(true);
    try {
      const rows = plan.toInsert.map((c) => ({
        campaign_id: campaignId,
        email: c.email,
        recipient_name: [c.first_name, c.last_name].filter(Boolean).join(" ") || null,
        first_name: c.first_name,
        last_name: c.last_name,
        organization: c.organization,
        position: c.position,
        city: c.city,
        custom_data: Object.keys(c.custom_data).length ? c.custom_data : null,
        status: "pending",
      }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from("email_campaign_recipients").insert(rows.slice(i, i + 500));
        if (error) throw error;
      }
      await supabase
        .from("email_campaigns")
        .update({ total_recipients: existingEmails.length + rows.length })
        .eq("id", campaignId);
      toast.success(`Импортировано контактов: ${rows.length}`);
      setStep("done");
      onImported?.();
    } catch (e: any) {
      toast.error(e?.message || "Ошибка импорта");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Импорт контактов CSV/XLSX
          </DialogTitle>
        </DialogHeader>

        {step === "file" && (
          <div className="space-y-4">
            <div>
              <Label>Черновая кампания</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger data-testid="import-campaign-select">
                  <SelectValue placeholder="Выберите черновик кампании" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Контакты добавляются только в выбранный черновик. Рассылка не создаётся и не запускается.
              </p>
              {campaigns.length === 0 && (
                <p className="mt-1 text-xs text-destructive">
                  Нет черновиков кампаний — создайте кампанию, затем импортируйте базу.
                </p>
              )}
            </div>
            <div>
              <Label>Файл</Label>
              <input
                type="file"
                accept=".csv,.txt,.xlsx,.xls"
                disabled={!campaignId}
                onChange={(e) => handleFile(e.target.files?.[0])}
                className="mt-1 block w-full text-sm"
                data-testid="import-file-input"
              />
            </div>
            <div className="space-y-2 border-t pt-4">
              <Label htmlFor="contacts-paste">Или вставьте CSV/TSV целиком</Label>
              <Textarea
                id="contacts-paste"
                value={pastedText}
                onChange={(event) => setPastedText(event.target.value)}
                disabled={!campaignId}
                placeholder="email;first_name;organization;send_order…"
                className="min-h-28 font-mono text-xs"
                data-testid="import-contacts-paste"
              />
              <p className="text-xs text-muted-foreground">
                Поддерживаются разделители: точка с запятой, запятая и табуляция. Данные очищаются из поля сразу после разбора.
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={!campaignId || !pastedText.trim()}
                onClick={handlePaste}
                data-testid="import-contacts-paste-parse"
              >
                Разобрать вставленные данные
              </Button>
            </div>
          </div>
        )}

        {step === "mapping" && parsed && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Файл: {fileName} · строк: {parsed.rows.length}
            </p>
            <div className="space-y-2">
              {parsed.headers.map((h, i) => (
                <div key={`${h}-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
                  <span className="w-40 truncate text-sm font-medium">{h || `Колонка ${i + 1}`}</span>
                  <span className="flex-1 truncate text-xs text-muted-foreground">
                    {preview.map((r) => r[i]).filter(Boolean).slice(0, 3).join(" · ")}
                  </span>
                  <Select
                    value={mapping[i] ?? "skip"}
                    onValueChange={(v) => setMapping((m) => ({ ...m, [i]: v as ColumnMapping[number] }))}
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTACT_FIELDS.map((f) => (
                        <SelectItem key={f.key} value={f.key}>
                          {f.label}
                          {f.required ? " *" : ""}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">
                        Своё поле {`{{${customFieldKey(h) || `column_${i + 1}`}}}`}
                      </SelectItem>
                      <SelectItem value="skip">Не импортировать</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {!emailMapped && (
              <p className="flex items-center gap-2 text-sm text-destructive" data-testid="import-email-required">
                <AlertTriangle className="h-4 w-4" /> Обязательно сопоставьте колонку Email.
              </p>
            )}
          </div>
        )}

        {step === "confirm" && plan && (
          <div className="space-y-3" data-testid="import-summary">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Добавлено: {plan.counts.added}</Badge>
              <Badge variant="outline">Дубликаты в файле: {plan.counts.duplicatesInFile}</Badge>
              <Badge variant="outline">Дубликаты кампании: {plan.counts.duplicatesInCampaign}</Badge>
              <Badge variant="outline">Невалидные: {plan.counts.invalid}</Badge>
              <Badge variant="outline">Пропущено: {plan.counts.skipped}</Badge>
            </div>
            {plan.customKeys.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Свои переменные: {plan.customKeys.map((k) => `{{${k}}}`).join(", ")}
              </p>
            )}
            {plan.rejected.length > 0 && (
              <div className="max-h-48 divide-y overflow-y-auto rounded-lg border text-xs">
                {plan.rejected.slice(0, 100).map((r) => (
                  <div key={`${r.rowIndex}-${r.email}`} className="flex items-center gap-2 p-2">
                    <span className="w-14 text-muted-foreground">стр. {r.rowIndex}</span>
                    <span className="flex-1 truncate">{r.email || "—"}</span>
                    <span className="text-muted-foreground">
                      {r.reason === "invalid_email" && "некорректный email"}
                      {r.reason === "empty" && "нет email"}
                      {r.reason === "duplicate_in_file" && "дубликат в файле"}
                      {r.reason === "duplicate_in_campaign" && "уже в кампании"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "done" && (
          <p className="text-sm">Импорт завершён. Получатели добавлены в выбранный черновик кампании.</p>
        )}

        <DialogFooter>
          {step === "mapping" && (
            <>
              <Button variant="outline" onClick={() => setStep("file")}>
                Назад
              </Button>
              <Button onClick={goCheck} disabled={!emailMapped} data-testid="import-check-button">
                Проверить
              </Button>
            </>
          )}
          {step === "confirm" && (
            <>
              <Button variant="outline" onClick={() => setStep("mapping")}>
                Назад
              </Button>
              <Button
                onClick={runImport}
                disabled={busy || !plan?.counts.added}
                data-testid="import-confirm-button"
              >
                {busy ? "Импорт…" : `Импортировать (${plan?.counts.added ?? 0})`}
              </Button>
            </>
          )}
          {(step === "file" || step === "done") && (
            <Button variant="outline" onClick={onClose}>
              Закрыть
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ImportContactsDialog;
