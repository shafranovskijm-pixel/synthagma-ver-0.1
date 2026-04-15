import { useState } from "react";
import { safeInvoke, safeFetch } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { Play, Clock, Cpu, ImageIcon, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

type TestResult = {
  response: string;
  timeMs: number;
  model: string;
  imageUrl?: string;
  audioUrl?: string;
};

interface AITestSandboxProps {
  context: string;
  provider: string;
  gigachatModel: string;
  lovableModel: string;
}

const DEFAULT_PROMPTS: Record<string, string> = {
  course_generation: "Напиши краткое описание курса по охране труда",
  tts: "Добро пожаловать на курс повышения квалификации",
  consultant: "Что такое охрана труда?",
  marketplace: "Напиши SEO-описание для курса по пожарной безопасности",
  pipeline: "Создай 1 тестовый вопрос по электробезопасности",
  org_default: "Объясни кратко что такое ДПО",
  image_generation: "Иллюстрация для курса по охране труда: рабочий в каске на стройке" };

export function AITestSandbox({ context, provider, gigachatModel, lovableModel }: AITestSandboxProps) {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPTS[context] || "Тестовый запрос");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [expanded, setExpanded] = useState(false);

  const runTest = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setResult(null);
    const start = performance.now();

    try {
      if (context === "image_generation") {
        const { data, error } = await safeInvoke<any>("generate-image", {
          body: { prompt, provider, model: provider === "gigachat" ? gigachatModel : lovableModel } });
        const elapsed = Math.round(performance.now() - start);
        if (error) throw error;
        setResult({
          response: "Изображение сгенерировано",
          timeMs: elapsed,
          model: provider === "gigachat" ? "GigaChat" : (lovableModel || "google/gemini-2.5-flash-image"),
          imageUrl: data?.url });
      } else if (context === "tts") {
        const response = await safeFetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
            body: JSON.stringify({ text: prompt, voiceId: "onwK4e9ZLuTAKqWW03F9" }) }
        );
        const elapsed = Math.round(performance.now() - start);
        if (!response.ok) throw new Error(`TTS error: ${response.status}`);
        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        setResult({
          response: `Аудио сгенерировано (${(blob.size / 1024).toFixed(1)} КБ)`,
          timeMs: elapsed,
          model: provider === "elevenlabs" ? "ElevenLabs" : "Lovable AI TTS",
          audioUrl });
      } else {
        // Text-based AI test via gigachat function
        const aiProvider = provider === "lovable_ai" ? "lovable_ai" : "gigachat";
        const { data, error } = await safeInvoke<any>("gigachat", {
          body: {
            action: "generate_content",
            courseTitle: "Тест ИИ",
            lessonTitle: prompt,
            ai_provider: aiProvider } });
        const elapsed = Math.round(performance.now() - start);
        if (error) throw error;
        setResult({
          response: data?.content || data?.raw || "Нет ответа",
          timeMs: elapsed,
          model: data?.model || (aiProvider === "lovable_ai" ? lovableModel : gigachatModel) });
      }
    } catch (e: any) {
      const elapsed = Math.round(performance.now() - start);
      setResult({ response: `Ошибка: ${e.message}`, timeMs: elapsed, model: "—" });
      toast.error("Ошибка теста: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-border/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 mb-3"
      >
        <Play className="w-3.5 h-3.5" />
        {expanded ? "Скрыть тест" : "Тестировать"}
      </button>

      {expanded && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Введите промпт для теста..."
              className="text-sm"
              onKeyDown={(e) => e.key === "Enter" && !loading && runTest()}
            />
            <Button size="sm" onClick={runTest} disabled={loading} className="shrink-0 gap-1.5">
              {loading ? <SigmaSpinner size="xs" className=".5 .5" /> : <Play className="w-3.5 h-3.5" />}
              {loading ? "..." : "▶"}
            </Button>
          </div>

          {result && (
            <Card className="bg-muted/30 border-border/50">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {(result.timeMs / 1000).toFixed(1)} сек
                  </span>
                  <span className="flex items-center gap-1">
                    <Cpu className="w-3 h-3" />
                    {result.model}
                  </span>
                </div>

                {result.imageUrl && (
                  <div className="mt-2">
                    <img
                      src={result.imageUrl}
                      alt="Generated"
                      className="rounded-lg max-h-48 object-contain border border-border"
                    />
                  </div>
                )}

                {result.audioUrl && (
                  <div className="mt-2 flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-muted-foreground" />
                    <audio controls src={result.audioUrl} className="h-8 w-full" />
                  </div>
                )}

                {!result.imageUrl && !result.audioUrl && (
                  <div className="text-sm bg-background rounded p-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
                    {result.response.slice(0, 1000)}
                    {result.response.length > 1000 && "..."}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
