import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Sparkles, Wand2, ArrowRight, ArrowLeft, Check, X } from "lucide-react";
import { CONTRACT_PLACEHOLDERS } from "@/components/organization/contract-template/contractTemplateHelpers";
import {
  importWordAsHtml,
  detectSlots,
  applyMappings,
  type TemplateSlot,
  type SlotMapping,
} from "@/lib/contractTemplateImport";

interface Props {
  organizationId: string;
  open: boolean;
  onClose: () => void;
  onCreated?: (templateId: string) => void;
}

type Step = "upload" | "quiz" | "review";

const CATALOG = CONTRACT_PLACEHOLDERS.map(p => ({ key: p.key.replace(/[{}]/g, ""), label: p.label }));
const SKIP = "__skip__";

export function UploadTemplateDialog({ organizationId, open, onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [name, setName] = useState("");
  const [html, setHtml] = useState("");
  const [slots, setSlots] = useState<TemplateSlot[]>([]);
  const [mappings, setMappings] = useState<Record<string, SlotMapping>>({});
  const [importing, setImporting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStep("upload"); setName(""); setHtml(""); setSlots([]); setMappings({});
    }
  }, [open]);

  const handleFile = async (file: File) => {
    setImporting(true);
    try {
      if (!name) setName(file.name.replace(/\.docx?$/i, ""));
      const { html: h, warnings } = await importWordAsHtml(file);
      if (warnings.length) console.warn("mammoth warnings:", warnings);
      const s = detectSlots(h);
      setHtml(h);
      setSlots(s);
      // Prefill mappings from local hints
      const init: Record<string, SlotMapping> = {};
      for (const slot of s) {
        init[slot.id] = slot.hint
          ? { action: "map", key: slot.hint }
          : { action: "skip" };
      }
      setMappings(init);
      setStep("quiz");
      // Fire AI suggestion in background
      if (s.length > 0) suggestWithAI(s);
    } catch (e: any) {
      toast.error("Не удалось прочитать файл", { description: e?.message });
    } finally {
      setImporting(false);
    }
  };

  const suggestWithAI = async (currentSlots: TemplateSlot[]) => {
    setSuggesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-template-variables", {
        body: {
          slots: currentSlots.map(s => ({ id: s.id, context: s.context, hint: s.hint })),
          catalog: CATALOG,
        },
      });
      if (error) throw error;
      const suggestions: Array<{ id: string; suggested_key: string | null; confidence: number }> =
        data?.suggestions || [];
      setMappings(prev => {
        const next = { ...prev };
        for (const sug of suggestions) {
          if (sug.suggested_key && sug.confidence >= 0.5) {
            next[sug.id] = { action: "map", key: sug.suggested_key };
          }
        }
        return next;
      });
    } catch (e: any) {
      console.warn("AI suggestion failed:", e?.message);
    } finally {
      setSuggesting(false);
    }
  };

  const setSlotKey = (slotId: string, value: string) => {
    setMappings(prev => ({
      ...prev,
      [slotId]: value === SKIP ? { action: "skip" } : { action: "map", key: value },
    }));
  };

  const mappedCount = useMemo(
    () => Object.values(mappings).filter(m => m.action === "map" && m.key).length,
    [mappings],
  );

  const finalHtml = useMemo(
    () => (step === "review" ? applyMappings(html, slots, mappings) : ""),
    [step, html, slots, mappings],
  );

  const save = async () => {
    if (!name.trim()) { toast.error("Укажите название шаблона"); return; }
    setSaving(true);
    try {
      const bodyHtml = applyMappings(html, slots, mappings);
      const usedKeys = Array.from(new Set(
        Object.values(mappings).filter(m => m.action === "map" && m.key).map(m => m.key!),
      ));
      const { data, error } = await (supabase as any)
        .from("org_contract_templates")
        .insert({
          organization_id: organizationId,
          name: name.trim(),
          body_html: bodyHtml,
          variables: { detected: usedKeys, imported_at: new Date().toISOString() },
          is_default: false,
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Шаблон сохранён", { description: `Переменных: ${usedKeys.length}` });
      onCreated?.(data.id);
      onClose();
    } catch (e: any) {
      toast.error("Не удалось сохранить шаблон", { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-4xl h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            Загрузить шаблон договора
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Загрузите .docx файл — система сама найдёт места для переменных."}
            {step === "quiz" && "Проверьте, как система распознала «дыры» в шаблоне. AI подсказал ключи автоматически, при необходимости поправьте."}
            {step === "review" && "Финальный HTML со вставленными переменными. Убедитесь, что всё выглядит верно."}
          </DialogDescription>
        </DialogHeader>

        {/* Steps indicator */}
        <div className="px-6 flex items-center gap-2 text-xs">
          {(["upload", "quiz", "review"] as Step[]).map((s, i) => (
            <div key={s} className={`flex items-center gap-2 px-2.5 py-1 rounded-full ${step === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              <span className="font-semibold">{i + 1}</span>
              <span>{s === "upload" ? "Файл" : s === "quiz" ? "Переменные" : "Проверка"}</span>
            </div>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-hidden px-6 pt-4 flex flex-col">
          {step === "upload" && (
            <div className="space-y-4 overflow-y-auto">
              <div className="space-y-1.5">
                <Label>Название шаблона</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Например: Договор с юр. лицом (ГОРЭЛТЕХ)" />
              </div>
              <div
                className="border-2 border-dashed border-border rounded-2xl p-10 text-center hover:border-primary/50 transition cursor-pointer"
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
              >
                <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <div className="font-medium">Перетащите .docx файл сюда</div>
                <div className="text-xs text-muted-foreground mt-1">или нажмите, чтобы выбрать</div>
                <input
                  ref={fileRef} type="file" accept=".docx" hidden
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>
              {importing && <div className="text-sm text-muted-foreground text-center">Импорт файла…</div>}
              <div className="text-xs text-muted-foreground bg-muted/40 rounded-xl p-3">
                <b>Совет:</b> если у вас файл в формате <code>.doc</code>, откройте его в Word и сохраните как <code>.docx</code>. В шаблоне отметьте места для подстановки одним из способов:
                несколько подчёркиваний <code>_______</code>, квадратные скобки <code>[ФИО]</code> или пустые кавычки <code>«  »</code>.
              </div>
            </div>
          )}

          {step === "quiz" && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-between mb-2 shrink-0">
                <div className="text-sm">
                  Найдено слотов: <b>{slots.length}</b>, сопоставлено: <b>{mappedCount}</b>
                </div>
                <div className="flex items-center gap-2">
                  {suggesting && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <Sparkles className="w-3 h-3 animate-pulse" /> AI подбирает…
                    </Badge>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => suggestWithAI(slots)} disabled={suggesting}>
                    <Sparkles className="w-3.5 h-3.5 mr-1" /> Повторить AI
                  </Button>
                </div>
              </div>
              <div className="flex-1 min-h-0 border border-border rounded-xl overflow-y-auto">
                <div className="divide-y divide-border">
                  {slots.length === 0 && (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      Слотов не найдено. Возможно, в шаблоне уже стоят переменные <code>{`{{...}}`}</code>, или заглушки записаны в нестандартном виде.
                    </div>
                  )}
                  {slots.map((s, idx) => {
                    const m = mappings[s.id];
                    const value = m?.action === "map" && m.key ? m.key : SKIP;
                    const mapped = value !== SKIP;
                    return (
                      <div key={s.id} className="p-3 flex items-start gap-3">
                        <div className="mt-1">
                          {mapped
                            ? <Check className="w-4 h-4 text-primary" />
                            : <X className="w-4 h-4 text-muted-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-muted-foreground mb-1">#{idx + 1} · Контекст</div>
                          <div className="text-sm bg-muted/30 rounded-lg p-2 mb-2 font-mono whitespace-pre-wrap break-words">
                            {s.context}
                          </div>
                          <Select value={value} onValueChange={v => setSlotKey(s.id, v)}>
                            <SelectTrigger className="h-9 text-sm">
                              <SelectValue placeholder="Выберите переменную" />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                              <SelectItem value={SKIP}>— Пропустить (оставить как есть) —</SelectItem>
                              {CATALOG.map(c => (
                                <SelectItem key={c.key} value={c.key}>
                                  <span className="font-mono text-xs mr-2">{`{{${c.key}}}`}</span>
                                  <span className="text-muted-foreground text-xs">{c.label}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="flex-1 min-h-0 border border-border rounded-xl overflow-y-auto bg-white">
              <div className="p-4 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: finalHtml }} />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 p-6 pt-4 border-t border-border">
          {step !== "upload" && (
            <Button variant="ghost" onClick={() => setStep(step === "review" ? "quiz" : "upload")} disabled={saving}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Назад
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={saving}>Отмена</Button>
          {step === "quiz" && (
            <Button onClick={() => setStep("review")} disabled={slots.length === 0}>
              Далее <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          )}
          {step === "review" && (
            <Button onClick={save} disabled={saving}>
              {saving ? "Сохранение…" : "Сохранить шаблон"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
