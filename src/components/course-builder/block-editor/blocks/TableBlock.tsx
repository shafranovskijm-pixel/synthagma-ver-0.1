import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Minus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentBlock } from "../types";

export function TableBlock({ block, onUpdate }: { block: ContentBlock; onUpdate: (updates: Partial<ContentBlock>) => void }) {
  const rows = block.tableRows && block.tableRows.length > 0
    ? block.tableRows
    : [["", "", ""], ["", "", ""]];
  const hasHeader = block.tableHasHeader !== false;
  const colsCount = Math.max(...rows.map(r => r.length), 1);

  const updateCell = (rIdx: number, cIdx: number, value: string) => {
    const next = rows.map((r) => [...r]);
    while (next[rIdx].length < colsCount) next[rIdx].push("");
    next[rIdx][cIdx] = value;
    onUpdate({ tableRows: next });
  };

  const addRow = () => {
    onUpdate({ tableRows: [...rows, Array(colsCount).fill("")] });
  };
  const removeRow = (rIdx: number) => {
    if (rows.length <= 1) return;
    onUpdate({ tableRows: rows.filter((_, i) => i !== rIdx) });
  };
  const addColumn = () => {
    onUpdate({ tableRows: rows.map((r) => [...r, ""]) });
  };
  const removeColumn = (cIdx: number) => {
    if (colsCount <= 1) return;
    onUpdate({ tableRows: rows.map((r) => r.filter((_, i) => i !== cIdx)) });
  };

  return (
    <div className="py-2 space-y-2 not-prose">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse">
          <tbody>
            {rows.map((row, rIdx) => (
              <tr key={rIdx} className="group/row">
                {Array.from({ length: colsCount }).map((_, cIdx) => {
                  const isHeader = hasHeader && rIdx === 0;
                  return (
                    <td
                      key={cIdx}
                      className={cn(
                        "border border-border p-1 align-top relative",
                        isHeader && "bg-muted/50"
                      )}
                    >
                      <Input
                        value={row[cIdx] ?? ""}
                        onChange={(e) => updateCell(rIdx, cIdx, e.target.value)}
                        placeholder={isHeader ? `Колонка ${cIdx + 1}` : ""}
                        className={cn(
                          "h-8 border-0 bg-transparent text-sm focus-visible:ring-1 rounded",
                          isHeader && "font-semibold"
                        )}
                      />
                      {rIdx === 0 && (
                        <button
                          type="button"
                          onClick={() => removeColumn(cIdx)}
                          className="absolute -top-2 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-destructive/10 text-destructive opacity-0 group-hover/row:opacity-100 hover:bg-destructive/20 flex items-center justify-center transition-opacity"
                          title="Удалить колонку"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                      )}
                    </td>
                  );
                })}
                <td className="w-8 border-0 align-middle">
                  <button
                    type="button"
                    onClick={() => removeRow(rIdx)}
                    className="w-7 h-7 rounded-full text-muted-foreground hover:text-destructive opacity-0 group-hover/row:opacity-100 hover:bg-destructive/10 flex items-center justify-center transition-opacity"
                    title="Удалить строку"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={addRow} className="h-8 gap-1 text-xs">
          <Plus className="w-3 h-3" />Строку
        </Button>
        <Button variant="outline" size="sm" onClick={addColumn} className="h-8 gap-1 text-xs">
          <Plus className="w-3 h-3" />Колонку
        </Button>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground ml-2 cursor-pointer">
          <input
            type="checkbox"
            checked={hasHeader}
            onChange={(e) => onUpdate({ tableHasHeader: e.target.checked })}
            className="rounded border-border"
          />
          Первая строка — заголовок
        </label>
      </div>
    </div>
  );
}
