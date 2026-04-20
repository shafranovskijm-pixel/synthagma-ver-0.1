import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Code as CodeIcon } from "lucide-react";
import type { ContentBlock } from "../types";

const LANGUAGES = [
  "plaintext", "javascript", "typescript", "python", "java", "csharp", "cpp", "c",
  "go", "rust", "php", "ruby", "swift", "kotlin", "scala",
  "html", "css", "scss", "json", "yaml", "xml", "markdown",
  "sql", "bash", "powershell", "dockerfile",
];

export function CodeBlock({ block, onUpdate }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void }) {
  const language = block.codeLanguage || "plaintext";
  return (
    <div className="py-2 not-prose">
      <div className="rounded-lg border border-border overflow-hidden bg-muted/40">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/60">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CodeIcon className="w-3.5 h-3.5 text-green-600" />
            <span className="font-medium">Код</span>
          </div>
          <Select value={language} onValueChange={(v) => onUpdate({ codeLanguage: v })}>
            <SelectTrigger className="h-7 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l} value={l} className="text-xs">{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Textarea
          value={block.content || ""}
          onChange={(e) => onUpdate({ content: e.target.value })}
          placeholder="// Введите код..."
          spellCheck={false}
          className="font-mono text-sm border-0 rounded-none min-h-[140px] resize-y bg-background/40 focus-visible:ring-0"
        />
      </div>
    </div>
  );
}
