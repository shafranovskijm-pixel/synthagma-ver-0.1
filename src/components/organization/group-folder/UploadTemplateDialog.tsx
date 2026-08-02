import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [counterpartyType, setCounterpartyType] = useState<"individual" | "legal" | "any">("any");
  const [html, setHtml] = useState("");
  const [slots, setSlots] = useState<TemplateSlot[]>([]);
  const [mappings, setMappings] = useState<Record<string, SlotMapping>>({});
  const [importing, setImporting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [quizFilter, setQuizFilter] = useState<"all" | "mapped" | "unmapped">("all");
  const [quizView, setQuizView] = useState<"list" | "highlight">("list");

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

  // Highlighted source: подсвечивает все обнаруженные слоты прямо в оригинальном HTML
  const highlightedHtml = useMemo(() => {
    if (step !== "quiz" || quizView !== "highlight" || !html) return "";
    const ordered = [...slots].sort((a, b) => b.start - a.start);
    let out = html;
    for (const s of ordered) {
      const m = mappings[s.id];
      const mapped = m?.action === "map" && !!m.key;
      const color = mapped
        ? "background:#d1fae5;color:#065f46;border:1px solid #10b981;"
        : "background:#fef3c7;color:#92400e;border:1px solid #f59e0b;";
      const label = mapped ? `{{${m!.key}}}` : "?";
      const orig = out.slice(s.start, s.start + s.token.length)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const wrap = `<mark data-slot="${s.id}" title="${label}" style="${color}padding:1px 4px;border-radius:4px;font-family:ui-monospace,monospace;font-size:0.85em;">${orig}<sup style="margin-left:4px;opacity:0.7;">${label}</sup></mark>`;
      out = out.slice(0, s.start) + wrap + out.slice(s.start + s.token.length);
    }
    return out;
  }, [step, quizView, html, slots, mappings]);

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
          counterparty_type: counterpartyType,
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
                <div className="pt-2 space-y-1.5">
                  <Label>Для какого сценария договора</Label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      { v: "individual", t: "Физлицо" },
                      { v: "legal", t: "Компания" },
                      { v: "any", t: "Универсальный" },
                    ] as const).map(o => (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() => setCounterpartyType(o.v)}
                        className={`text-xs py-2 rounded-xl border transition ${counterpartyType === o.v ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
                      >
                        {o.t}
                      </button>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Шаблон будет предлагаться только в выбранном сценарии генерации договора.
                  </div>
                </div>
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
              <div className="flex items-center justify-between mb-2 shrink-0 flex-wrap gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <span>Найдено слотов: <b>{slots.length}</b></span>
                  <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200">
                    <Check className="w-3 h-3 mr-1" /> {mappedCount} сопоставлено
                  </Badge>
                  {slots.length - mappedCount > 0 && (
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">
                      {slots.length - mappedCount} без переменной
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <div className="flex items-center rounded-md border border-border overflow-hidden mr-2">
                    <Button size="sm" variant={quizView === "list" ? "secondary" : "ghost"} className="rounded-none h-8" onClick={() => setQuizView("list")}>Список</Button>
                    <Button size="sm" variant={quizView === "highlight" ? "secondary" : "ghost"} className="rounded-none h-8" onClick={() => setQuizView("highlight")}>В документе</Button>
                  </div>
                  <Button size="sm" variant={quizFilter === "all" ? "secondary" : "ghost"} onClick={() => setQuizFilter("all")}>Все</Button>
                  <Button size="sm" variant={quizFilter === "mapped" ? "secondary" : "ghost"} onClick={() => setQuizFilter("mapped")}>Готовые</Button>
                  <Button size="sm" variant={quizFilter === "unmapped" ? "secondary" : "ghost"} onClick={() => setQuizFilter("unmapped")}>Без переменной</Button>
                  {suggesting && (
                    <Badge variant="secondary" className="gap-1 text-xs ml-2">
                      <Sparkles className="w-3 h-3 animate-pulse" /> AI подбирает…
                    </Badge>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => suggestWithAI(slots)} disabled={suggesting}>
                    <Sparkles className="w-3.5 h-3.5 mr-1" /> Повторить AI
                  </Button>
                </div>
              </div>
              {quizView === "highlight" ? (
                <div className="flex-1 min-h-0 border border-border rounded-xl overflow-y-auto bg-white">
                  <div className="p-4 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
                </div>
              ) : (
              <div className="flex-1 min-h-0 border border-border rounded-xl overflow-y-auto bg-muted/20">

                <div className="p-3 space-y-2">
                  {slots.length === 0 && (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      Слотов не найдено. Возможно, в шаблоне уже стоят переменные <code>{`{{...}}`}</code>, или заглушки записаны в нестандартном виде.
                    </div>
                  )}
                  {slots.map((s, idx) => {
                    const m = mappings[s.id];
                    const value = m?.action === "map" && m.key ? m.key : SKIP;
                    const mapped = value !== SKIP;
                    if (quizFilter === "mapped" && !mapped) return null;
                    if (quizFilter === "unmapped" && mapped) return null;
                    const label = mapped ? CATALOG.find(c => c.key === value)?.label : null;
                    const parts = s.context.split(/⟦(.+?)⟧/);
                    return (
                      <div
                        key={s.id}
                        className={`rounded-xl border p-3 transition-colors ${
                          mapped
                            ? "bg-emerald-50/60 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900"
                            : "bg-amber-50/60 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900"
                        }`}
                      >
                        <div className="flex items-center gap-2 text-xs mb-2 flex-wrap">
                          <span className="font-semibold text-muted-foreground">#{idx + 1}</span>
                          {mapped ? (
                            <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white gap-1">
                              <Check className="w-3 h-3" /> Сопоставлено
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-500 hover:bg-amber-500 text-white gap-1">
                              <X className="w-3 h-3" /> Не выбрано
                            </Badge>
                          )}
                          {mapped && (
                            <span className="font-mono text-xs px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                              {`{{${value}}}`}
                            </span>
                          )}
                          {label && <span className="text-muted-foreground">{label}</span>}
                        </div>
                        <div className="text-sm bg-background/70 rounded-lg p-2 mb-2 whitespace-pre-wrap break-words leading-relaxed">
                          {parts.map((p, i) =>
                            i % 2 === 1 ? (
                              <span
                                key={i}
                                className="mx-1 px-1.5 py-0.5 rounded font-mono text-xs bg-yellow-200 text-yellow-900 border border-yellow-300"
                              >
                                {p}
                              </span>
                            ) : (
                              <span key={i} className="text-muted-foreground">{p}</span>
                            ),
                          )}
                        </div>
                        <Select value={value} onValueChange={v => setSlotKey(s.id, v)}>
                          <SelectTrigger className={`h-9 text-sm bg-white dark:bg-background ${mapped ? "border-emerald-300" : "border-amber-300"}`}>
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
                    );
                  })}
                </div>
              </div>
              )}
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
