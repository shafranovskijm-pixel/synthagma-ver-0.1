import { useRef, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Upload, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

// "none" — явный дефолт для новой кампании: получатели не выбраны.
export type RecipientSource = "none" | "students" | "companies" | "organizations" | "companies_db" | "manual";

export interface RecipientPickerValue {
  source: RecipientSource;
  /** Raw normalized tokens — duplicates preserved so the server can report duplicate_count. */
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
  onChange: (v: RecipientPickerValue, reason: "user" | "preview") => void;
}

// Parse raw manual tokens WITHOUT deduplication — the server owns duplicate stats.
// Trims + lower-cases so preview and materialization use identical normalization.
function parseManualRaw(text: string): string[] {
  return text
    .split(/[,;\s\n]+/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

export function RecipientPicker({ scope, organizationId, value, onChange }: Props) {
  const [manualText, setManualText] = useState(value.manualEmails.join("\n"));
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: "permission" | "network" | "input"; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Debounce timer for manual input
  const debounceRef = useRef<number | null>(null);
  // Monotonic request id — only the last in-flight request may commit state.
  const requestSeqRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const manualKey = JSON.stringify(value.manualEmails);
  // AbortController for the current preview request.
  const abortRef = useRef<AbortController | null>(null);
  // Track mounted state to avoid post-unmount setState.
  const mountedRef = useRef(true);
  const invalidatePreview = () => {
    ++requestSeqRef.current;
    abortRef.current?.abort();
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    setPreview(null);
    setError(null);
    setLoading(false);
  };

  // Reopening another/saved draft must replace the textarea, not the stored list.
  // Do not normalize the visible text while the user is typing separators.
  useEffect(() => {
    setManualText(previous => JSON.stringify(parseManualRaw(previous)) === manualKey
      ? previous : value.manualEmails.join("\n"));
  }, [manualKey]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortRef.current) abortRef.current.abort();
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

  const fetchPreview = async (
    source: RecipientSource,
    manualEmails: string[],
  ) => {
    // Invalidate any in-flight request.
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const mySeq = ++requestSeqRef.current;

    setLoading(true);
    setError(null);
    try {
      // Supabase JS v2 supports AbortSignal via .abortSignal(ac.signal); we still guard by seq.
      const q = supabase.rpc(
        "get_campaign_recipient_preview",
        {
          p_scope: scope === "platform" ? "platform" : "org",
          p_organization_id: scope === "platform" ? null : organizationId,
          p_source: source,
          p_manual_emails: source === "manual" ? manualEmails : null,
        },
      );
      // @ts-ignore — .abortSignal is available on the PostgrestFilterBuilder
      const withSignal = typeof (q as any).abortSignal === "function" ? (q as any).abortSignal(ac.signal) : q;
      const { data, error: rpcErr } = await withSignal;

      // Stale response — a newer request has been issued; drop.
      if (mySeq !== requestSeqRef.current || !mountedRef.current || ac.signal.aborted
        || source !== valueRef.current.source
        || (source === "manual" && JSON.stringify(manualEmails) !== JSON.stringify(valueRef.current.manualEmails))) return;

      if (rpcErr) {
        const msg = rpcErr.message || "Ошибка запроса";
        const isPerm = /permission denied|42501|Forbidden/i.test(msg);
        setError({ code: isPerm ? "permission" : "network", message: msg });
        setPreview(null);
        onChangeRef.current({ ...valueRef.current, count: 0, previewReady: false }, "preview");
        return;
      }
      const p = (data as any) as PreviewResult;
      setPreview(p);
      onChangeRef.current({
        ...valueRef.current,
        count: p?.eligible_count ?? 0,
        previewReady: true,
      }, "preview");
    } catch (e: any) {
      if (mySeq !== requestSeqRef.current || !mountedRef.current || ac.signal.aborted) return;
      setError({ code: "network", message: e?.message || "Сетевая ошибка" });
      setPreview(null);
      onChangeRef.current({ ...valueRef.current, count: 0, previewReady: false }, "preview");
    } finally {
      if (mySeq === requestSeqRef.current && mountedRef.current) setLoading(false);
    }
  };

  // Invalidate immediately for every input change, before the manual debounce.
  // Old RPCs must never restore an older list or unlock Launch on newer input.
  useEffect(() => {
    invalidatePreview();
    // "none": получатели не выбраны — никаких запросов и записей в БД.
    if (value.source === "none") {
      setPreview(null);
      setError(null);
      setLoading(false);
      if (value.count !== 0 || value.previewReady !== false) {
        onChangeRef.current({ ...valueRef.current, count: 0, previewReady: false }, "preview");
      }
      return;
    }
    if (scope === "org" && !organizationId) return;
    // Immediately block launch: previewReady=false until new response arrives.
    if (value.previewReady !== false) {
      onChangeRef.current({ ...valueRef.current, count: 0, previewReady: false }, "preview");
    }
    if (value.source === "manual") {
      debounceRef.current = window.setTimeout(() => {
        fetchPreview("manual", value.manualEmails);
      }, 350);
    } else {
      fetchPreview(value.source, []);
    }
    return () => {
      ++requestSeqRef.current;
      abortRef.current?.abort();
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualKey, manualText, value.source, scope, organizationId]);

  const NONE_SOURCE = { value: "none" as RecipientSource, label: "Без получателей / добавить позже" };
  const sources: { value: RecipientSource; label: string }[] = scope === "platform"
    ? [
        NONE_SOURCE,
        { value: "organizations", label: "Все организации" },
        { value: "companies_db", label: "База компаний (list-org)" },
        { value: "manual", label: "Ручной список email" },
      ]
    : [
        NONE_SOURCE,
        { value: "students", label: "Мои ученики" },
        { value: "companies", label: "Мои компании-клиенты" },
        { value: "manual", label: "Ручной список email" },
      ];

  const handleFileImport = async (file: File) => {
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("Файл пустой");
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      // Preserve duplicates: the server-side preview reports duplicate_count.
      const collected: string[] = [];
      for (const row of rows) {
        for (const cell of row) {
          const v = String(cell || "").trim().toLowerCase();
          if (emailRe.test(v)) collected.push(v);
        }
      }
      if (collected.length === 0) {
        toast.error("В файле не найдено валидных email-адресов");
        return;
      }
      const existing = valueRef.current.manualEmails;
      const merged = [...existing, ...collected];
      invalidatePreview();
      setManualText(merged.join("\n"));
      // Immediately mark preview stale — server will report duplicates.
      onChangeRef.current({ ...valueRef.current, source: "manual", manualEmails: merged, count: 0, previewReady: false }, "user");
      toast.success(`Импортировано ${collected.length} адресов (всего ${merged.length})`);
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
            invalidatePreview();
            // Reset previewReady until the new source is verified.
            // fetchPreview will abort any in-flight request on the old source.
            onChange({ ...value, source: src, count: 0, previewReady: false }, "user");
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
            onChange={(e) => {
              const next = e.target.value;
              invalidatePreview();
              setManualText(next);
              // SYNCHRONOUS lockout: parent must see previewReady=false in
              // the same render cycle so the Run button disables before
              // the 350ms debounce fires. Also propagate the raw parsed
              // tokens so late-arriving RPC responses cannot repopulate
              // the launch payload from a stale value.
              const parsed = parseManualRaw(next);
              onChange({
                ...value,
                source: "manual",
                manualEmails: parsed,
                count: 0,
                previewReady: false,
              }, "user");
            }}
            placeholder="user1@example.com&#10;user2@example.com"
          />
        </div>
      )}
      {value.source === "none" && (
        <p className="text-sm text-muted-foreground" data-testid="recipients-none-hint">
          Получатели не выбраны (0). Черновик можно сохранить сейчас, а базу выбрать или импортировать позже.
        </p>
      )}

      {/* Preview status line — `loading` implies previewReady=false in the parent */}
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
            <div className="text-muted-foreground">
              К отправке: <Badge variant="secondary">{preview.eligible_count}</Badge>
            </div>
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
