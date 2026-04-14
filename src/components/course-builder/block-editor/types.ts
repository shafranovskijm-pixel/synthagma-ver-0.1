import {
  Type, Heading1, Heading2, List, ListOrdered, Quote,
  AlertCircle, Lightbulb, HelpCircle, ChevronDown,
  Image as ImageIcon, Video, Headphones, Presentation,
  Minus, BookOpen, CheckCircle, XCircle, Highlighter,
} from "lucide-react";

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
  | "document";

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
  audioUrl?: string;
  documentUrl?: string;
  documentName?: string;
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
  fontFamily?: 'sans' | 'mono';
  borderStyle?: 'none' | 'thin' | 'bold' | 'dashed';
  borderRadius?: 'none' | 'md' | 'xl';
}

export interface BlockEditorProps {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  readOnly?: boolean;
  courseTitle?: string;
  lessonTitle?: string;
}

export const blockTypeConfig: Record<BlockType, { icon: any; label: string; color: string }> = {
  paragraph: { icon: Type, label: "Параграф", color: "text-foreground" },
  heading1: { icon: Heading1, label: "Заголовок 1", color: "text-foreground" },
  heading2: { icon: Heading2, label: "Заголовок 2", color: "text-foreground" },
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
  image: { icon: ImageIcon, label: "Изображение", color: "text-green-500" },
  video: { icon: Video, label: "Видео", color: "text-red-500" },
  audio: { icon: Headphones, label: "Аудио", color: "text-teal-500" },
  slider: { icon: Presentation, label: "Слайдер презентации", color: "text-orange-500" },
  divider: { icon: Minus, label: "Разделитель", color: "text-muted-foreground" },
  document: { icon: BookOpen, label: "Документ", color: "text-indigo-500" },
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
});

export const calloutItems = [
  { type: "callout-info" as BlockType, icon: AlertCircle, label: "Информация", color: "text-blue-500" },
  { type: "callout-warning" as BlockType, icon: AlertCircle, label: "Предупреждение", color: "text-amber-500" },
  { type: "callout-tip" as BlockType, icon: Lightbulb, label: "Совет", color: "text-green-500" },
  { type: "callout-success" as BlockType, icon: CheckCircle, label: "Выполнено", color: "text-emerald-500" },
  { type: "callout-danger" as BlockType, icon: XCircle, label: "Ошибка", color: "text-red-500" },
  { type: "highlight" as BlockType, icon: Highlighter, label: "Выделение", color: "text-yellow-500" },
  { type: "quote" as BlockType, icon: Quote, label: "Цитата", color: "text-muted-foreground" },
];

export const blockCategories = {
  text: {
    label: "Текст",
    items: [
      { type: "paragraph" as BlockType, icon: Type, label: "Параграф" },
      { type: "heading1" as BlockType, icon: Heading1, label: "Заголовок 1" },
      { type: "heading2" as BlockType, icon: Heading2, label: "Заголовок 2" },
      { type: "bulletList" as BlockType, icon: List, label: "Маркир. список" },
      { type: "numberedList" as BlockType, icon: ListOrdered, label: "Нумер. список" },
    ],
  },
  media: {
    label: "Медиа",
    items: [
      { type: "image" as BlockType, icon: ImageIcon, label: "Изображение", color: "text-green-500" },
      { type: "video" as BlockType, icon: Video, label: "Видео", color: "text-red-500" },
      { type: "audio" as BlockType, icon: Headphones, label: "Аудио", color: "text-teal-500" },
      { type: "slider" as BlockType, icon: Presentation, label: "Слайдер", color: "text-orange-500" },
      { type: "document" as BlockType, icon: BookOpen, label: "Документ", color: "text-indigo-500" },
    ],
  },
  other: {
    label: "Ещё",
    items: [
      { type: "accordion" as BlockType, icon: ChevronDown, label: "Свор. секция", color: "text-purple-500" },
      { type: "quiz" as BlockType, icon: HelpCircle, label: "Мини-квиз", color: "text-primary" },
      { type: "divider" as BlockType, icon: Minus, label: "Разделитель", color: "text-muted-foreground" },
    ],
  },
};

export const convertibleTypes: BlockType[] = ["paragraph", "heading1", "heading2", "bulletList", "numberedList", "quote", "callout-info", "callout-warning", "callout-tip", "callout-success", "callout-danger", "highlight", "accordion", "audio"];

export const textStyleableTypes: BlockType[] = ["paragraph", "heading1", "heading2", "bulletList", "numberedList", "quote", "callout-info", "callout-warning", "callout-tip", "callout-success", "callout-danger", "highlight"];

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
  { type: "accordion", icon: ChevronDown, label: "Сворачиваемая секция", color: "text-purple-500" },
  { type: "audio", icon: Headphones, label: "Аудио (TTS)", color: "text-teal-500" },
];
