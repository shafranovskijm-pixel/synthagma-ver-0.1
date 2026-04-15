import { useState } from "react";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { GitCompareArrows, Play, Clock, Cpu, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";

type ComparisonResult = {
  model: string;
  label: string;
  response: string;
  timeMs: number;
  charCount: number;
  error?: string;
};

const COMPARE_MODELS = [
  { id: "gigachat_max", label: "GigaChat Max", provider: "gigachat", model: "GigaChat-Max" },
  { id: "gigachat_pro", label: "GigaChat Pro", provider: "gigachat", model: "GigaChat-Pro" },
  { id: "gemini_flash", label: "Gemini 2.5 Flash", provider: "lovable_ai", model: "google/gemini-2.5-flash" },
  { id: "gemini_pro", label: "Gemini 2.5 Pro", provider: "lovable_ai", model: "google/gemini-2.5-pro" },
  { id: "gpt5_mini", label: "GPT-5 Mini", provider: "lovable_ai", model: "openai/gpt-5-mini" },
  { id: "gpt5", label: "GPT-5", provider: "lovable_ai", model: "openai/gpt-5" },
];

export function AIComparisonPanel() {
  const [prompt, setPrompt] = useState("Напиши 3 тезиса о важности охраны труда");
  const [selectedModels, setSelectedModels] = useState<string[]>(["gigachat_max", "gemini_flash"]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ComparisonResult[]>([]);

  const toggleModel = (id: string) => {
    setSelectedModels((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  };

  const runComparison = async () => {
    if (!prompt.trim() || selectedModels.length < 2) {
      toast.error("Выберите минимум 2 модели и введите промпт");
      return;
    }

    setLoading(true);
    setResults([]);

    const models = COMPARE_MODELS.filter((m) => selectedModels.includes(m.id));

    const promises = models.map(async (m) => {
      const start = performance.now();
      try {
        const { data, error } = await safeInvoke<any>("gigachat", {
          body: {
            action: "generate_content",
            courseTitle: "A/B Тест",
            lessonTitle: prompt,
            ai_provider: m.provider } });
        const elapsed = Math.round(performance.now() - start);
        if (error) throw error;
        const text = data?.content || data?.raw || "";
        return {
          model: m.model,
          label: m.label,
          response: text,
          timeMs: elapsed,
          charCount: text.length } as ComparisonResult;
      } catch (e: any) {
        return {
          model: m.model,
          label: m.label,
          response: "",
          timeMs: Math.round(performance.now() - start),
          charCount: 0,
          error: e.message } as ComparisonResult;
      }
    });

    const all = await Promise.allSettled(promises);
    setResults(
      all.map((r) =>
        r.status === "fulfilled"
          ? r.value
          : { model: "?", label: "?", response: "", timeMs: 0, charCount: 0, error: "Неизвестная ошибка" }
      )
    );
    setLoading(false);
  };

  const fastest = results.length > 1
    ? results.reduce((a, b) => (!a.error && a.timeMs < (b.error ? Infinity : b.timeMs) ? a : b)).label
    : null;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Промпт для сравнения</Label>
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Введите промпт..."
            onKeyDown={(e) => e.key === "Enter" && !loading && runComparison()}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Модели (2–4)</Label>
          <div className="flex flex-wrap gap-3">
            {COMPARE_MODELS.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={selectedModels.includes(m.id)}
                  onCheckedChange={() => toggleModel(m.id)}
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>

        <Button onClick={runComparison} disabled={loading || selectedModels.length < 2} className="gap-2">
          {loading ? <SigmaSpinner size="sm" /> : <Play className="w-4 h-4" />}
          {loading ? "Сравнение..." : "Сравнить"}
        </Button>
      </div>

      {results.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {results.map((r, i) => (
            <Card
              key={i}
              className={`border ${
                fastest === r.label && !r.error ? "border-primary/50 bg-primary/5" : "border-border/50"
              }`}
            >
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{r.label}</span>
                  {fastest === r.label && !r.error && (
                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                      🏆 быстрее
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {(r.timeMs / 1000).toFixed(1)}с
                  </span>
                  <span className="flex items-center gap-1">
                    <Hash className="w-3 h-3" />
                    {r.charCount} симв
                  </span>
                </div>

                {r.error ? (
                  <div className="text-sm text-destructive bg-destructive/10 rounded p-2">{r.error}</div>
                ) : (
                  <div className="text-sm bg-background rounded p-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                    {r.response.slice(0, 800)}
                    {r.response.length > 800 && "..."}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
