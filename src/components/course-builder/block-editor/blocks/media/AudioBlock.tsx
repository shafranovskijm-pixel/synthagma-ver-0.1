import { useState, useEffect } from "react";
import { useBlockAIGenerate } from "@/hooks/useBlockAIGenerate";
import { LazyMediaPreview } from "@/components/course-builder/LazyMediaPreview";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Upload, Headphones, Sparkles, Wand2, Trash2 } from "lucide-react";
import type { ContentBlock } from "../../types";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

export function AudioBlock({ block, onUpdate }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void }) {
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingTts, setIsGeneratingTts] = useState(false);
  const [showTts, setShowTts] = useState(false);
  const [ttsText, setTtsText] = useState("");
  const [ttsVoice, setTtsVoice] = useState("Nec_24000");
  const audioUrl = block.audioUrl || "";

  useEffect(() => {
    if (block.pendingAI === "ai-audio" && !block.audioUrl) {
      setShowTts(true);
      onUpdate({ pendingAI: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.pendingAI]);

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith("audio/") || file.size > 50 * 1024 * 1024) return;
    setIsUploading(true);
    try {
      const fileName = `audio_${crypto.randomUUID()}.${file.name.split('.').pop() || 'mp3'}`;
      const { data: configData } = await (await import("@/integrations/supabase/client")).supabase.functions.invoke('get-external-storage-config');
      const useExternal = configData?.configured && configData?.url && configData?.key;
      const bucket = useExternal ? 'course-videos' : 'course-files';
      const supabaseClient = (await import("@/integrations/supabase/client")).supabase;
      let uploadedViaInternal = false;
      const { error } = await supabaseClient.storage.from(bucket).upload(fileName, file, { upsert: true });
      if (!error) uploadedViaInternal = true;
      const baseUrl = uploadedViaInternal ? import.meta.env.VITE_SUPABASE_URL : configData?.url;
      const publicUrl = `${baseUrl}/storage/v1/object/public/${bucket}/${fileName}`;
      onUpdate({ audioUrl: publicUrl });
    } catch (e) {
      console.error("Audio upload error:", e);
    } finally { setIsUploading(false); }
  };

  const handleGenerateTts = async () => {
    const text = ttsText.trim();
    if (!text) return;
    if (!(await checkAiLimitGlobal())) return;
    setIsGeneratingTts(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.functions.invoke("salutespeech-tts", {
        body: { text, voice: ttsVoice },
      });
      if (error) throw error;
      const audioBase64: string | undefined = data?.audio || data?.audioContent;
      if (!audioBase64) throw new Error("Озвучка не получена");
      const bin = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
      const fileName = `ai-audio/${crypto.randomUUID()}.mp3`;
      const { error: upErr } = await supabase.storage.from("course-files").upload(fileName, bin, { contentType: "audio/mpeg", upsert: true });
      if (upErr) throw upErr;
      const publicUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/course-files/${fileName}`;
      onUpdate({ audioUrl: publicUrl });
      await incrementAiLimitGlobal();
      setShowTts(false);
      const { toast } = await import("sonner");
      toast.success("Аудио сгенерировано");
    } catch (e) {
      console.error("TTS generation error:", e);
      const { toast } = await import("sonner");
      toast.error(e instanceof Error ? e.message : "Ошибка генерации озвучки");
    } finally { setIsGeneratingTts(false); }
  };

  return (
    <div className="py-2">
      {audioUrl ? (
        <div className="space-y-2">
          <LazyMediaPreview type="audio"><audio controls preload="none" src={audioUrl} className="w-full rounded-lg" /></LazyMediaPreview>
          <div className="flex gap-2">
            <Input value={audioUrl} onChange={(e) => onUpdate({ audioUrl: e.target.value })} className="text-xs flex-1" />
            <Button variant="ghost" size="sm" onClick={() => onUpdate({ audioUrl: "" })}><Trash2 className="w-4 h-4" /></Button>
          </div>
        </div>
      ) : (
        <div className="bg-muted rounded-xl p-6 space-y-4">
          <div className="text-center">
            <Headphones className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-2">Добавьте аудио</p>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 justify-center flex-wrap">
              <Button variant="outline" size="sm" onClick={() => document.getElementById(`audio-upload-${block.id}`)?.click()} disabled={isUploading || isGeneratingTts}>
                {isUploading ? <SigmaSpinner size="sm" className="mr-2" /> : <Upload className="w-4 h-4 mr-2" />}Загрузить файл
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowTts(!showTts)} disabled={isUploading || isGeneratingTts} className={showTts ? "border-primary text-primary" : ""}>
                <Sparkles className="w-4 h-4 mr-2" />ИИ озвучка
              </Button>
            </div>
            <input id={`audio-upload-${block.id}`} type="file" accept="audio/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }} />
            {showTts && (
              <div className="space-y-2 p-3 rounded-lg bg-background border border-border">
                <Textarea value={ttsText} onChange={(e) => setTtsText(e.target.value)} placeholder="Введите текст для озвучки..." className="text-sm min-h-[80px]" disabled={isGeneratingTts} />
                <div className="flex gap-2 items-center">
                  <select value={ttsVoice} onChange={(e) => setTtsVoice(e.target.value)} disabled={isGeneratingTts} className="text-xs px-2 py-1.5 rounded-md border border-input bg-background flex-shrink-0">
                    <option value="Nec_24000">Наталья (ж)</option>
                    <option value="Bys_24000">Борис (м)</option>
                    <option value="May_24000">Майя (ж)</option>
                    <option value="Tur_24000">Тарас (м)</option>
                    <option value="Ost_24000">Остап (м)</option>
                    <option value="Pon_24000">Полина (ж)</option>
                  </select>
                  <Button size="sm" onClick={handleGenerateTts} disabled={!ttsText.trim() || isGeneratingTts} className="flex-1">
                    {isGeneratingTts ? <><SigmaSpinner size="sm" className="mr-1" /> Генерация...</> : <><Wand2 className="w-4 h-4 mr-1" /> Озвучить</>}
                  </Button>
                </div>
              </div>
            )}
            <div className="text-center text-xs text-muted-foreground">или</div>
            <Input value={audioUrl} onChange={(e) => onUpdate({ audioUrl: e.target.value })} placeholder="https://example.com/audio.mp3" className="text-sm" />
          </div>
        </div>
      )}
    </div>
  );
}
