import { useState, useCallback, useEffect } from "react";
import DOMPurify from "dompurify";
import {
  Plus,
  GripVertical,
  Trash2,
  Type,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  AlertCircle,
  Lightbulb,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  BookOpen,
  Image as ImageIcon,
  Video,
  Upload,
  Presentation,
  Loader2,
  Sparkles,
  Wand2,
  Info,
  AlertTriangle,
  Pencil,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Minus,
  Strikethrough,
  Underline,
  CaseSensitive,
  Star,
  Check,
  X,
  Eraser,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "./RichTextEditor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['strong', 'b', 'em', 'i', 'u', 'br', 'p', 'span', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'a', 'img'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class', 'style', 'colspan', 'rowspan'],
    ALLOW_DATA_ATTR: false,
  });
};

export type BlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "bulletList"
  | "numberedList"
  | "quote"
  | "callout-info"
  | "callout-warning"
  | "callout-tip"
  | "accordion"
  | "quiz"
  | "image"
  | "video"
  | "slider"
  | "divider";

export interface QuizOption {
  text: string;
  isCorrect: boolean;
}

export interface SliderSlide {
  id: string;
  content: string;
  title?: string;
  imageUrl?: string;
}

export interface ContentBlock {
  id: string;
  type: BlockType;
  content: string;
  accordionTitle?: string;
  accordionOpen?: boolean;
  quizQuestion?: string;
  quizOptions?: QuizOption[];
  quizExplanation?: string;
  imageSrc?: string;
  imageAlt?: string;
  videoUrl?: string;
  sliderSlides?: SliderSlide[];
  sliderCurrentIndex?: number;
  textAlign?: 'left' | 'center' | 'right';
  bgColor?: string;
  textSize?: 'sm' | 'base' | 'lg';
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  uppercase?: boolean;
  textColor?: string;
  lineHeight?: 'tight' | 'normal' | 'relaxed';
}

interface BlockEditorProps {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  readOnly?: boolean;
  courseTitle?: string;
  lessonTitle?: string;
}

const blockTypeConfig: Record<BlockType, { icon: any; label: string; color: string }> = {
  paragraph: { icon: Type, label: "Параграф", color: "text-foreground" },
  heading1: { icon: Heading1, label: "Заголовок 1", color: "text-foreground" },
  heading2: { icon: Heading2, label: "Заголовок 2", color: "text-foreground" },
  bulletList: { icon: List, label: "Маркированный список", color: "text-foreground" },
  numberedList: { icon: ListOrdered, label: "Нумерованный список", color: "text-foreground" },
  quote: { icon: Quote, label: "Цитата", color: "text-muted-foreground" },
  "callout-info": { icon: AlertCircle, label: "Информация", color: "text-blue-500" },
  "callout-warning": { icon: AlertCircle, label: "Предупреждение", color: "text-amber-500" },
  "callout-tip": { icon: Lightbulb, label: "Совет", color: "text-green-500" },
  accordion: { icon: ChevronDown, label: "Сворачиваемая секция", color: "text-purple-500" },
  quiz: { icon: HelpCircle, label: "Мини-квиз", color: "text-primary" },
  image: { icon: ImageIcon, label: "Изображение", color: "text-green-500" },
  video: { icon: Video, label: "Видео", color: "text-red-500" },
  slider: { icon: Presentation, label: "Слайдер презентации", color: "text-orange-500" },
  divider: { icon: Minus, label: "Разделитель", color: "text-muted-foreground" },
};

const createBlock = (type: BlockType): ContentBlock => ({
  id: crypto.randomUUID(),
  type,
  content: "",
  ...(type === "accordion" && { accordionTitle: "Заголовок секции", accordionOpen: true }),
  ...(type === "quiz" && {
    quizQuestion: "",
    quizOptions: [
      { text: "", isCorrect: true },
      { text: "", isCorrect: false },
    ],
    quizExplanation: ""
  }),
  ...(type === "image" && { imageSrc: "", imageAlt: "" }),
  ...(type === "video" && { videoUrl: "" }),
  ...(type === "slider" && { sliderSlides: [], sliderCurrentIndex: 0 }),
});

export function BlockEditor({ blocks, onChange, readOnly = false, courseTitle, lessonTitle }: BlockEditorProps) {
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [stylePresets, setStylePresets] = useState(() => loadPresets());

  const addBlock = useCallback((type: BlockType, afterIndex?: number) => {
    const newBlock = createBlock(type);
    const newBlocks = [...blocks];
    if (afterIndex !== undefined) {
      newBlocks.splice(afterIndex + 1, 0, newBlock);
    } else {
      newBlocks.push(newBlock);
    }
    onChange(newBlocks);
    setFocusedBlockId(newBlock.id);
  }, [blocks, onChange]);

  const updateBlock = useCallback((id: string, updates: Partial<ContentBlock>) => {
    onChange(blocks.map(b => b.id === id ? { ...b, ...updates } : b));
  }, [blocks, onChange]);

  const deleteBlock = useCallback((id: string) => {
    onChange(blocks.filter(b => b.id !== id));
  }, [blocks, onChange]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);
      onChange(arrayMove(blocks, oldIndex, newIndex));
    }
  };

  if (readOnly) {
    return <BlockRenderer blocks={blocks} />;
  }

  return (
    <div className="space-y-2">
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
        <div className="flex justify-center pt-2">
          <AddBlockButton onAdd={(type) => addBlock(type)} />
        </div>
      )}
    </div>
  );
}

function AddBlockButton({ onAdd }: { onAdd: (type: BlockType) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-lg gap-2">
          <Plus className="w-4 h-4" />
          Добавить блок
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-56">
        <DropdownMenuItem onClick={() => onAdd("paragraph")}>
          <Type className="w-4 h-4 mr-2" />Параграф
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdd("heading1")}>
          <Heading1 className="w-4 h-4 mr-2" />Заголовок 1
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdd("heading2")}>
          <Heading2 className="w-4 h-4 mr-2" />Заголовок 2
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAdd("bulletList")}>
          <List className="w-4 h-4 mr-2" />Маркированный список
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdd("numberedList")}>
          <ListOrdered className="w-4 h-4 mr-2" />Нумерованный список
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdd("quote")}>
          <Quote className="w-4 h-4 mr-2" />Цитата
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAdd("callout-info")}>
          <AlertCircle className="w-4 h-4 mr-2 text-blue-500" />Информация
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdd("callout-warning")}>
          <AlertCircle className="w-4 h-4 mr-2 text-amber-500" />Предупреждение
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdd("callout-tip")}>
          <Lightbulb className="w-4 h-4 mr-2 text-green-500" />Совет
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAdd("accordion")}>
          <ChevronDown className="w-4 h-4 mr-2 text-purple-500" />Сворачиваемая секция
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdd("quiz")}>
          <HelpCircle className="w-4 h-4 mr-2 text-primary" />Мини-квиз
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAdd("image")}>
          <ImageIcon className="w-4 h-4 mr-2 text-green-500" />Изображение
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdd("video")}>
          <Video className="w-4 h-4 mr-2 text-red-500" />Видео
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdd("slider")}>
          <Presentation className="w-4 h-4 mr-2 text-orange-500" />Слайдер презентации
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAdd("divider")}>
          <Minus className="w-4 h-4 mr-2 text-muted-foreground" />Разделитель
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function summarizeExistingContent(blocks: ContentBlock[]): string {
  return blocks
    .filter(b => b.content || b.quizQuestion || b.accordionTitle)
    .map(b => {
      if (b.quizQuestion) return `[Квиз] ${b.quizQuestion}`;
      if (b.accordionTitle) return `[Секция] ${b.accordionTitle}: ${b.content || ''}`;
      return b.content;
    })
    .filter(Boolean)
    .join('\n')
    .slice(0, 2000);
}

