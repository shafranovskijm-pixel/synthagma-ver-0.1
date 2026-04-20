import {
  Type, Heading1, Heading2, Heading3, Heading4, List, ListOrdered, Quote,
  AlertCircle, Lightbulb, HelpCircle, ChevronDown,
  Image as ImageIcon, Video, Headphones, Presentation,
  Minus, BookOpen, CheckCircle, XCircle, Highlighter,
  Table as TableIcon, MousePointerClick, Code as CodeIcon, Sigma, Globe, Sparkles,
} from "lucide-react";

export type BlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "bulletList"
  | "numberedList"
  | "quote"
  | "callout-info"
  | "callout-warning"
  | "callout-tip"
  | "callout-success"
  | "callout-danger"
  | "highlight"
  | "accordion"
  | "quiz"
  | "image"
  | "video"
  | "audio"
  | "slider"
  | "divider"
  | "document"
  | "table"
  | "button"
  | "embed"
  | "code"
  | "formula";

// Special "shortcut" types — not real blocks. They map to a real block + open AI dialog.
export type AIShortcutType = "ai-image" | "ai-audio" | "ai-quiz";

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
  /** Optional bold heading shown above the body inside callout/highlight blocks. */
  calloutTitle?: string;
  quizQuestion?: string;
  quizOptions?: QuizOption[];
  quizExplanation?: string;
  imageSrc?: string;
  imageAlt?: string;
  videoUrl?: string;
  audioUrl?: string;
  documentUrl?: string;
  documentName?: string;
  sliderSlides?: SliderSlide[];
  sliderCurrentIndex?: number;
  // Table
  tableRows?: string[][];
  tableHasHeader?: boolean;
  // Button
  buttonLabel?: string;
  buttonUrl?: string;
  buttonVariant?: 'primary' | 'outline' | 'ghost';
  buttonAlign?: 'left' | 'center' | 'right';
  // Embed
  embedUrl?: string;
  embedHeight?: number;
  // Code
  codeLanguage?: string;
  // Formula
  formulaDisplayMode?: 'inline' | 'block';
  // Common style
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
  fontFamily?: 'sans' | 'mono';
  borderStyle?: 'none' | 'thin' | 'bold' | 'dashed';
  borderRadius?: 'none' | 'md' | 'xl';
  // Pending AI action — set when block was created via AI shortcut
  pendingAI?: AIShortcutType;
}

export interface BlockEditorProps {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  readOnly?: boolean;
  courseTitle?: string;
  lessonTitle?: string;
  organizationId?: string;
  courseId?: string;
  lessonId?: string;
}

export const blockTypeConfig: Record<BlockType, { icon: any; label: string; color: string }> = {
  paragraph: { icon: Type, label: "Текст", color: "text-foreground" },
  heading1: { icon: Heading1, label: "Заголовок 1", color: "text-foreground" },
  heading2: { icon: Heading2, label: "Заголовок 2", color: "text-foreground" },
  heading3: { icon: Heading3, label: "Заголовок 3", color: "text-foreground" },
  heading4: { icon: Heading4, label: "Заголовок 4", color: "text-foreground" },
  bulletList: { icon: List, label: "Маркированный список", color: "text-foreground" },
  numberedList: { icon: ListOrdered, label: "Нумерованный список", color: "text-foreground" },
  quote: { icon: Quote, label: "Цитата", color: "text-muted-foreground" },
  "callout-info": { icon: AlertCircle, label: "Информация", color: "text-blue-500" },
  "callout-warning": { icon: AlertCircle, label: "Предупреждение", color: "text-amber-500" },
  "callout-tip": { icon: Lightbulb, label: "Совет", color: "text-green-500" },
  "callout-success": { icon: CheckCircle, label: "Выполнено", color: "text-emerald-500" },
  "callout-danger": { icon: XCircle, label: "Ошибка", color: "text-red-500" },
  highlight: { icon: Highlighter, label: "Выделение", color: "text-yellow-500" },
  accordion: { icon: ChevronDown, label: "Сворачиваемая секция", color: "text-purple-500" },
  quiz: { icon: HelpCircle, label: "Мини-квиз", color: "text-primary" },
  image: { icon: ImageIcon, label: "Картинка", color: "text-green-500" },
  video: { icon: Video, label: "Видео", color: "text-red-500" },
  audio: { icon: Headphones, label: "Аудио", color: "text-teal-500" },
  slider: { icon: Presentation, label: "Презентация", color: "text-orange-500" },
  divider: { icon: Minus, label: "Разделитель", color: "text-muted-foreground" },
  document: { icon: BookOpen, label: "Файл", color: "text-indigo-500" },
  table: { icon: TableIcon, label: "Таблица", color: "text-blue-500" },
  button: { icon: MousePointerClick, label: "Кнопка", color: "text-primary" },
  embed: { icon: Globe, label: "Embed", color: "text-purple-500" },
  code: { icon: CodeIcon, label: "Код", color: "text-green-600" },
  formula: { icon: Sigma, label: "Формула", color: "text-orange-500" },
};

