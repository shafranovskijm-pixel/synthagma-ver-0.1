import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  GripVertical, Trash2, Headphones, Volume2, MoreHorizontal, ArrowUp, ArrowDown, Search, Copy } from "lucide-react";
import { SALUTE_VOICES } from "@/components/student/TTSSettingsDialog";
import type { BlockType, ContentBlock, StylePreset, AIShortcutType } from "../types";
import { BlockContent } from "./BlockContent";
import { InlineAddBlockButton } from "./AddBlockButton";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface SortableBlockItemProps {
  block: ContentBlock;
  isFocused: boolean;
  onFocus: () => void;
  onUpdate: (updates: Partial<ContentBlock>) => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  onAddAfter: (type: BlockType, pendingAI?: AIShortcutType) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  courseTitle?: string;
  lessonTitle?: string;
  organizationId?: string;
  courseId?: string;
  lessonId?: string;
  existingContent?: string;
  presets: { name: string; style: StylePreset }[];
  onPresetsChange: (presets: { name: string; style: StylePreset }[]) => void;
}

export function SortableBlockItem({ block, isFocused, onFocus, onUpdate, onDelete, onDuplicate, onAddAfter, onMoveUp, onMoveDown, courseTitle, lessonTitle, organizationId, courseId, lessonId, existingContent, presets, onPresetsChange }: SortableBlockItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 1000 : 'auto' as any };

  const [ttsVoiceDialogOpen, setTtsVoiceDialogOpen] = useState(false);
  const [ttsVoice, setTtsVoice] = useState(() => localStorage.getItem('block-editor-tts-voice') || 'Natalya_24000');
  const [ttsGenerating, setTtsGenerating] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [actionsQuery, setActionsQuery] = useState("");

  const baseActions = [
    { key: 'up', label: 'Вверх', icon: ArrowUp, onClick: () => onMoveUp?.(), disabled: !onMoveUp },
    { key: 'down', label: 'Вниз', icon: ArrowDown, onClick: () => onMoveDown?.(), disabled: !onMoveDown },
    { key: 'duplicate', label: 'Дублировать', icon: Copy, onClick: () => onDuplicate?.(), disabled: !onDuplicate },
    { key: 'delete', label: 'Удалить', icon: Trash2, onClick: () => onDelete(), disabled: false, danger: true },
  ];
  const filteredActions = baseActions.filter(a => a.label.toLowerCase().includes(actionsQuery.toLowerCase()));

  const handleTtsGenerate = async () => {
    const plainText = (block.content || "").replace(/<[^>]+>/g, "").trim();
    if (!plainText) { const { toast } = await import("sonner"); toast.error("Нет текста для озвучивания"); return; }
    setTtsGenerating(true);
    localStorage.setItem('block-editor-tts-voice', ttsVoice);
    const { toast } = await import("sonner");
    toast.info("Генерация аудио из текста... Длинные тексты могут занять до 2 минут.");
    try {
      const ttsController = new AbortController();
      const ttsTimeout = setTimeout(() => ttsController.abort(), 180000);
      const voiceName = ttsVoice.replace(/_\d+$/, '').toLowerCase();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/salutespeech-tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ text: plainText, voice: voiceName }),
        signal: ttsController.signal });
      clearTimeout(ttsTimeout);
      if (!response.ok) { const errData = await response.json().catch(() => null); throw new Error(errData?.error || `Ошибка: ${response.status}`); }
      const audioBlob = await response.blob();
      const { supabase } = await import("@/integrations/supabase/client");
      const fileName = `tts_${crypto.randomUUID()}.mp3`;
      const { error } = await supabase.storage.from("course-files").upload(fileName, audioBlob, { contentType: "audio/mpeg", upsert: true });
      if (error) throw error;
      const audioUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/course-files/${fileName}`;
      onUpdate({ type: "audio", audioUrl });
      toast.success("Аудио сгенерировано!");
      setTtsVoiceDialogOpen(false);
    } catch (e: any) {
      console.error("TTS convert error:", e);
      toast.error(e.message || "Ошибка генерации аудио");
    } finally { setTtsGenerating(false); }
  };

  return (
    <div ref={setNodeRef} style={style} data-block-id={block.id} className={cn("group relative rounded-lg transition-all pl-14 pr-14", isFocused && "bg-secondary/30")} onClick={onFocus}>
      {/* Left gutter: "+" add-block button */}
      <div className="absolute left-2 top-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <InlineAddBlockButton onAdd={(type, pendingAI) => onAddAfter(type, pendingAI)} />
      </div>
      <div className="min-w-0">
        <BlockContent block={block} onUpdate={onUpdate} courseTitle={courseTitle} lessonTitle={lessonTitle} existingContent={existingContent} organizationId={organizationId} courseId={courseId} lessonId={lessonId} presets={presets} onPresetsChange={onPresetsChange} />
      </div>
      {/* Right gutter: drag handle + "..." actions menu */}
      <div className="absolute right-2 top-1 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex items-center gap-1">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing w-7 h-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors touch-none"
          title="Перетащить"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <Popover open={actionsMenuOpen} onOpenChange={(o) => { setActionsMenuOpen(o); if (!o) setActionsQuery(""); }}>
          <PopoverTrigger asChild>
            <button
              className="w-9 h-9 rounded-full bg-muted/60 hover:bg-primary/15 text-muted-foreground hover:text-primary flex items-center justify-center transition-colors"
              title="Действия с блоком"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
            <div className="relative mb-1.5">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={actionsQuery}
                onChange={(e) => setActionsQuery(e.target.value)}
                placeholder="Поиск"
                className="h-8 pl-7 text-sm"
                autoFocus
              />
            </div>
            <div className="flex flex-col">
              {filteredActions.map((a) => (
                <button
                  key={a.key}
                  disabled={a.disabled}
                  onClick={() => { a.onClick(); setActionsMenuOpen(false); }}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors",
                    "hover:bg-accent disabled:opacity-40 disabled:pointer-events-none",
                    (a as any).danger && "text-destructive hover:bg-destructive/10"
                  )}
                >
                  <a.icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 truncate">{a.label}</span>
                </button>
              ))}
              {filteredActions.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">Ничего не найдено</p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <Dialog open={ttsVoiceDialogOpen} onOpenChange={setTtsVoiceDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Headphones className="w-5 h-5" />Выбор голоса для озвучивания</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Голос SaluteSpeech</Label>
              <Select value={ttsVoice} onValueChange={setTtsVoice}>
                <SelectTrigger><SelectValue placeholder="Выберите голос" /></SelectTrigger>
                <SelectContent>
                  {SALUTE_VOICES.map((voice) => <SelectItem key={voice.id} value={voice.id}><div className="flex items-center gap-2"><Volume2 className="w-3.5 h-3.5 text-muted-foreground" />{voice.name}</div></SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleTtsGenerate} disabled={ttsGenerating} className="w-full gap-2">
              {ttsGenerating ? <SigmaSpinner size="sm" /> : <Headphones className="w-4 h-4" />}
              {ttsGenerating ? "Генерация..." : "Озвучить текст"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