interface SortableBlockItemProps {
  block: ContentBlock;
  isFocused: boolean;
  onFocus: () => void;
  onUpdate: (updates: Partial<ContentBlock>) => void;
  onDelete: () => void;
  onAddAfter: (type: BlockType) => void;
  courseTitle?: string;
  lessonTitle?: string;
  existingContent?: string;
  presets: { name: string; style: StylePreset }[];
  onPresetsChange: (presets: { name: string; style: StylePreset }[]) => void;
}

const convertibleTypes: BlockType[] = ["paragraph", "heading1", "heading2", "bulletList", "numberedList", "quote", "callout-info", "callout-warning", "callout-tip", "accordion"];

const textStyleableTypes: BlockType[] = ["paragraph", "heading1", "heading2", "bulletList", "numberedList", "quote", "callout-info", "callout-warning", "callout-tip"];

const bgColorPresets = [
  { value: "", label: "Без фона", class: "" },
  { value: "gray", label: "Серый", class: "bg-muted" },
  { value: "blue", label: "Голубой", class: "bg-blue-50 dark:bg-blue-950/30" },
  { value: "yellow", label: "Жёлтый", class: "bg-yellow-50 dark:bg-yellow-950/30" },
  { value: "green", label: "Зелёный", class: "bg-green-50 dark:bg-green-950/30" },
];

const bgColorDotStyles: Record<string, string> = {
  "": "bg-background border border-border",
  "gray": "bg-muted",
  "blue": "bg-blue-200 dark:bg-blue-800",
  "yellow": "bg-yellow-200 dark:bg-yellow-800",
  "green": "bg-green-200 dark:bg-green-800",
};