export const createBlock = (type: BlockType): ContentBlock => ({
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
  ...(type === "audio" && { audioUrl: "" }),
  ...(type === "slider" && { sliderSlides: [], sliderCurrentIndex: 0 }),
  ...(type === "document" && { documentUrl: "", documentName: "" }),
  ...(type === "table" && {
    tableHasHeader: true,
    tableRows: [
      ["Колонка 1", "Колонка 2", "Колонка 3"],
      ["", "", ""],
      ["", "", ""],
    ],
  }),
  ...(type === "button" && {
    buttonLabel: "Нажмите",
    buttonUrl: "",
    buttonVariant: "primary",
    buttonAlign: "left",
  }),
  ...(type === "embed" && { embedUrl: "", embedHeight: 480 }),
  ...(type === "code" && { codeLanguage: "plaintext", fontFamily: "mono" }),
  ...(type === "formula" && { formulaDisplayMode: "block" }),
});

// Legacy export — kept to avoid breaking imports. Empty list → not used in the new picker.
export const calloutItems: { type: BlockType; icon: any; label: string; color?: string }[] = [];

// AI shortcuts — display in the picker, but on click create a real block + trigger AI flow.
export interface AIShortcut {
  type: AIShortcutType;
  realType: BlockType;
  icon: any;
  label: string;
  description: string;
}

export const aiShortcuts: AIShortcut[] = [
  { type: "ai-image", realType: "image", icon: Sparkles, label: "AI-картинка", description: "Сгенерируйте уникальное изображение через ИИ по описанию." },
  { type: "ai-audio", realType: "paragraph", icon: Sparkles, label: "AI-озвучка", description: "Введите или сгенерируйте текст и превратите его в аудио." },
  { type: "ai-quiz", realType: "quiz", icon: Sparkles, label: "AI-тест", description: "ИИ создаст вопрос с вариантами ответа по теме урока." },
];

// New block picker layout — clean, SkillSpace-style.
export const blockCategories = {
  basic: {
    label: "Основные",
    items: [
      { type: "paragraph" as BlockType, icon: Type, label: "Текст" },
      { type: "video" as BlockType, icon: Video, label: "Видео", color: "text-red-500" },
      { type: "image" as BlockType, icon: ImageIcon, label: "Картинка", color: "text-green-500" },
      { type: "document" as BlockType, icon: BookOpen, label: "Файл", color: "text-indigo-500" },
      { type: "slider" as BlockType, icon: Presentation, label: "Презентация", color: "text-orange-500" },
      { type: "audio" as BlockType, icon: Headphones, label: "Аудио", color: "text-teal-500" },
      { type: "table" as BlockType, icon: TableIcon, label: "Таблица", color: "text-blue-500" },
      { type: "button" as BlockType, icon: MousePointerClick, label: "Кнопка", color: "text-primary" },
      { type: "embed" as BlockType, icon: Globe, label: "Embed", color: "text-purple-500" },
      { type: "code" as BlockType, icon: CodeIcon, label: "Код", color: "text-green-600" },
      { type: "formula" as BlockType, icon: Sigma, label: "Формула", color: "text-orange-500" },
    ],
  },
  interactive: {
    label: "Интерактив",
    items: [
      { type: "quiz" as BlockType, icon: HelpCircle, label: "Мини-квиз", color: "text-primary" },
      { type: "accordion" as BlockType, icon: ChevronDown, label: "Свор. секция", color: "text-purple-500" },
      { type: "divider" as BlockType, icon: Minus, label: "Разделитель", color: "text-muted-foreground" },
    ],
  },
};

