import { useRef, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { toast } from "sonner";
// xlsx is dynamically imported inside the file handler to keep it out of the main bundle

export type RecipientSource = "students" | "companies" | "organizations" | "companies_db" | "manual";

export interface RecipientPickerValue {
  source: RecipientSource;
  manualEmails: string[];
  count: number;
}

interface Props {
  scope: "platform" | "org";
  organizationId: string | null;
  value: RecipientPickerValue;
  onChange: (v: RecipientPickerValue) => void;
}

export function RecipientPicker({ scope, organizationId, value, onChange }: Props) {
  const [manualText, setManualText] = useState(value.manualEmails.join("\n"));
  const [autoCount, setAutoCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Recompute auto count
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (value.source === "manual") { setAutoCount(null); return; }
      try {
        if (scope === "platform") {
          if (value.source === "organizations") {
            const { count } = await supabase.from("organizations").select("id", { count: "exact", head: true }).not("email", "is", null);
            if (!cancelled) setAutoCount(count ?? 0);
          } else if (value.source === "companies_db") {
            // sales_companies_db may not exist yet — fall back to 0
            const { count, error } = await supabase
              .from("sales_companies_db" as any)
              .select("id", { count: "exact", head: true })
              .not("email", "is", null);
            if (!cancelled) setAutoCount(error ? 0 : (count ?? 0));
          }
        } else if (organizationId) {
          if (value.source === "students") {
            const { count } = await supabase
              .from("profiles")
              .select("user_id", { count: "exact", head: true })
              .eq("organization_id", organizationId)
              .not("email", "is", null);
            if (!cancelled) setAutoCount(count ?? 0);
          } else if (value.source === "companies") {
            const { count } = await supabase
              .from("companies")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", organizationId)
              .not("email", "is", null);
            if (!cancelled) setAutoCount(count ?? 0);
          }
        }
      } catch {
        if (!cancelled) setAutoCount(0);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [value.source, scope, organizationId]);

  // Propagate count
  useEffect(() => {
    const c = value.source === "manual" ? value.manualEmails.length : (autoCount ?? 0);
    if (c !== value.count) onChange({ ...value, count: c });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCount, value.source, value.manualEmails.length]);

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
        .filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
    ));
  };

  const handleFileImport = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("Файл пустой");
      // массив массивов, без шапки — будем искать email-подобные строки в любой колонке
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
      // объединяем с уже введёнными
      const existing = parseManual(manualText);
      const merged = Array.from(new Set([...existing, ...unique]));
      setManualText(merged.join("\n"));
      onChange({ ...value, manualEmails: merged, count: merged.length });
      toast.success(`Импортировано ${unique.length} адресов (всего ${merged.length})`);
    } catch (e: any) {
      toast.error("Ошибка импорта: " + (e?.message || "не удалось прочитать файл"));
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label>Источник получателей</Label>
        <Select
          value={value.source}
          onValueChange={(v) => onChange({ ...value, source: v as RecipientSource })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {sources.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {value.source === "manual" ? (
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
              setManualText(e.target.value);
              const emails = parseManual(e.target.value);
              onChange({ ...value, manualEmails: emails, count: emails.length });
            }}
            placeholder="user1@example.com&#10;user2@example.com"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Распознано валидных адресов: <Badge variant="secondary">{value.manualEmails.length}</Badge>
            {" · "}Поддерживаются файлы CSV, XLS, XLSX (email ищется в любой колонке)
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Будет отправлено получателям: <Badge variant="secondary">{autoCount ?? "..."}</Badge>
        </p>
      )}
    </div>
  );
}