const textColorPresets = [
  { value: "", label: "По умолчанию", class: "", dot: "bg-foreground" },
  { value: "gray", label: "Серый", class: "text-gray-500", dot: "bg-gray-500" },
  { value: "blue", label: "Синий", class: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500" },
  { value: "red", label: "Красный", class: "text-red-600 dark:text-red-400", dot: "bg-red-500" },
  { value: "green", label: "Зелёный", class: "text-green-600 dark:text-green-400", dot: "bg-green-500" },
  { value: "purple", label: "Фиолетовый", class: "text-purple-600 dark:text-purple-400", dot: "bg-purple-500" },
];

const wrapTargets: { type: BlockType; icon: any; label: string; color: string }[] = [
  { type: "callout-info", icon: Info, label: "Информация", color: "text-blue-500" },
  { type: "callout-warning", icon: AlertTriangle, label: "Предупреждение", color: "text-amber-500" },
  { type: "callout-tip", icon: Lightbulb, label: "Совет", color: "text-green-500" },
  { type: "quote", icon: Quote, label: "Цитата", color: "text-muted-foreground" },
  { type: "accordion", icon: ChevronDown, label: "Сворачиваемая секция", color: "text-purple-500" },
  { type: "paragraph", icon: Type, label: "Обычный текст", color: "text-foreground" },
];
// Style preset keys to save/apply
const STYLE_PRESET_KEYS = ['textAlign', 'bgColor', 'textColor', 'textSize', 'bold', 'italic', 'strikethrough', 'underline', 'uppercase', 'lineHeight'] as const;
type StylePreset = Pick<ContentBlock, typeof STYLE_PRESET_KEYS[number]>;

const PRESETS_STORAGE_KEY = 'block-style-presets';

function loadPresets(): { name: string; style: StylePreset }[] {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePresets(presets: { name: string; style: StylePreset }[]) {
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

function extractStyle(block: ContentBlock): StylePreset {
  return {
    textAlign: block.textAlign || undefined,
    bgColor: block.bgColor || undefined,
    textColor: block.textColor || undefined,
    textSize: block.textSize || 'base',
    bold: block.bold || false,
    italic: block.italic || false,
    strikethrough: block.strikethrough || false,
    underline: block.underline || false,
    uppercase: block.uppercase || false,
    lineHeight: block.lineHeight || 'normal',
  };
}

function describeStyle(style: StylePreset): string {
  const parts: string[] = [];
  if (style.bold) parts.push('Жирный');
  if (style.italic) parts.push('Курсив');
  if (style.underline) parts.push('Подчёрк.');
  if (style.strikethrough) parts.push('Зачёрк.');
  if (style.uppercase) parts.push('ВЕРХН.');
  if (style.textSize === 'sm') parts.push('Мелкий');
  if (style.textSize === 'lg') parts.push('Крупный');
  if (style.textAlign === 'center') parts.push('По центру');
  if (style.textAlign === 'right') parts.push('Справа');
  if (style.bgColor) parts.push(`Фон: ${style.bgColor}`);
  if (style.textColor) parts.push(`Цвет: ${style.textColor}`);
  if (style.lineHeight === 'tight') parts.push('Плотный');
  if (style.lineHeight === 'relaxed') parts.push('Свободн.');
  return parts.length ? parts.join(', ') : 'Стандарт';
}

function SortableBlockItem({ block, isFocused, onFocus, onUpdate, onDelete, onAddAfter, courseTitle, lessonTitle, existingContent, presets, onPresetsChange }: SortableBlockItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  const canConvert = convertibleTypes.includes(block.type);
  const canStyle = textStyleableTypes.includes(block.type);

  const handleConvert = (newType: BlockType) => {
    const updates: Partial<ContentBlock> = { type: newType };
    if (newType === "accordion" && !block.accordionTitle) {
      updates.accordionTitle = "Заголовок секции";
      updates.accordionOpen = true;
    }
    onUpdate(updates);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("group relative rounded-lg transition-all", isFocused && "bg-secondary/30")}
      onClick={onFocus}
    >
      {/* Top-center floating toolbar */}
      <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity py-1">
        <div className="flex items-center gap-0.5 bg-foreground/80 backdrop-blur-sm text-background rounded-full px-2 py-1 shadow-lg">
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing hover:bg-white/20 rounded-full h-8 w-8 flex items-center justify-center touch-none transition-colors">
            <GripVertical className="w-4 h-4" />
          </div>
          {canConvert && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-8 w-8 flex items-center justify-center hover:bg-white/20 rounded-full transition-colors" title="Обернуть / Преобразовать">
                  <Wand2 className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-52">
                {wrapTargets.filter(t => t.type !== block.type).map((t) => (
                  <DropdownMenuItem key={t.type} onClick={() => handleConvert(t.type)}>
                    <t.icon className={cn("w-4 h-4 mr-2", t.color)} />{t.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canStyle && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="h-8 w-8 flex items-center justify-center hover:bg-white/20 rounded-full transition-colors" title="Настройки блока">
                  <Pencil className="w-4 h-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="center" className="w-72 p-3 space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Выравнивание</p>
                  <div className="flex gap-1">
                    {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([align, Icon]) => (
                      <Button key={align} variant={block.textAlign === align || (!block.textAlign && align === 'left') ? "default" : "outline"} size="icon" className="h-7 w-7" onClick={() => onUpdate({ textAlign: align === 'left' ? undefined : align })}>
                        <Icon className="w-3.5 h-3.5" />
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Стиль текста</p>
                  <div className="flex gap-1">
                    <Button variant={block.bold ? "default" : "outline"} size="icon" className="h-7 w-7" onClick={() => onUpdate({ bold: !block.bold })} title="Жирный">
                      <Bold className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant={block.italic ? "default" : "outline"} size="icon" className="h-7 w-7" onClick={() => onUpdate({ italic: !block.italic })} title="Курсив">
                      <Italic className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant={block.strikethrough ? "default" : "outline"} size="icon" className="h-7 w-7" onClick={() => onUpdate({ strikethrough: !block.strikethrough })} title="Зачёркнутый">
                      <Strikethrough className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant={block.underline ? "default" : "outline"} size="icon" className="h-7 w-7" onClick={() => onUpdate({ underline: !block.underline })} title="Подчёркнутый">
                      <Underline className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant={block.uppercase ? "default" : "outline"} size="icon" className="h-7 w-7" onClick={() => onUpdate({ uppercase: !block.uppercase })} title="UPPERCASE">
                      <CaseSensitive className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Цвет текста</p>
                  <div className="flex gap-1.5">
                    {textColorPresets.map((preset) => (
                      <button key={preset.value} onClick={() => onUpdate({ textColor: preset.value || undefined })} className={cn("w-6 h-6 rounded-full transition-all", preset.dot, (block.textColor || "") === preset.value && "ring-2 ring-primary ring-offset-1")} title={preset.label} />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Фон блока</p>
                  <div className="flex gap-1.5">
                    {bgColorPresets.map((preset) => (
                      <button key={preset.value} onClick={() => onUpdate({ bgColor: preset.value || undefined })} className={cn("w-6 h-6 rounded-full transition-all", bgColorDotStyles[preset.value], (block.bgColor || "") === preset.value && "ring-2 ring-primary ring-offset-1")} title={preset.label} />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Размер текста</p>
                  <div className="flex gap-1">
                    {([['sm', 'A-'], ['base', 'A'], ['lg', 'A+']] as const).map(([size, label]) => (
                      <Button key={size} variant={(block.textSize || 'base') === size ? "default" : "outline"} size="sm" className="h-7 px-2.5 text-xs" onClick={() => onUpdate({ textSize: size === 'base' ? undefined : size })}>
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Межстрочный интервал</p>
                  <div className="flex gap-1">
                    {([['tight', 'Плотный'], ['normal', 'Обычный'], ['relaxed', 'Свободный']] as const).map(([lh, label]) => (
                      <Button key={lh} variant={(block.lineHeight || 'normal') === lh ? "default" : "outline"} size="sm" className="h-7 px-2.5 text-xs" onClick={() => onUpdate({ lineHeight: lh === 'normal' ? undefined : lh })}>
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
          {canStyle && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={cn("h-8 w-8 flex items-center justify-center hover:bg-white/20 rounded-full transition-colors", presets.length > 0 && "text-yellow-400")} title="Пресеты стиля">
                  <Star className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-56">
                <DropdownMenuItem onClick={() => {
                  const style = extractStyle(block);
                  console.log('[Preset] Saving style:', JSON.stringify(style));
                  const name = describeStyle(style);
                  const newPresets = [...presets, { name, style }];
                  onPresetsChange(newPresets);
                  import("sonner").then(({ toast }) => toast.success(`Пресет сохранён: ${name}`));
                }}>
                  <Star className="w-4 h-4 mr-2 text-yellow-500" />Сохранить текущий стиль
                </DropdownMenuItem>
                {presets.length > 0 && <DropdownMenuSeparator />}
                {presets.map((p, i) => (
                  <DropdownMenuItem key={i} className="flex items-center justify-between group/preset" onClick={() => {
                    const applied = { ...p.style, textSize: p.style.textSize === 'base' ? undefined : p.style.textSize, lineHeight: p.style.lineHeight === 'normal' ? undefined : p.style.lineHeight };
                    onUpdate(applied);
                  }}>
                    <span className="flex-1 truncate text-xs">{p.name}</span>
                    <button
                      className="ml-2 opacity-0 group-hover/preset:opacity-100 h-5 w-5 flex items-center justify-center hover:bg-destructive/20 rounded transition-all"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const newPresets = presets.filter((_, j) => j !== i);
                        onPresetsChange(newPresets);
                      }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canStyle && (
            <button
              className="h-8 w-8 flex items-center justify-center hover:bg-white/20 rounded-full transition-colors"
              title="Сбросить стиль"
              onClick={() => onUpdate({ textAlign: undefined, bgColor: undefined, textColor: undefined, textSize: undefined, bold: undefined, italic: undefined, strikethrough: undefined, underline: undefined, uppercase: undefined, lineHeight: undefined })}
            >
              <Eraser className="w-4 h-4" />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-8 w-8 flex items-center justify-center hover:bg-white/20 rounded-full transition-colors" title="Добавить блок">
                <Plus className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-48">
              {Object.entries(blockTypeConfig).map(([type, cfg]) => (
                <DropdownMenuItem key={type} onClick={() => onAddAfter(type as BlockType)}>
                  <cfg.icon className={cn("w-4 h-4 mr-2", cfg.color)} />{cfg.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button className="h-8 w-8 flex items-center justify-center hover:bg-red-500/30 rounded-full transition-colors" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Удалить блок">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="min-w-0">
        <BlockContent block={block} onUpdate={onUpdate} courseTitle={courseTitle} lessonTitle={lessonTitle} existingContent={existingContent} />
      </div>
    </div>
  );
}

function BlockContent({ block, onUpdate, courseTitle, lessonTitle, existingContent }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void; courseTitle?: string; lessonTitle?: string; existingContent?: string }) {
  

  const editorStyleClasses = (() => {
    const classes: string[] = [];
    if (block.textAlign === 'center') classes.push('text-center');
    if (block.textAlign === 'right') classes.push('text-right');
    if (block.textSize === 'sm') classes.push('text-sm');
    if (block.textSize === 'lg') classes.push('text-lg');
    if (block.bold) classes.push('font-bold');
    if (block.italic) classes.push('italic');
    if (block.strikethrough) classes.push('line-through');
    if (block.underline) classes.push('underline');
    if (block.uppercase) classes.push('uppercase');
    if (block.lineHeight === 'tight') classes.push('leading-tight');
    if (block.lineHeight === 'relaxed') classes.push('leading-relaxed');
    if (block.textColor) {
      const preset = textColorPresets.find(p => p.value === block.textColor);
      if (preset?.class) classes.push(preset.class);
    }
    if (block.bgColor) {
      const preset = bgColorPresets.find(p => p.value === block.bgColor);
      if (preset?.class) classes.push(preset.class, 'rounded-lg', 'p-3');
    }
    return classes.join(' ');
  })();

  switch (block.type) {
    case "paragraph":
      return (
        <div className={cn("py-2 min-h-[40px]", editorStyleClasses)}>
          <RichTextEditor value={block.content} onChange={(val) => onUpdate({ content: val })} placeholder="Введите текст..." />
        </div>
      );

    case "heading1":
      return <Input value={block.content} onChange={(e) => onUpdate({ content: e.target.value })} placeholder="Заголовок 1" className={cn("text-2xl font-bold border-0 bg-transparent focus-visible:ring-0 px-0 h-auto py-2", editorStyleClasses)} />;

    case "heading2":
      return <Input value={block.content} onChange={(e) => onUpdate({ content: e.target.value })} placeholder="Заголовок 2" className={cn("text-xl font-semibold border-0 bg-transparent focus-visible:ring-0 px-0 h-auto py-2", editorStyleClasses)} />;

    case "bulletList":
    case "numberedList":
      return (
        <div className={cn("space-y-1 py-2", editorStyleClasses)}>
          <Textarea value={block.content} onChange={(e) => onUpdate({ content: e.target.value })} placeholder="Элемент списка (каждая строка — отдельный пункт)" className="min-h-[60px] border-0 bg-secondary/30 resize-none focus-visible:ring-1 rounded-lg text-sm" />
        </div>
      );

    case "quote":
      return <QuoteBlock block={block} onUpdate={onUpdate} courseTitle={courseTitle} lessonTitle={lessonTitle} existingContent={existingContent} />;

    case "callout-info":
    case "callout-warning":
    case "callout-tip":
      return <CalloutBlock block={block} onUpdate={onUpdate} courseTitle={courseTitle} lessonTitle={lessonTitle} existingContent={existingContent} />;

    case "accordion":
      return <AccordionBlock block={block} onUpdate={onUpdate} courseTitle={courseTitle} lessonTitle={lessonTitle} existingContent={existingContent} />;

    case "quiz":
      return <QuizBlock block={block} onUpdate={onUpdate} courseTitle={courseTitle} lessonTitle={lessonTitle} existingContent={existingContent} />;

    case "image":
      return <ImageBlock block={block} onUpdate={onUpdate} />;

    case "video":
      return <VideoBlock block={block} onUpdate={onUpdate} />;

    case "slider":
      return <SliderBlock block={block} onUpdate={onUpdate} />;

    case "divider":
      return <div className="py-4"><hr className="border-border" /></div>;

    default:
      return null;
  }
}

function ImageBlock({ block, onUpdate }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void }) {
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [showAiInput, setShowAiInput] = useState(false);
  const [showEditInput, setShowEditInput] = useState(false);
  const fileInputRef = useCallback((node: HTMLInputElement | null) => {
    if (node) node.value = "";
  }, []);

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 10 * 1024 * 1024) return;
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

      const { error } = await supabase.storage.from(bucket).upload(fileName, file, { cacheControl: '3600', upsert: true });
      if (error) {
        const uploadUrl = `${baseUrl}/storage/v1/object/${bucket}/${fileName}`;
        const resp = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${authToken}`, 'apikey': apiKey!, 'x-upsert': 'true' },
          body: file,
        });
        if (!resp.ok) throw new Error('Upload failed');
      }

      const publicUrl = `${baseUrl}/storage/v1/object/public/${bucket}/${fileName}`;
      onUpdate({ imageSrc: publicUrl, imageAlt: block.imageAlt || file.name.replace(/\.[^.]+$/, '') });
    } catch (err) {
      console.error("Image upload error:", err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { prompt: aiPrompt.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) {
        onUpdate({ imageSrc: data.url, imageAlt: aiPrompt.trim() });
        setAiPrompt("");
        setShowAiInput(false);
      }
    } catch (err) {
      console.error("AI image generation error:", err);
      const { toast } = await import("sonner");
      toast.error(err instanceof Error ? err.message : "Ошибка генерации изображения");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAiEdit = async () => {
    if (!editPrompt.trim() || !block.imageSrc) return;
    setIsEditing(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { prompt: editPrompt.trim(), imageUrl: block.imageSrc },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) {
        onUpdate({ imageSrc: data.url });
        setEditPrompt("");
        setShowEditInput(false);
        const { toast } = await import("sonner");
        toast.success("Изображение отредактировано");
      }
    } catch (err) {
      console.error("AI image edit error:", err);
      const { toast } = await import("sonner");
      toast.error(err instanceof Error ? err.message : "Ошибка редактирования изображения");
    } finally {
      setIsEditing(false);
    }
  };

  return (
    <div className="py-2">
      {block.imageSrc ? (
        <div className="space-y-2">
          <div className="relative group/img">
            <img src={block.imageSrc} alt={block.imageAlt || ""} className="rounded-lg max-w-full h-auto max-h-[400px] object-contain" />
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowEditInput(!showEditInput)}
                className={showEditInput ? "border-primary" : ""}
                disabled={isEditing}
              >
                <Wand2 className="w-3.5 h-3.5 mr-1" />
                Редактировать ИИ
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onUpdate({ imageSrc: "", imageAlt: "" })}>Удалить</Button>
            </div>
          </div>
          {showEditInput && (
            <div className="flex gap-2">
              <Input
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                placeholder="Опишите что исправить, например: замени текст ЗАБОЕВАНИЙ на ЗАБОЛЕВАНИЙ..."
                className="text-sm flex-1"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiEdit(); } }}
                disabled={isEditing}
              />
              <Button size="sm" disabled={!editPrompt.trim() || isEditing} onClick={handleAiEdit}>
                {isEditing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              </Button>
            </div>
          )}
          <Input value={block.imageAlt || ""} onChange={(e) => onUpdate({ imageAlt: e.target.value })} placeholder="Подпись к изображению..." className="text-sm border-0 bg-secondary/30 focus-visible:ring-1 rounded-lg" />
        </div>
      ) : (
        <div className="bg-muted rounded-xl p-6 space-y-4">
          <div className="text-center">
            <ImageIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-3">Загрузите изображение или вставьте ссылку</p>
            <div className="flex gap-2 justify-center">
              <Button
                variant="outline"
                size="sm"
                disabled={isUploading || isGenerating}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.onchange = (e) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (f) handleFileUpload(f);
                  };
                  input.click();
                }}
              >
                {isUploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                {isUploading ? "Загрузка..." : "Загрузить файл"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isUploading || isGenerating}
                onClick={() => setShowAiInput(!showAiInput)}
                className={showAiInput ? "border-primary text-primary" : ""}
              >
                <Sparkles className="w-4 h-4 mr-1" />
                ИИ генерация
              </Button>
            </div>
          </div>
          {showAiInput && (
            <div className="space-y-2">
              <Input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Опишите изображение, например: схема работы нейронной сети..."
                className="text-sm"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiGenerate(); } }}
                disabled={isGenerating}
              />
              <Button
                size="sm"
                disabled={!aiPrompt.trim() || isGenerating}
                onClick={handleAiGenerate}
                className="w-full"
              >
                {isGenerating ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Генерация...</> : <><Wand2 className="w-4 h-4 mr-1" /> Сгенерировать</>}
              </Button>
            </div>
          )}
          <Input value={block.imageSrc || ""} onChange={(e) => onUpdate({ imageSrc: e.target.value })} placeholder="https://example.com/image.jpg" className="text-sm" />
        </div>
      )}
    </div>
  );
}

function VideoBlock({ block, onUpdate }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void }) {
  // Check if the content is an iframe embed code
  const isIframeEmbed = (content: string): boolean => {
    return content.trim().startsWith('<iframe') && content.includes('</iframe>');
  };

  // Extract src from iframe if it's embed code
  const getEmbedFromContent = (content: string): { type: 'iframe' | 'url' | null; value: string | null } => {
    if (!content) return { type: null, value: null };
    
    // Check for iframe embed code
    if (isIframeEmbed(content)) {
      return { type: 'iframe', value: content };
    }
    
    // YouTube
    const ytMatch = content.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (ytMatch) return { type: 'url', value: `https://www.youtube.com/embed/${ytMatch[1]}` };
    
    // Vimeo
    const vimeoMatch = content.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) return { type: 'url', value: `https://player.vimeo.com/video/${vimeoMatch[1]}` };
    
    // Rutube
    const rutubeMatch = content.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/);
    if (rutubeMatch) return { type: 'url', value: `https://rutube.ru/play/embed/${rutubeMatch[1]}` };
    
    // VK Video (vk.com and vkvideo.ru)
    const vkMatch = content.match(/(?:vk\.com|vkvideo\.ru)\/video(-?\d+)_(\d+)/);
    if (vkMatch) return { type: 'url', value: `https://vk.com/video_ext.php?oid=${vkMatch[1]}&id=${vkMatch[2]}&hd=2` };
    
    // KTalk recordings (ktalk.ru)
    const ktalkMatch = content.match(/([a-zA-Z0-9]+)\.ktalk\.ru\/recordings\/([a-zA-Z0-9_-]+)/);
    if (ktalkMatch) return { type: 'url', value: `https://${ktalkMatch[1]}.ktalk.ru/recordings/${ktalkMatch[2]}` };
    
    // Яндекс Дзен (dzen.ru)
    const dzenMatch = content.match(/dzen\.ru\/(?:video\/watch|embed)\/([a-zA-Z0-9_-]+)/);
    if (dzenMatch) return { type: 'url', value: `https://dzen.ru/embed/${dzenMatch[1]}` };
    
    // Одноклассники (ok.ru)
    const okMatch = content.match(/ok\.ru\/video\/(\d+)/);
    if (okMatch) return { type: 'url', value: `https://ok.ru/videoembed/${okMatch[1]}` };
    
    // Mail.ru Video
    const mailMatch = content.match(/my\.mail\.ru\/(?:mail|bk|inbox|list)\/([^\/]+)\/video\/([^\/]+)\/(\d+)/);
    if (mailMatch) return { type: 'url', value: `https://my.mail.ru/video/embed/${mailMatch[3]}` };
    
    // Yandex Video (yandex.ru/video)
    const yandexMatch = content.match(/yandex\.ru\/video\/preview\/(\d+)/);
    if (yandexMatch) return { type: 'url', value: `https://yandex.ru/video/preview/${yandexMatch[1]}` };
    
    // Fallback: if URL looks like a direct video file, try embedding
    if (content.match(/^https?:\/\/.+\.(mp4|webm|ogg)(\?.*)?$/i)) {
      return { type: 'url', value: content };
    }
    
    // Generic video URLs - try direct embed for recording services
    if (content.match(/^https?:\/\/.*\/recordings?\//i) || content.match(/^https?:\/\/.*\/video\//i)) {
      return { type: 'url', value: content };
    }

    return { type: null, value: null };
  };

  const embedResult = getEmbedFromContent(block.videoUrl || "");
  const hasValidEmbed = embedResult.type !== null;

  return (
    <div className="py-2">
      {hasValidEmbed ? (
        <div className="space-y-2">
          <div className="relative group/video aspect-video bg-black rounded-lg overflow-hidden">
            {embedResult.type === 'iframe' ? (
              <div 
                className="w-full h-full [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:border-0"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(embedResult.value || '', {
                  ALLOWED_TAGS: ['iframe'],
                  ALLOWED_ATTR: ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'title', 'referrerpolicy'],
                }) }}
              />
            ) : (
              <iframe 
                src={embedResult.value || ''} 
                className="w-full h-full border-0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                allowFullScreen 
              />
            )}
            <Button 
              variant="secondary" 
              size="sm" 
              className="absolute top-2 right-2 opacity-0 group-hover/video:opacity-100" 
              onClick={() => onUpdate({ videoUrl: "" })}
            >
              Удалить
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-muted rounded-xl p-6 space-y-4">
          <div className="text-center">
            <Video className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-2">Добавьте видео по ссылке или вставьте embed код</p>
            <p className="text-xs text-muted-foreground/70">YouTube, Vimeo, Rutube, VK, Дзен, OK.ru, Mail.ru или &lt;iframe&gt;</p>
          </div>
          <Textarea 
            value={block.videoUrl || ""} 
            onChange={(e) => onUpdate({ videoUrl: e.target.value })} 
            placeholder="https://youtube.com/watch?v=... или <iframe>...</iframe>" 
            className="text-sm min-h-[80px] resize-none"
          />
        </div>
      )}
    </div>
  );
}

function SliderBlock({ block, onUpdate }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slides = block.sliderSlides || [];
  const currentIndex = block.sliderCurrentIndex || 0;

  const parsePptxFile = async (file: File): Promise<SliderSlide[]> => {
    const JSZip = (await import('jszip')).default;
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    const slidesArray: SliderSlide[] = [];
    
    // Extract all images from ppt/media folder and create data URLs
    const mediaFiles: Record<string, string> = {};
    const mediaEntries = Object.keys(zip.files).filter(name => name.startsWith('ppt/media/'));
    
    for (const mediaPath of mediaEntries) {
      try {
        const mediaFile = zip.files[mediaPath];
        if (mediaFile && !mediaFile.dir) {
          const blob = await mediaFile.async('blob');
          const fileName = mediaPath.split('/').pop() || '';
          const ext = fileName.split('.').pop()?.toLowerCase();
          
          // Determine MIME type
          let mimeType = 'image/png';
          if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
          else if (ext === 'gif') mimeType = 'image/gif';
          else if (ext === 'svg') mimeType = 'image/svg+xml';
          else if (ext === 'webp') mimeType = 'image/webp';
          
          // Convert to data URL
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(new Blob([blob], { type: mimeType }));
          });
          
          mediaFiles[fileName] = dataUrl;
        }
      } catch (err) {
        console.warn('Failed to extract media:', mediaPath, err);
      }
    }
    
    // Find all slide XML files
    const slideFiles = Object.keys(zip.files)
      .filter(name => name.match(/ppt\/slides\/slide\d+\.xml$/))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)\.xml$/)?.[1] || '0');
        const numB = parseInt(b.match(/slide(\d+)\.xml$/)?.[1] || '0');
        return numA - numB;
      });

    for (const slideFile of slideFiles) {
      const slideNum = slideFile.match(/slide(\d+)\.xml$/)?.[1] || '1';
      const content = await zip.files[slideFile].async('string');
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'application/xml');
      
      // Extract text from slide
      const textNodes = doc.querySelectorAll('a\\:t, t');
      const texts: string[] = [];
      textNodes.forEach(node => {
        const text = node.textContent?.trim();
        if (text) texts.push(text);
      });
      
      // Try to find image references in slide relationships
      let slideImageUrl: string | undefined;
      
      // Check slide relationships file for image references
      const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
      if (zip.files[relsPath]) {
        try {
          const relsContent = await zip.files[relsPath].async('string');
          const relsDoc = parser.parseFromString(relsContent, 'application/xml');
          const relationships = relsDoc.querySelectorAll('Relationship');
          
          for (const rel of Array.from(relationships)) {
            const target = rel.getAttribute('Target');
            const type = rel.getAttribute('Type');
            
            // Check if it's an image relationship
            if (type?.includes('/image') && target) {
              const imageName = target.replace('../media/', '');
              if (mediaFiles[imageName]) {
                slideImageUrl = mediaFiles[imageName];
                break; // Use the first image found
              }
            }
          }
        } catch (err) {
          console.warn('Failed to parse rels for slide:', slideNum, err);
        }
      }
      
      // Create slide even if no text (might have image)
      if (texts.length > 0 || slideImageUrl) {
        const title = texts[0] || `Слайд ${slideNum}`;
        const slideContent = texts.slice(1).join('\n');
        slidesArray.push({
          id: crypto.randomUUID(),
          title,
          content: slideContent,
          imageUrl: slideImageUrl
        });
      }
    }
    
    return slidesArray;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.toLowerCase().split('.').pop();
    if (ext !== 'pptx') {
      setError('Поддерживается только формат PPTX');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const parsedSlides = await parsePptxFile(file);
      if (parsedSlides.length === 0) {
        setError('Не удалось извлечь слайды из презентации');
        return;
      }
      onUpdate({ 
        sliderSlides: parsedSlides, 
        sliderCurrentIndex: 0,
        content: file.name
      });
    } catch (err) {
      console.error('Error parsing PPTX:', err);
      setError('Ошибка при обработке файла');
    } finally {
      setIsLoading(false);
    }
  };

  const goToSlide = (index: number) => {
    if (index >= 0 && index < slides.length) {
      onUpdate({ sliderCurrentIndex: index });
    }
  };

  const removeSlider = () => {
    onUpdate({ sliderSlides: [], sliderCurrentIndex: 0, content: '' });
  };

  if (slides.length === 0) {
    return (
      <div className="py-2">
        <div className="bg-muted rounded-xl p-6 space-y-4">
          <div className="text-center">
            <Presentation className="w-8 h-8 mx-auto mb-2 text-orange-500" />
            <p className="text-sm text-muted-foreground mb-2">Загрузите презентацию PPTX</p>
            <p className="text-xs text-muted-foreground/70">Слайды будут отображаться как интерактивный слайдер</p>
          </div>
          {error && (
            <div className="text-sm text-destructive text-center">{error}</div>
          )}
          <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="w-5 h-5 text-muted-foreground" />
            )}
            <span className="text-sm text-muted-foreground">
              {isLoading ? 'Обработка...' : 'Выбрать файл PPTX'}
            </span>
            <input
              type="file"
              accept=".pptx"
              onChange={handleFileUpload}
              className="hidden"
              disabled={isLoading}
            />
          </label>
        </div>
      </div>
    );
  }

  const currentSlide = slides[currentIndex];

  return (
    <div className="py-2">
      <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-orange-500/20">
          <div className="flex items-center gap-2 text-orange-500">
            <Presentation className="w-5 h-5" />
            <span className="font-medium text-sm">{block.content || 'Презентация'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {currentIndex + 1} / {slides.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-destructive hover:text-destructive"
              onClick={removeSlider}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        <div className="p-6 min-h-[250px]">
          {currentSlide && (
            <div className="space-y-4">
              {currentSlide.imageUrl && (
                <div className="rounded-lg overflow-hidden border border-border bg-secondary/20">
                  <img 
                    src={currentSlide.imageUrl} 
                    alt={currentSlide.title || 'Слайд'} 
                    className="w-full max-h-[400px] object-contain"
                  />
                </div>
              )}
              <h3 className="text-lg font-semibold">{currentSlide.title}</h3>
              {currentSlide.content && (
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {currentSlide.content}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-3 border-t border-orange-500/20 bg-orange-500/5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goToSlide(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            Назад
          </Button>
          
          <div className="flex gap-1">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => goToSlide(i)}
                className={cn(
                  "w-2 h-2 rounded-full transition-colors",
                  i === currentIndex ? "bg-orange-500" : "bg-orange-500/30 hover:bg-orange-500/50"
                )}
              />
            ))}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => goToSlide(currentIndex + 1)}
            disabled={currentIndex === slides.length - 1}
            className="gap-1"
          >
            Далее
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function AIGenerateButton({ isGenerating, onClick }: { isGenerating: boolean; onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={isGenerating} className="gap-2 text-xs">
      {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
      {isGenerating ? "Генерация..." : "Сгенерировать с ИИ"}
    </Button>
  );
}

function QuoteBlock({ block, onUpdate, courseTitle, lessonTitle, existingContent }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void; courseTitle?: string; lessonTitle?: string; existingContent?: string }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.functions.invoke("generate-course-content", {
        body: { contentType: "quote", lessonTitle: lessonTitle || "Общая тема", courseTitle: courseTitle || "Курс", existingContent },
      });
      if (error) throw error;
      if (data?.content) onUpdate({ content: data.content });
    } catch (e) {
      console.error("Quote AI error:", e);
      const { toast } = await import("sonner");
      toast.error("Ошибка генерации цитаты");
    } finally { setIsGenerating(false); }
  };
  return (
    <div className="border-l-4 border-muted-foreground/30 pl-4 py-2 space-y-2">
      <div className="flex justify-end">
        <AIGenerateButton isGenerating={isGenerating} onClick={handleGenerate} />
      </div>
      <RichTextEditor value={block.content} onChange={(val) => onUpdate({ content: val })} placeholder="Введите цитату..." className="italic text-muted-foreground" />
    </div>
  );
}

function CalloutBlock({ block, onUpdate, courseTitle, lessonTitle, existingContent }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void; courseTitle?: string; lessonTitle?: string; existingContent?: string }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const styles = {
    "callout-info": { bg: "bg-blue-500/10", border: "border-blue-500/30", icon: AlertCircle, iconColor: "text-blue-500" },
    "callout-warning": { bg: "bg-amber-500/10", border: "border-amber-500/30", icon: AlertCircle, iconColor: "text-amber-500" },
    "callout-tip": { bg: "bg-green-500/10", border: "border-green-500/30", icon: Lightbulb, iconColor: "text-green-500" },
  };
  const style = styles[block.type as keyof typeof styles];
  const Icon = style.icon;

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.functions.invoke("generate-course-content", {
        body: { contentType: "callout", calloutType: block.type, lessonTitle: lessonTitle || "Общая тема", courseTitle: courseTitle || "Курс", existingContent },
      });
      if (error) throw error;
      if (data?.content) onUpdate({ content: data.content });
    } catch (e) {
      console.error("Callout AI error:", e);
      const { toast } = await import("sonner");
      toast.error("Ошибка генерации");
    } finally { setIsGenerating(false); }
  };

  return (
    <div className={cn("rounded-xl p-4 border", style.bg, style.border)}>
      <div className="flex items-center justify-between mb-2">
        <Icon className={cn("w-5 h-5 flex-shrink-0", style.iconColor)} />
        <AIGenerateButton isGenerating={isGenerating} onClick={handleGenerate} />
      </div>
      <RichTextEditor value={block.content} onChange={(val) => onUpdate({ content: val })} placeholder="Введите текст..." minHeight="40px" />
    </div>
  );
}

function AccordionBlock({ block, onUpdate, courseTitle, lessonTitle, existingContent }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void; courseTitle?: string; lessonTitle?: string; existingContent?: string }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const isOpen = block.accordionOpen ?? true;

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.functions.invoke("generate-course-content", {
        body: { contentType: "accordion", lessonTitle: lessonTitle || "Общая тема", courseTitle: courseTitle || "Курс", existingContent },
      });
      if (error) throw error;
      if (data?.accordion) {
        onUpdate({ accordionTitle: data.accordion.title || block.accordionTitle, content: data.accordion.content || "" });
      }
    } catch (e) {
      console.error("Accordion AI error:", e);
      const { toast } = await import("sonner");
      toast.error("Ошибка генерации");
    } finally { setIsGenerating(false); }
  };

  return (
    <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 overflow-hidden">
      <div className="flex items-center gap-2 p-3 cursor-pointer hover:bg-purple-500/10" onClick={() => onUpdate({ accordionOpen: !isOpen })}>
        {isOpen ? <ChevronDown className="w-4 h-4 text-purple-500" /> : <ChevronRight className="w-4 h-4 text-purple-500" />}
        <Input value={block.accordionTitle || ""} onChange={(e) => { e.stopPropagation(); onUpdate({ accordionTitle: e.target.value }); }} onClick={(e) => e.stopPropagation()} placeholder="Заголовок секции" className="border-0 bg-transparent focus-visible:ring-0 px-0 font-medium flex-1" />
        <div onClick={(e) => e.stopPropagation()}>
          <AIGenerateButton isGenerating={isGenerating} onClick={handleGenerate} />
        </div>
      </div>
      {isOpen && (
        <div className="p-3 pt-0 border-t border-purple-500/20">
          <RichTextEditor value={block.content} onChange={(val) => onUpdate({ content: val })} placeholder="Скрытое содержимое..." minHeight="80px" />
        </div>
      )}
    </div>
  );
}

function QuizBlock({ block, onUpdate, courseTitle, lessonTitle, existingContent }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void; courseTitle?: string; lessonTitle?: string; existingContent?: string }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const options = block.quizOptions || [{ text: "", isCorrect: true }, { text: "", isCorrect: false }];

  const updateOption = (index: number, updates: Partial<QuizOption>) => {
    const newOptions = options.map((opt, i) => i === index ? { ...opt, ...updates } : updates.isCorrect ? { ...opt, isCorrect: false } : opt);
    onUpdate({ quizOptions: newOptions });
  };

  const addOption = () => onUpdate({ quizOptions: [...options, { text: "", isCorrect: false }] });
  const removeOption = (index: number) => { if (options.length > 2) onUpdate({ quizOptions: options.filter((_, i) => i !== index) }); };

  const handleGenerateWithAI = async () => {
    setIsGenerating(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.functions.invoke("generate-course-content", {
        body: { contentType: "quiz", lessonTitle: lessonTitle || block.quizQuestion || "Общий вопрос по теме", courseTitle: courseTitle || "Курс", existingContent },
      });
      if (error) throw error;
      if (data?.quiz) {
        const q = data.quiz;
        onUpdate({
          quizQuestion: q.question || "",
          quizOptions: (q.options || []).map((o: any) => ({ text: o.text, isCorrect: !!o.isCorrect })),
          quizExplanation: q.explanation || "",
        });
      }
    } catch (e) {
      console.error("Quiz AI generation error:", e);
      const { toast } = await import("sonner");
      toast.error("Ошибка генерации квиза");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary">
          <HelpCircle className="w-5 h-5" />
          <span className="font-medium">Мини-квиз</span>
        </div>
        <Button variant="outline" size="sm" onClick={handleGenerateWithAI} disabled={isGenerating} className="gap-2 text-xs">
          {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {isGenerating ? "Генерация..." : "Сгенерировать с ИИ"}
        </Button>
      </div>
      <Input value={block.quizQuestion || ""} onChange={(e) => onUpdate({ quizQuestion: e.target.value })} placeholder="Введите вопрос..." className="font-medium" />
      <div className="space-y-2">
        {options.map((option, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="radio" checked={option.isCorrect} onChange={() => updateOption(i, { isCorrect: true })} className="w-4 h-4 text-primary" />
            <Input value={option.text} onChange={(e) => updateOption(i, { text: e.target.value })} placeholder={`Вариант ${i + 1}`} className="flex-1" />
            {options.length > 2 && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeOption(i)}><Trash2 className="w-4 h-4" /></Button>
            )}
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" onClick={addOption} className="gap-2"><Plus className="w-4 h-4" />Добавить вариант</Button>
      <Textarea value={block.quizExplanation || ""} onChange={(e) => onUpdate({ quizExplanation: e.target.value })} placeholder="Пояснение к правильному ответу (опционально)" className="min-h-[40px] text-sm bg-white/50 dark:bg-black/20" />
    </div>
  );
}

// Read-only renderer
export function BlockRenderer({ blocks }: { blocks: ContentBlock[] }) {
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<Record<string, boolean>>({});
  const [sliderIndices, setSliderIndices] = useState<Record<string, number>>({});

  return (
    <div className="prose prose-sm max-w-none dark:prose-invert space-y-4">
      {blocks.map((block) => (
        <RenderBlock
          key={block.id}
          block={block}
          quizAnswer={quizAnswers[block.id]}
          quizSubmitted={quizSubmitted[block.id]}
          onQuizAnswer={(index) => setQuizAnswers(prev => ({ ...prev, [block.id]: index }))}
          onQuizSubmit={() => setQuizSubmitted(prev => ({ ...prev, [block.id]: true }))}
          sliderIndex={sliderIndices[block.id] ?? (block.sliderCurrentIndex || 0)}
          onSliderChange={(index) => setSliderIndices(prev => ({ ...prev, [block.id]: index }))}
        />
      ))}
    </div>
  );
}

function RenderBlock({ block, quizAnswer, quizSubmitted, onQuizAnswer, onQuizSubmit, sliderIndex, onSliderChange }: { 
  block: ContentBlock; 
  quizAnswer?: number; 
  quizSubmitted?: boolean; 
  onQuizAnswer: (index: number) => void; 
  onQuizSubmit: () => void;
  sliderIndex?: number;
  onSliderChange?: (index: number) => void;
}) {
  const [accordionOpen, setAccordionOpen] = useState(false);

  const getBlockStyleClasses = () => {
    const classes: string[] = [];
    if (block.textAlign === 'center') classes.push('text-center');
    if (block.textAlign === 'right') classes.push('text-right');
    if (block.textSize === 'sm') classes.push('text-sm');
    if (block.textSize === 'lg') classes.push('text-lg');
    if (block.bold) classes.push('font-bold');
    if (block.italic) classes.push('italic');
    if (block.strikethrough) classes.push('line-through');
    if (block.underline) classes.push('underline');
    if (block.uppercase) classes.push('uppercase');
    if (block.lineHeight === 'tight') classes.push('leading-tight');
    if (block.lineHeight === 'relaxed') classes.push('leading-relaxed');
    if (block.textColor) {
      const preset = textColorPresets.find(p => p.value === block.textColor);
      if (preset?.class) classes.push(preset.class);
    }
    if (block.bgColor) {
      const preset = bgColorPresets.find(p => p.value === block.bgColor);
      if (preset?.class) classes.push(preset.class, 'rounded-lg', 'p-3');
    }
    return classes.join(' ');
  };

  const styleClasses = getBlockStyleClasses();

  switch (block.type) {
    case "paragraph":
      return <p className={styleClasses} dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.content) }} />;
    case "heading1":
      return <h1 className={cn("text-2xl font-bold", styleClasses)}>{block.content}</h1>;
    case "heading2":
      return <h2 className={cn("text-xl font-semibold", styleClasses)}>{block.content}</h2>;
    case "bulletList":
      return <ul className={cn("list-disc pl-6", styleClasses)}>{(block.content || "").split("\n").filter(Boolean).map((item, i) => <li key={i}>{item}</li>)}</ul>;
    case "numberedList":
      return <ol className={cn("list-decimal pl-6", styleClasses)}>{(block.content || "").split("\n").filter(Boolean).map((item, i) => <li key={i}>{item}</li>)}</ol>;
    case "quote":
      return <blockquote className={cn("border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground", styleClasses)}>{block.content}</blockquote>;
    case "callout-info":
      return <div className={cn("rounded-xl p-4 bg-blue-500/10 border border-blue-500/30 flex gap-3 not-prose", styleClasses)}><AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0" /><p className="text-sm">{block.content}</p></div>;
    case "callout-warning":
      return <div className={cn("rounded-xl p-4 bg-amber-500/10 border border-amber-500/30 flex gap-3 not-prose", styleClasses)}><AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" /><p className="text-sm">{block.content}</p></div>;
    case "callout-tip":
      return <div className={cn("rounded-xl p-4 bg-green-500/10 border border-green-500/30 flex gap-3 not-prose", styleClasses)}><Lightbulb className="w-5 h-5 text-green-500 flex-shrink-0" /><p className="text-sm">{block.content}</p></div>;
    case "accordion":
      return (
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 overflow-hidden not-prose">
          <button className="w-full flex items-center gap-2 p-3 text-left hover:bg-purple-500/10" onClick={() => setAccordionOpen(!accordionOpen)}>
            {accordionOpen ? <ChevronDown className="w-4 h-4 text-purple-500" /> : <ChevronRight className="w-4 h-4 text-purple-500" />}
            <span className="font-medium">{block.accordionTitle}</span>
          </button>
          {accordionOpen && <div className="p-3 pt-0 border-t border-purple-500/20"><p className="text-sm">{block.content}</p></div>}
        </div>
      );
    case "divider":
      return <hr className="border-border my-2" />;
    case "quiz":
      const options = block.quizOptions || [];
      const correctIndex = options.findIndex(o => o.isCorrect);
      const isCorrect = quizSubmitted && quizAnswer === correctIndex;
      return (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3 not-prose">
          <div className="flex items-center gap-2 text-primary"><HelpCircle className="w-5 h-5" /><span className="font-medium">Проверьте себя</span></div>
          <p className="font-medium">{block.quizQuestion}</p>
          <div className="space-y-2">
            {options.map((option, i) => (
              <button key={i} onClick={() => onQuizAnswer(i)} disabled={quizSubmitted} className={cn("w-full text-left p-3 rounded-lg border transition-all", quizAnswer === i && !quizSubmitted && "border-primary bg-primary/10", quizSubmitted && option.isCorrect && "border-green-500 bg-green-500/10", quizSubmitted && quizAnswer === i && !option.isCorrect && "border-destructive bg-destructive/10", !quizSubmitted && quizAnswer !== i && "border-border hover:border-primary/50")}>
                {option.text}
              </button>
            ))}
          </div>
          {!quizSubmitted && quizAnswer !== undefined && <Button onClick={onQuizSubmit} size="sm">Проверить</Button>}
          {quizSubmitted && <div className={cn("p-3 rounded-lg text-sm", isCorrect ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-destructive/10 text-destructive")}>{isCorrect ? "Правильно! " : "Неправильно. "}{block.quizExplanation}</div>}
        </div>
      );
    case "image":
      return block.imageSrc ? <img src={block.imageSrc} alt={block.imageAlt || ""} className="rounded-lg max-w-full h-auto not-prose" /> : null;
    case "video":
      const embedUrl = block.videoUrl?.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/)?.[1];
      return embedUrl ? <div className="aspect-video not-prose"><iframe src={`https://www.youtube.com/embed/${embedUrl}`} className="w-full h-full rounded-lg" allowFullScreen /></div> : null;
    case "slider":
      const slides = block.sliderSlides || [];
      const currentIdx = sliderIndex ?? 0;
      const currentSlide = slides[currentIdx];
      if (slides.length === 0) return null;
      return (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 overflow-hidden not-prose">
          <div className="flex items-center justify-between p-3 border-b border-orange-500/20">
            <div className="flex items-center gap-2 text-orange-500">
              <Presentation className="w-5 h-5" />
              <span className="font-medium text-sm">{block.content || 'Презентация'}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {currentIdx + 1} / {slides.length}
            </span>
          </div>
          <div className="p-6 min-h-[250px]">
            {currentSlide && (
              <div className="space-y-4">
                {currentSlide.imageUrl && (
                  <div className="rounded-lg overflow-hidden border border-border bg-secondary/20">
                    <img 
                      src={currentSlide.imageUrl} 
                      alt={currentSlide.title || 'Слайд'} 
                      className="w-full max-h-[400px] object-contain"
                    />
                  </div>
                )}
                <h3 className="text-lg font-semibold">{currentSlide.title}</h3>
                {currentSlide.content && (
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {currentSlide.content}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between p-3 border-t border-orange-500/20 bg-orange-500/5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSliderChange?.(currentIdx - 1)}
              disabled={currentIdx === 0}
              className="gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Назад
            </Button>
            <div className="flex gap-1">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => onSliderChange?.(i)}
                  className={cn(
                    "w-2 h-2 rounded-full transition-colors",
                    i === currentIdx ? "bg-orange-500" : "bg-orange-500/30 hover:bg-orange-500/50"
                  )}
                />
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSliderChange?.(currentIdx + 1)}
              disabled={currentIdx === slides.length - 1}
              className="gap-1"
            >
              Далее
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      );
    default:
      return null;
  }
}

export function blocksToJson(blocks: ContentBlock[]): string {
  return JSON.stringify(blocks);
}

export function jsonToBlocks(json: string): ContentBlock[] {
  try { return JSON.parse(json); } catch { return []; }
}

export function htmlToBlocks(html: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const processNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) {
        blocks.push({ id: crypto.randomUUID(), type: "paragraph", content: text });
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    const tagName = el.tagName.toLowerCase();

    switch (tagName) {
      case "h1":
        blocks.push({ id: crypto.randomUUID(), type: "heading1", content: el.textContent || "" });
        break;
      case "h2":
      case "h3":
        blocks.push({ id: crypto.randomUUID(), type: "heading2", content: el.textContent || "" });
        break;
      case "p":
        const imgInP = el.querySelector("img");
        if (imgInP && el.childNodes.length === 1) {
          blocks.push({ id: crypto.randomUUID(), type: "image", content: "", imageSrc: imgInP.getAttribute("src") || "", imageAlt: imgInP.getAttribute("alt") || "" });
        } else {
          blocks.push({ id: crypto.randomUUID(), type: "paragraph", content: el.innerHTML || "" });
        }
        break;
      case "ul":
        const bulletItems = Array.from(el.querySelectorAll(":scope > li")).map(li => li.innerHTML || "").join("\n");
        blocks.push({ id: crypto.randomUUID(), type: "bulletList", content: bulletItems });
        break;
      case "ol":
        const numberedItems = Array.from(el.querySelectorAll(":scope > li")).map(li => li.innerHTML || "").join("\n");
        blocks.push({ id: crypto.randomUUID(), type: "numberedList", content: numberedItems });
        break;
      case "blockquote":
        blocks.push({ id: crypto.randomUUID(), type: "quote", content: el.innerHTML || "" });
        break;
      case "img":
        blocks.push({ id: crypto.randomUUID(), type: "image", content: "", imageSrc: el.getAttribute("src") || "", imageAlt: el.getAttribute("alt") || "" });
        break;
      case "div":
      case "section":
      case "article":
      case "span":
        el.childNodes.forEach(processNode);
        break;
      default:
        el.childNodes.forEach(processNode);
    }
  };

  doc.body.childNodes.forEach(processNode);

  return blocks.filter(b => b.content || b.imageSrc || b.type === "quiz" || b.type === "accordion" || b.type === "image");
}