export const blockDescriptions: Record<BlockType, string> = {
  paragraph: "Обычный текст для основного содержания урока.",
  heading1: "Крупный заголовок раздела для разделения смысловых частей.",
  heading2: "Подзаголовок для группировки связанных абзацев.",
  heading3: "Заголовок третьего уровня для подразделов.",
  heading4: "Самый мелкий заголовок — для коротких смысловых блоков.",
  bulletList: "Маркированный список — перечисление без порядка.",
  numberedList: "Нумерованный список — пошаговая инструкция или порядок.",
  quote: "Цитата — выделенный текст со ссылкой на источник или мысль.",
  "callout-info": "Информационный блок для важных пояснений.",
  "callout-warning": "Предупреждение — обращает внимание на риски и важные моменты.",
  "callout-tip": "Совет — полезная подсказка или рекомендация.",
  "callout-success": "Подтверждение — отметка о выполненном или верном.",
  "callout-danger": "Ошибка — выделяет критичную информацию или запрет.",
  highlight: "Выделение — подсветка ключевой фразы цветом.",
  accordion: "Сворачиваемая секция для длинных пояснений и FAQ.",
  quiz: "Мини-квиз с вариантами ответа и пояснением.",
  image: "Изображение из библиотеки или загруженный файл.",
  video: "Видеоплеер с поддержкой Kinescope, YouTube и прямых ссылок.",
  audio: "Аудиоблок — подкаст, озвучка или фрагмент лекции.",
  slider: "Слайдер презентации с пошаговым переключением.",
  divider: "Горизонтальный разделитель между смысловыми блоками.",
  document: "Документ для скачивания: PDF, DOCX и другие файлы.",
  table: "Таблица с заголовками и редактируемыми ячейками.",
  button: "Кнопка с текстом и ссылкой — призыв к действию.",
  embed: "Вставка внешнего контента: YouTube, Figma, Miro, CodePen и другие.",
  code: "Блок кода с моноширинным шрифтом и подсветкой языка.",
  formula: "Математическая формула в формате LaTeX (KaTeX).",
};

export const blockIconBg: Partial<Record<BlockType | AIShortcutType, string>> = {
  paragraph: "text-primary bg-primary/10",
  heading1: "text-primary bg-primary/10",
  heading2: "text-primary bg-primary/10",
  heading3: "text-primary bg-primary/10",
  heading4: "text-primary bg-primary/10",
  bulletList: "text-primary bg-primary/10",
  numberedList: "text-primary bg-primary/10",
  quote: "text-muted-foreground bg-muted",
  "callout-info": "text-blue-500 bg-blue-500/10",
  "callout-warning": "text-amber-500 bg-amber-500/10",
  "callout-tip": "text-green-500 bg-green-500/10",
  "callout-success": "text-emerald-500 bg-emerald-500/10",
  "callout-danger": "text-red-500 bg-red-500/10",
  highlight: "text-yellow-500 bg-yellow-500/10",
  accordion: "text-purple-500 bg-purple-500/10",
  quiz: "text-primary bg-primary/10",
  image: "text-green-500 bg-green-500/10",
  video: "text-red-500 bg-red-500/10",
  audio: "text-teal-500 bg-teal-500/10",
  slider: "text-orange-500 bg-orange-500/10",
  divider: "text-muted-foreground bg-muted",
  document: "text-indigo-500 bg-indigo-500/10",
  table: "text-blue-500 bg-blue-500/10",
  button: "text-primary bg-primary/10",
  embed: "text-purple-500 bg-purple-500/10",
  code: "text-green-600 bg-green-600/10",
  formula: "text-orange-500 bg-orange-500/10",
  "ai-image": "text-primary bg-gradient-to-br from-primary/20 to-purple-500/20",
  "ai-audio": "text-primary bg-gradient-to-br from-primary/20 to-teal-500/20",
  "ai-quiz": "text-primary bg-gradient-to-br from-primary/20 to-amber-500/20",
};

export const convertibleTypes: BlockType[] = ["paragraph", "heading1", "heading2", "heading3", "heading4", "bulletList", "numberedList", "quote", "callout-info", "callout-warning", "callout-tip", "callout-success", "callout-danger", "highlight", "accordion", "audio"];

export const textStyleableTypes: BlockType[] = ["paragraph", "heading1", "heading2", "heading3", "heading4", "bulletList", "numberedList", "quote", "callout-info", "callout-warning", "callout-tip", "callout-success", "callout-danger", "highlight"];

export const bgColorPresets = [
  { value: "", label: "Без фона", class: "" },
  { value: "gray", label: "Серый", class: "bg-muted" },
  { value: "blue", label: "Голубой", class: "bg-blue-50 dark:bg-blue-950/30" },
  { value: "yellow", label: "Жёлтый", class: "bg-yellow-50 dark:bg-yellow-950/30" },
  { value: "green", label: "Зелёный", class: "bg-green-50 dark:bg-green-950/30" },
  { value: "red", label: "Красный", class: "bg-red-50 dark:bg-red-950/30" },
];

