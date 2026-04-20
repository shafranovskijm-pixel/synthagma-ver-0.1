import { useState, useEffect } from "react";
import { checkAiLimitGlobal, incrementAiLimitGlobal } from "@/hooks/useAiGenerationLimit";
import { safeInvoke } from "@/utils/safeInvoke";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, Upload, Sparkles, Wand2 } from "lucide-react";
import type { ContentBlock } from "../../types";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

export function ImageBlock({ block, onUpdate }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void }) {
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isGeneratingAlt, setIsGeneratingAlt] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [showAiInput, setShowAiInput] = useState(false);
  const [showEditInput, setShowEditInput] = useState(false);

  const handleGenerateAlt = async () => {
    if (!block.imageSrc) return;
    setIsGeneratingAlt(true);
    try {
      const { data, error } = await safeInvoke<any>("generate-image-alt", { body: { imageUrl: block.imageSrc } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const alt = (data?.alt || "").trim();
      if (!alt) throw new Error("Описание не получено");
      onUpdate({ imageAlt: alt });
      const { toast } = await import("sonner");
      toast.success("Описание сгенерировано");
    } catch (err) {
      const { toast } = await import("sonner");
      const msg = err instanceof Error ? err.message : "Ошибка генерации описания";
      toast.error(msg);
    } finally {
      setIsGeneratingAlt(false);
    }
  };

  useEffect(() => {
    if (block.pendingAI === "ai-image" && !block.imageSrc) {
      setShowAiInput(true);
      onUpdate({ pendingAI: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.pendingAI]);

  const handleFileUpload = async (file: File) => {
    const { toast } = await import("sonner");
    if (!file.type.startsWith("image/")) {
      toast.error("Это не изображение", { description: "Поддерживаются JPG, PNG, GIF, WebP" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      const sizeMb = (file.size / 1024 / 1024).toFixed(1);
      toast.error(`Файл слишком большой (${sizeMb} МБ)`, { description: "Максимум 10 МБ. Сожмите изображение или используйте онлайн-конвертер." });
      return;
    }
    setIsUploading(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const fileExt = file.name.split(".").pop()?.toLowerCase() || "png";
      const fileName = `block-images/${block.id}-${Date.now()}.${fileExt}`;
      let externalConfig: { configured: boolean; url: string | null; key: string | null } | null = null;
      try { const { data } = await supabase.functions.invoke('get-external-storage-config'); externalConfig = data; } catch {}
      const useExternal = externalConfig?.configured && externalConfig?.url && externalConfig?.key;
      const bucket = 'course-files';
      const baseUrl = useExternal ? externalConfig!.url : import.meta.env.VITE_SUPABASE_URL;
      const apiKey = useExternal ? externalConfig!.key : import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      let authToken = apiKey;
      if (!useExternal) {
        const { data: session } = await supabase.auth.getSession();
        authToken = session?.session?.access_token || apiKey;
      }
      let uploadedViaInternal = false;
      const { error } = await supabase.storage.from(bucket).upload(fileName, file, { cacheControl: '3600', upsert: true });
      if (error) {
        const uploadUrl = `${baseUrl}/storage/v1/object/${bucket}/${fileName}`;
        const resp = await fetch(uploadUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${authToken}`, 'apikey': apiKey!, 'x-upsert': 'true' }, body: file });
        if (!resp.ok) throw new Error('Upload failed');
      } else { uploadedViaInternal = true; }
      const actualBaseUrl = uploadedViaInternal ? import.meta.env.VITE_SUPABASE_URL : baseUrl;
      const publicUrl = `${actualBaseUrl}/storage/v1/object/public/${bucket}/${fileName}`;
      onUpdate({ imageSrc: publicUrl, imageAlt: block.imageAlt || file.name.replace(/\.[^.]+$/, '') });
    } catch (err) {
      console.error("Image upload error:", err);
    } finally { setIsUploading(false); }
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    if (!(await checkAiLimitGlobal())) return;
    setIsGenerating(true);
    try {
      let url: string | null = null;
      let lastError: string | null = null;
      try {
        const { data, error } = await safeInvoke<any>("generate-block-image", { body: { prompt: aiPrompt.trim() } });
        if (!error && data?.url) url = data.url;
        else lastError = error?.message || data?.error || null;
      } catch (e) { lastError = e instanceof Error ? e.message : null; }
      if (!url) {
        const { data, error } = await safeInvoke<any>("generate-image", { body: { prompt: aiPrompt.trim(), provider: "gigachat", slotIndex: Date.now() } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!data?.url) throw new Error(lastError || "Изображение не было сгенерировано");
        url = data.url;
      }
      onUpdate({ imageSrc: url, imageAlt: aiPrompt.trim() });
      await incrementAiLimitGlobal();
      setAiPrompt(""); setShowAiInput(false);
    } catch (err) {
      console.error("AI image generation error:", err);
      const { toast } = await import("sonner");
      const message = err instanceof Error ? err.message : "Ошибка генерации изображения";
      if (message.includes("429")) toast.error("ИИ перегружен, повторите через 10–20 секунд");
      else if (message.includes("402")) toast.error("Лимит генерации исчерпан, повторите позже");
      else toast.error(message);
    } finally { setIsGenerating(false); }
  };

  const handleAiEdit = async () => {
    if (!editPrompt.trim() || !block.imageSrc) return;
    setIsEditing(true);
    try {
      const { data, error } = await safeInvoke<any>("generate-image", { body: { prompt: editPrompt.trim(), imageUrl: block.imageSrc, provider: "gigachat", slotIndex: Date.now() } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error("Изображение не было отредактировано");
      onUpdate({ imageSrc: data.url });
      setEditPrompt(""); setShowEditInput(false);
      const { toast } = await import("sonner");
      toast.success("Изображение отредактировано");
    } catch (err) {
      console.error("AI image edit error:", err);
      const { toast } = await import("sonner");
      const message = err instanceof Error ? err.message : "Ошибка редактирования изображения";
      if (message.includes("429")) toast.error("GigaChat перегружен, повторите попытку через 10–20 секунд");
      else if (message.includes("402")) toast.error("Лимит генерации исчерпан, повторите попытку позже");
      else toast.error(message);
    } finally { setIsEditing(false); }
  };

  return (
    <div className="py-2">
      {block.imageSrc ? (
        <div className="space-y-2">
          <div className="relative group/img">
            <img src={block.imageSrc} alt={block.imageAlt || ""} className="rounded-lg max-w-full h-auto max-h-[400px] object-contain" />
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
              <Button variant="secondary" size="sm" onClick={() => setShowEditInput(!showEditInput)} className={showEditInput ? "border-primary" : ""} disabled={isEditing}>
                <Wand2 className="w-3.5 h-3.5 mr-1" />Редактировать ИИ
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onUpdate({ imageSrc: "", imageAlt: "" })}>Удалить</Button>
            </div>
          </div>
          {showEditInput && (
            <div className="flex gap-2">
              <Input value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} placeholder="Опишите что исправить..." className="text-sm flex-1" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiEdit(); } }} disabled={isEditing} />
              <Button size="sm" disabled={!editPrompt.trim() || isEditing} onClick={handleAiEdit}>
                {isEditing ? <SigmaSpinner size="sm" /> : <Wand2 className="w-4 h-4" />}
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            <Input value={block.imageAlt || ""} onChange={(e) => onUpdate({ imageAlt: e.target.value })} placeholder="Подпись к изображению (alt) — важно для SEO и доступности" className="text-sm border-0 bg-secondary/30 focus-visible:ring-1 rounded-lg flex-1" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={handleGenerateAlt}
              disabled={isGeneratingAlt}
              title="Сгенерировать описание ИИ"
            >
              {isGeneratingAlt ? <SigmaSpinner size="sm" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isGeneratingAlt ? "..." : "ИИ"}</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-muted rounded-xl p-6 space-y-4">
          <div className="text-center">
            <ImageIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-3">Загрузите изображение или вставьте ссылку</p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="sm" disabled={isUploading || isGenerating} onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFileUpload(f); }; input.click(); }}>
                {isUploading ? <SigmaSpinner size="sm" className="mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
                {isUploading ? "Загрузка..." : "Загрузить файл"}
              </Button>
              <Button variant="outline" size="sm" disabled={isUploading || isGenerating} onClick={() => setShowAiInput(!showAiInput)} className={showAiInput ? "border-primary text-primary" : ""}>
                <Sparkles className="w-4 h-4 mr-1" />ИИ генерация
              </Button>
            </div>
          </div>
          {showAiInput && (
            <div className="space-y-2">
              <Input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Опишите изображение..." className="text-sm" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiGenerate(); } }} disabled={isGenerating} />
              <Button size="sm" disabled={!aiPrompt.trim() || isGenerating} onClick={handleAiGenerate} className="w-full">
                {isGenerating ? <><SigmaSpinner size="sm" className="mr-1" /> Генерация...</> : <><Wand2 className="w-4 h-4 mr-1" /> Сгенерировать</>}
              </Button>
            </div>
          )}
          <Input value={block.imageSrc || ""} onChange={(e) => onUpdate({ imageSrc: e.target.value })} placeholder="https://example.com/image.jpg" className="text-sm" />
        </div>
      )}
    </div>
  );
}
