import { useRef, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Upload, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export type RecipientSource = "students" | "companies" | "organizations" | "companies_db" | "manual";

export interface RecipientPickerValue {
  source: RecipientSource;
  manualEmails: string[];
  count: number;
  /** true once server preview has succeeded for the current inputs */
  previewReady?: boolean;
}

interface PreviewResult {
  input_count: number;
  invalid_count: number;
  duplicate_count: number;
  suppressed_count: number;
  eligible_count: number;
}

interface Props {
  scope: "platform" | "org";
  organizationId: string | null;
  value: RecipientPickerValue;
  onChange: (v: RecipientPickerValue) => void;
}

export function RecipientPicker({ scope, organizationId, value, onChange }: Props) {
  const [manualText, setManualText] = useState(value.manualEmails.join("\n"));
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: "permission" | "network" | "input"; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Debounce timer for manual input
  const debounceRef = useRef<number | null>(null);

  const fetchPreview = async (
    source: RecipientSource,
    manualEmails: string[],
  ) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc(
        "get_campaign_recipient_preview",
        {
          p_scope: scope === "platform" ? "platform" : "org",
          p_organization_id: scope === "platform" ? null : organizationId,
          p_source: source,
          p_manual_emails: source === "manual" ? manualEmails : null,
        },
      );
      if (rpcErr) {
        const msg = rpcErr.message || "Ошибка запроса";
        const isPerm = /permission denied|42501|Forbidden/i.test(msg);
        setError({ code: isPerm ? "permission" : "network", message: msg });
        setPreview(null);
        // NOTE: do not silently show 0 — leave count as previous, mark previewReady=false
        onChange({ ...value, source, manualEmails, previewReady: false });
        return;
      }
      const p = (data as any) as PreviewResult;
      setPreview(p);
      onChange({
        ...value,
        source,
        manualEmails,
        count: p?.eligible_count ?? 0,
        previewReady: true,
      });
    } catch (e: any) {
      setError({ code: "network", message: e?.message || "Сетевая ошибка" });
      setPreview(null);
      onChange({ ...value, source, manualEmails, previewReady: false });
    } finally {
      setLoading(false);
    }
  };

  // Preview for auto sources — runs whenever source/scope/org changes
  useEffect(() => {
    if (value.source === "manual") return;
    if (scope === "org" && !organizationId) return;
    fetchPreview(value.source, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.source, scope, organizationId]);

  // Manual: 350ms debounce
  useEffect(() => {
    if (value.source !== "manual") return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const emails = parseManual(manualText);
      fetchPreview("manual", emails);
    }, 350);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualText, value.source]);

  const sources: { value: RecipientSource; label: string }[] = scope === "platform"
    ? [
        { value: "organizations", label: "Все организации" },
        { value: "companies_db", label: "База компаний (list-org)" },
        { value: "manual", label: "Ручной список email" },
      ]
    : [
        { value: "students", label: "Мои ученики" },
        { value: "companies", label: "Мои компании-клиенты" },
        { value: "manual", label: "Ручной список email" },
      ];

  const parseManual = (text: string) => {
    return Array.from(new Set(
      text
        .split(/[,;\s\n]+/)
        .map(s => s.trim().toLowerCase())
        .filter(Boolean)
    ));
  };

  const handleFileImport = async (file: File) => {
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("Файл пустой");
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const collected: string[] = [];
      for (const row of rows) {
        for (const cell of row) {
          const v = String(cell || "").trim().toLowerCase();
          if (emailRe.test(v)) collected.push(v);
        }
      }
      const unique = Array.from(new Set(collected));
      if (unique.length === 0) {
        toast.error("В файле не найдено валидных email-адресов");
        return;
      }
      const existing = parseManual(manualText);
      const merged = Array.from(new Set([...existing, ...unique]));
      setManualText(merged.join("\n"));
      toast.success(`Импортировано ${unique.length} адресов (всего ${merged.length})`);
    } catch (e: any) {
      toast.error("Ошибка импорта: " + (e?.message || "не удалось прочитать файл"));
    }
  };

  const showExclusions = preview && (
    (preview.duplicate_count ?? 0) > 0 ||
    (preview.invalid_count ?? 0) > 0 ||
    (preview.suppressed_count ?? 0) > 0
  );

  return (
    <div className="space-y-3">
      <div>
        <Label>Источник получателей</Label>
        <Select
          value={value.source}
          onValueChange={(v) => {
            const src = v as RecipientSource;
            // Reset previewReady until the new source is verified
            onChange({ ...value, source: src, previewReady: false });
          }}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {sources.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {value.source === "manual" && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label>Email-адреса (по одному на строку, через запятую или пробел)</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="gap-1 h-7 text-xs"
            >
              <Upload className="w-3 h-3" /> Импорт из CSV/Excel
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileImport(f);
                e.target.value = "";
              }}
            />
          </div>
          <Textarea
            rows={6}
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="user1@example.com&#10;user2@example.com"
          />
        </div>
      )}

      {/* Preview status line */}
      <div className="text-sm space-y-1">
        {loading && (
          <p className="text-muted-foreground flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Проверяю получателей…
          </p>
        )}
        {!loading && error && (
          <p className="text-destructive flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {error.code === "permission"
              ? "Недостаточно прав для расчёта получателей"
              : `Не удалось проверить получателей: ${error.message}`}
          </p>
        )}
        {!loading && !error && preview && (
          <>
            <p className="text-muted-foreground">
              К отправке: <Badge variant="secondary">{preview.eligible_count}</Badge>
            </p>
            {showExclusions && (
              <p className="text-xs text-muted-foreground">
                Исключено:
                {preview.duplicate_count > 0 && <> дубликаты {preview.duplicate_count},</>}
                {preview.invalid_count > 0 && <> некорректные {preview.invalid_count},</>}
                {preview.suppressed_count > 0 && <> отписавшиеся {preview.suppressed_count}</>}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground/70">
              Итоговое количество повторно проверяется при запуске.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