export const bgColorDotStyles: Record<string, string> = {
  "": "bg-background border border-border",
  "gray": "bg-muted",
  "blue": "bg-blue-200 dark:bg-blue-800",
  "yellow": "bg-yellow-200 dark:bg-yellow-800",
  "green": "bg-green-200 dark:bg-green-800",
  "red": "bg-red-200 dark:bg-red-800",
};

export const textColorPresets = [
  { value: "", label: "По умолчанию", class: "", dot: "bg-foreground" },
  { value: "gray", label: "Серый", class: "text-gray-500", dot: "bg-gray-500" },
  { value: "blue", label: "Синий", class: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500" },
  { value: "red", label: "Красный", class: "text-red-600 dark:text-red-400", dot: "bg-red-500" },
  { value: "green", label: "Зелёный", class: "text-green-600 dark:text-green-400", dot: "bg-green-500" },
  { value: "purple", label: "Фиолетовый", class: "text-purple-600 dark:text-purple-400", dot: "bg-purple-500" },
  { value: "white", label: "Белый", class: "text-white", dot: "bg-white border border-border" },
];

// Style preset keys to save/apply
export const STYLE_PRESET_KEYS = ['textAlign', 'bgColor', 'textColor', 'textSize', 'bold', 'italic', 'strikethrough', 'underline', 'uppercase', 'lineHeight', 'fontFamily', 'borderStyle', 'borderRadius'] as const;
export type StylePreset = Pick<ContentBlock, typeof STYLE_PRESET_KEYS[number]>;

export const quickStyles: { name: string; icon: string; style: Partial<ContentBlock> }[] = [
  { name: "Акцент", icon: "💛", style: { bold: true, bgColor: "yellow", textColor: undefined, textSize: undefined, italic: false, uppercase: false, fontFamily: 'sans' } },
  { name: "Заметка", icon: "📝", style: { italic: true, textColor: "gray", textSize: "sm", textAlign: "right", bold: false, uppercase: false, bgColor: undefined, fontFamily: 'sans' } },
  { name: "Важно!", icon: "🔴", style: { bold: true, bgColor: "red", textColor: "white", textSize: "lg", italic: false, uppercase: false, fontFamily: 'sans' } },
  { name: "Код", icon: "💻", style: { fontFamily: "mono", bgColor: "gray", bold: false, italic: false, textColor: undefined, textSize: undefined, uppercase: false } },
  { name: "Маркер", icon: "🖍️", style: { bgColor: "yellow", bold: false, italic: false, textColor: undefined, textSize: undefined, uppercase: false, fontFamily: 'sans' } },
  { name: "Заголовок", icon: "📌", style: { bold: true, textSize: "lg", textAlign: "center", uppercase: true, italic: false, bgColor: undefined, textColor: undefined, fontFamily: 'sans' } },
];

export const wrapCalloutTargets: { type: BlockType; icon: any; label: string; color: string }[] = [
  { type: "callout-info", icon: AlertCircle, label: "Информация", color: "text-blue-500" },
  { type: "callout-warning", icon: Lightbulb, label: "Предупреждение", color: "text-amber-500" },
  { type: "callout-tip", icon: Lightbulb, label: "Совет", color: "text-green-500" },
  { type: "callout-success", icon: CheckCircle, label: "Выполнено", color: "text-emerald-500" },
  { type: "callout-danger", icon: XCircle, label: "Ошибка", color: "text-red-500" },
  { type: "highlight", icon: Highlighter, label: "Выделение", color: "text-yellow-500" },
  { type: "quote", icon: Quote, label: "Цитата", color: "text-muted-foreground" },
];

export const wrapOtherTargets: { type: BlockType; icon: any; label: string; color: string }[] = [
  { type: "paragraph", icon: Type, label: "Обычный текст", color: "text-foreground" },
  { type: "heading1", icon: Heading1, label: "Заголовок 1", color: "text-foreground" },
  { type: "heading2", icon: Heading2, label: "Заголовок 2", color: "text-foreground" },
  { type: "heading3", icon: Heading3, label: "Заголовок 3", color: "text-foreground" },
  { type: "heading4", icon: Heading4, label: "Заголовок 4", color: "text-foreground" },
  { type: "accordion", icon: ChevronDown, label: "Сворачиваемая секция", color: "text-purple-500" },
  { type: "audio", icon: Headphones, label: "Аудио (TTS)", color: "text-teal-500" },
];
