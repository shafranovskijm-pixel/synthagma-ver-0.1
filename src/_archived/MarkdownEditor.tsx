import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Link,
  Image,
  Code,
  Quote,
  Minus,
  Eye,
  Edit3,
  Columns,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onImageUpload?: () => void;
  placeholder?: string;
  className?: string;
}

const toolbarButtons = [
  { icon: Bold, label: "Жирный", prefix: "**", suffix: "**" },
  { icon: Italic, label: "Курсив", prefix: "_", suffix: "_" },
  { icon: Heading1, label: "Заголовок 1", prefix: "# ", suffix: "" },
  { icon: Heading2, label: "Заголовок 2", prefix: "## ", suffix: "" },
  { icon: List, label: "Список", prefix: "- ", suffix: "" },
  { icon: ListOrdered, label: "Нумерованный список", prefix: "1. ", suffix: "" },
  { icon: Quote, label: "Цитата", prefix: "> ", suffix: "" },
  { icon: Code, label: "Код", prefix: "`", suffix: "`" },
  { icon: Link, label: "Ссылка", prefix: "[", suffix: "](url)" },
  { icon: Minus, label: "Разделитель", prefix: "\n---\n", suffix: "" },
];

type ViewMode = "edit" | "preview" | "split";

export const MarkdownEditor = ({
  value,
  onChange,
  onImageUpload,
  placeholder = "Напишите содержание урока в формате Markdown...",
  className,
}: MarkdownEditorProps) => {
  const [viewMode, setViewMode] = useState<ViewMode>("split");

  const insertFormatting = useCallback(
    (prefix: string, suffix: string) => {
      const textarea = document.querySelector(
        "[data-markdown-editor]"
      ) as HTMLTextAreaElement;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = value.substring(start, end);
      const newText =
        value.substring(0, start) +
        prefix +
        selectedText +
        suffix +
        value.substring(end);

      onChange(newText);

      // Restore cursor position
      setTimeout(() => {
        textarea.focus();
        const newCursorPos = start + prefix.length + selectedText.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    },
    [value, onChange]
  );

  return (
    <div className={cn("border border-border rounded-xl overflow-hidden", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 p-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-1 flex-wrap">
          {toolbarButtons.map((btn, index) => (
            <Button
              key={index}
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => insertFormatting(btn.prefix, btn.suffix)}
              title={btn.label}
            >
              <btn.icon className="w-4 h-4" />
            </Button>
          ))}
          {onImageUpload && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={onImageUpload}
              title="Вставить изображение"
            >
              <Image className="w-4 h-4" />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <Button
            type="button"
            variant={viewMode === "edit" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 gap-1"
            onClick={() => setViewMode("edit")}
          >
            <Edit3 className="w-3 h-3" />
            <span className="hidden sm:inline text-xs">Редактор</span>
          </Button>
          <Button
            type="button"
            variant={viewMode === "split" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 gap-1"
            onClick={() => setViewMode("split")}
          >
            <Columns className="w-3 h-3" />
            <span className="hidden sm:inline text-xs">Разделить</span>
          </Button>
          <Button
            type="button"
            variant={viewMode === "preview" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 gap-1"
            onClick={() => setViewMode("preview")}
          >
            <Eye className="w-3 h-3" />
            <span className="hidden sm:inline text-xs">Превью</span>
          </Button>
        </div>
      </div>

      {/* Editor / Preview */}
      <div
        className={cn(
          "grid min-h-[400px]",
          viewMode === "split" ? "grid-cols-2" : "grid-cols-1"
        )}
      >
        {(viewMode === "edit" || viewMode === "split") && (
          <div className={cn(viewMode === "split" && "border-r border-border")}>
            <Textarea
              data-markdown-editor
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="min-h-[400px] border-0 rounded-none resize-none focus-visible:ring-0 font-mono text-sm"
            />
          </div>
        )}

        {(viewMode === "preview" || viewMode === "split") && (
          <div className="p-4 overflow-auto bg-background min-h-[400px]">
            {value ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm italic">
                Предпросмотр появится здесь...
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
