import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Upload, Users, Trash2, Eye } from "lucide-react";
import {
  CONTACT_FIELDS,
  dedupeRows,
  guessMapping,
  mapRows,
  parseSpreadsheet,
  type MappingTarget,
  type ParsedSheet,
} from "@/lib/mailing/contactsImport";
import {
  MAILING_VARIABLES,
  MAILING_VARIABLE_LABELS,
  findUnknownVariables,
  renderVariables,
} from "@/lib/mailing/variables";
import { useMailingContacts, type MailingContact } from "@/hooks/useMailingContacts";

interface Props {
  organizationId: string | null;
}

export function MailingContactsTab({ organizationId }: Props) {
  const { contacts, loading, importContacts, removeContact, lastImport } =
    useMailingContacts(organizationId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<MappingTarget[]>([]);
  const [importing, setImporting] = useState(false);
  const [previewContact, setPreviewContact] = useState<MailingContact | null>(null);
  const [previewText, setPreviewText] = useState(
    "Здравствуйте, {{first_name}}!\n\n{{organization}} ({{city}}) — приглашаем на обучение.\nОтписаться: {{unsubscribe_url}}",
  );

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = await parseSpreadsheet(file);
      if (parsed.headers.length === 0) {
        toast.error("Файл пустой или не читается");
        return;
      }
      setSheet(parsed);
      setMapping(guessMapping(parsed.headers));
    } catch (e) {
      toast.error("Не удалось прочитать файл: " + (e as Error).message);
    }
  };

  const mapped = useMemo(() => {
    if (!sheet) return null;
    const { rows, invalid } = mapRows(sheet.headers, sheet.rows, mapping);
    const { unique, duplicates } = dedupeRows(rows);
    return { unique, duplicates, invalid };
  }, [sheet, mapping]);

  const emailMapped = mapping.includes("email");

  const runImport = async () => {
    if (!mapped || !emailMapped) return;
    setImporting(true);
    const summary = await importContacts(mapped.unique);
    setImporting(false);
    if (summary) {
      setSheet(null);
      setMapping([]);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const unknownVars = findUnknownVariables(
    [previewText],
    Object.keys((previewContact?.custom_fields ?? {}) as Record<string, unknown>),
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            База контактов
            <Badge variant="secondary">{contacts.length}</Badge>
          </CardTitle>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xls,.xlsx"
              className="hidden"
              onChange={(e) => onPickFile(e.target.files?.[0])}
              data-testid="mailing-import-input"
            />
            <Button className="gap-2" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" />
              Импорт CSV / XLS / XLSX
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {lastImport && (
            <p className="rounded-lg border bg-muted/30 p-3 text-sm" data-testid="import-summary">
              Последний импорт: добавлено <b>{lastImport.added}</b>, дубликаты{" "}
              <b>{lastImport.duplicates}</b>, ошибки <b>{lastImport.invalid}</b>
            </p>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              База пуста. Загрузите файл — на следующем шаге вы сопоставите столбцы.
            </p>
          ) : (
            <div className="divide-y rounded-lg border">
              {contacts.slice(0, 50).map((c) => (
                <div key={c.id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.email}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[c.first_name, c.last_name, c.organization, c.position, c.city]
                        .filter(Boolean)
                        .join(" · ") || "без дополнительных полей"}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setPreviewContact(c)} title="Предпросмотр">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => removeContact(c.id)} title="Удалить">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Доступные переменные</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {MAILING_VARIABLES.map((v) => (
            <Badge key={v} variant="outline" className="font-mono text-xs">
              {`{{${v}}}`} — {MAILING_VARIABLE_LABELS[v]}
            </Badge>
          ))}
        </CardContent>
      </Card>

      {/* Диалог сопоставления столбцов */}
      <Dialog open={!!sheet} onOpenChange={(o) => !o && setSheet(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Сопоставление столбцов</DialogTitle>
            <DialogDescription>
              Укажите, какому полю контакта соответствует каждый столбец файла. Остальные столбцы
              можно сохранить как собственные поля.
            </DialogDescription>
          </DialogHeader>

          {sheet && (
            <div className="space-y-4">
              <div className="space-y-2">
                {sheet.headers.map((h, i) => (
                  <div key={`${h}-${i}`} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{h || `Столбец ${i + 1}`}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        Пример: {sheet.rows[0]?.[i] || "—"}
                      </p>
                    </div>
                    <Select
                      value={mapping[i] ?? "skip"}
                      onValueChange={(v) =>
                        setMapping((prev) => prev.map((m, idx) => (idx === i ? (v as MappingTarget) : m)))
                      }
                    >
                      <SelectTrigger className="w-56">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTACT_FIELDS.map((f) => (
                          <SelectItem key={f.key} value={f.key}>
                            {f.label}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">Своё поле (custom_fields)</SelectItem>
                        <SelectItem value="skip">Не импортировать</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              {mapped && (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  К импорту: <b>{mapped.unique.length}</b> · дубликаты в файле:{" "}
                  <b>{mapped.duplicates}</b> · строки с ошибками: <b>{mapped.invalid}</b>
                </div>
              )}

              {!emailMapped && (
                <p className="text-sm text-destructive">
                  Обязательно укажите столбец с Email — без него импорт невозможен.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSheet(null)}>
              Отмена
            </Button>
            <Button
              onClick={runImport}
              disabled={!emailMapped || importing || !mapped?.unique.length}
              data-testid="run-import"
            >
              {importing ? "Импортируем…" : "Импортировать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Предпросмотр подстановки переменных */}
      <Dialog open={!!previewContact} onOpenChange={(o) => !o && setPreviewContact(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Предпросмотр для {previewContact?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Текст с переменными</Label>
              <Textarea
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
                rows={5}
                className="font-mono text-xs"
              />
            </div>
            {unknownVars.length > 0 && (
              <p className="text-sm text-destructive">
                Неизвестные переменные: {unknownVars.map((v) => `{{${v}}}`).join(", ")}
              </p>
            )}
            <div>
              <Label className="text-xs">Результат</Label>
              <pre
                className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm"
                data-testid="variable-preview"
              >
                {renderVariables(previewText, previewContact, {
                  unsubscribeUrl: `${window.location.origin}/email-response?a=unsubscribe`,
                })}
              </pre>
            </div>
            <Input readOnly value={previewContact?.email ?? ""} className="text-xs" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
