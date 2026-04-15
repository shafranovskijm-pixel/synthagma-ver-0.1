import { useState, useCallback, useEffect, useRef } from "react";
import { checkAiLimitGlobal, incrementAiLimitGlobal } from "@/hooks/useAiGenerationLimit";
import { safeInvoke } from "@/utils/safeInvoke";
import { Type, Wand2, Undo2, Redo2} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";

import type { BlockType, ContentBlock, BlockEditorProps } from "./types";
import { createBlock } from "./types";
import { summarizeExistingContent, loadPresets, savePresets } from "./utils";
import { BlockRenderer } from "./BlockRenderer";
import { SortableBlockItem } from "./blocks/SortableBlockItem";
import { AddBlockButton } from "./blocks/AddBlockButton";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

export function BlockEditor({ blocks, onChange, readOnly = false, courseTitle, lessonTitle }: BlockEditorProps) {
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [stylePresets, setStylePresets] = useState(() => loadPresets());
  const [isFormatting, setIsFormatting] = useState(false);

  const historyRef = useRef<ContentBlock[][]>([JSON.parse(JSON.stringify(blocks))]);
  const historyIndexRef = useRef(0);
  const isUndoRedoRef = useRef(false);

  const pushHistory = useCallback((newBlocks: ContentBlock[]) => {
    if (isUndoRedoRef.current) { isUndoRedoRef.current = false; return; }
    const history = historyRef.current;
    const idx = historyIndexRef.current;
    historyRef.current = history.slice(0, idx + 1);
    historyRef.current.push(JSON.parse(JSON.stringify(newBlocks)));
    if (historyRef.current.length > 50) historyRef.current.shift();
    historyIndexRef.current = historyRef.current.length - 1;
  }, []);

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    isUndoRedoRef.current = true;
    onChange(JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current])));
  }, [onChange]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    isUndoRedoRef.current = true;
    onChange(JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current])));
  }, [onChange]);

  const onChangeWithHistory = useCallback((newBlocks: ContentBlock[]) => {
    pushHistory(newBlocks);
    onChange(newBlocks);
  }, [onChange, pushHistory]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) { e.preventDefault(); handleRedo(); }
        else { e.preventDefault(); handleUndo(); }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const addBlock = useCallback((type: BlockType, afterIndex?: number) => {
    const newBlock = createBlock(type);
    const newBlocks = [...blocks];
    if (afterIndex !== undefined) newBlocks.splice(afterIndex + 1, 0, newBlock);
    else newBlocks.push(newBlock);
    onChangeWithHistory(newBlocks);
    setFocusedBlockId(newBlock.id);
  }, [blocks, onChangeWithHistory]);

  const updateBlock = useCallback((id: string, updates: Partial<ContentBlock>) => {
    onChangeWithHistory(blocks.map(b => b.id === id ? { ...b, ...updates } : b));
  }, [blocks, onChangeWithHistory]);

  const deleteBlock = useCallback((id: string) => {
    onChangeWithHistory(blocks.filter(b => b.id !== id));
  }, [blocks, onChangeWithHistory]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);
      onChangeWithHistory(arrayMove(blocks, oldIndex, newIndex));
    }
  };

  const handleFormatWithAI = useCallback(async () => {
    if (blocks.length === 0) return;
    const rawText = blocks.map(b => { if (b.type === "accordion" && b.accordionTitle) return `${b.accordionTitle}\n${b.content}`; return b.content; }).filter(Boolean).join("\n\n");
    if (!rawText.trim()) return;
    const canProceed = await checkAiLimitGlobal();
    if (!canProceed) return;
    setIsFormatting(true);
    try {
      const { data, error } = await safeInvoke<{ success: boolean; blocks: any[] }>("generate-lesson-content", { body: { rawText, lessonType: "format", courseTitle, lessonTitle } });
      if (error || !data?.success || !data.blocks?.length) { const { toast } = await import("sonner"); toast.error(error?.message || "Не удалось оформить текст"); return; }
      const formatted: ContentBlock[] = data.blocks.map((b: any) => ({ ...createBlock(b.type as BlockType), content: b.content || "", ...(b.accordionTitle && { accordionTitle: b.accordionTitle }) }));
      onChangeWithHistory(formatted);
      await incrementAiLimitGlobal();
      const { toast } = await import("sonner"); toast.success("Текст оформлен с помощью ИИ");
    } catch (err) { console.error("Format with AI error:", err); }
    finally { setIsFormatting(false); }
  }, [blocks, courseTitle, lessonTitle, onChangeWithHistory]);

  if (readOnly) return <BlockRenderer blocks={blocks} />;

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <div className="inline-flex items-center gap-1 bg-background/90 backdrop-blur-sm border border-border rounded-lg p-1.5 shadow-md">
          {blocks.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleFormatWithAI} disabled={isFormatting} title="Оформить текст с помощью ИИ" className="h-10 px-3 gap-1.5 text-xs font-medium">
              {isFormatting ? <SigmaSpinner size="sm" /> : <Wand2 className="w-4 h-4" />}Оформить с ИИ
            </Button>
          )}
          <div className="w-px h-6 bg-border" />
          <Button variant="ghost" size="sm" onClick={handleUndo} disabled={!canUndo} title="Отменить (Ctrl+Z)" className="h-10 w-10 p-0"><Undo2 className="w-5 h-5" /></Button>
          <Button variant="ghost" size="sm" onClick={handleRedo} disabled={!canRedo} title="Вернуть (Ctrl+Shift+Z)" className="h-10 w-10 p-0"><Redo2 className="w-5 h-5" /></Button>
        </div>
      </div>
      {blocks.length === 0 && (
        <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-border rounded-xl">
          <Type className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm mb-3">Начните добавлять контент</p>
          <AddBlockButton onAdd={(type) => addBlock(type)} />
        </div>
      )}
      {blocks.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
            {blocks.map((block, index) => (
              <SortableBlockItem
                key={block.id}
                block={block}
                isFocused={focusedBlockId === block.id}
                onFocus={() => setFocusedBlockId(block.id)}
                onUpdate={(updates) => updateBlock(block.id, updates)}
                onDelete={() => deleteBlock(block.id)}
                onAddAfter={(type) => addBlock(type, index)}
                courseTitle={courseTitle}
                lessonTitle={lessonTitle}
                existingContent={summarizeExistingContent(blocks)}
                presets={stylePresets}
                onPresetsChange={(p) => { setStylePresets(p); savePresets(p); }}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
      {blocks.length > 0 && (
        <div className="flex justify-center pt-2"><AddBlockButton onAdd={(type) => addBlock(type)} /></div>
      )}
    </div>
  );
}
